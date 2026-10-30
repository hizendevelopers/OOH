import type { GpsObservation } from "../../../../packages/domain/src/inspection";

const setting = (
  value: string | undefined,
  fallback: number,
  maximum: number,
) => {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 && n <= maximum ? n : fallback;
};
export function locationPolicy() {
  return {
    baseRadiusM: setting(
      process.env.NEXT_PUBLIC_IBVS_LOCATION_RADIUS_M,
      100,
      1000,
    ),
    maxAccuracyM: setting(
      process.env.NEXT_PUBLIC_IBVS_LOCATION_MAX_ACCURACY_M,
      100,
      500,
    ),
    maxSourceUncertaintyM: setting(
      process.env.NEXT_PUBLIC_IBVS_LOCATION_MAX_SOURCE_UNCERTAINTY_M,
      100,
      500,
    ),
    maxCaptureAgeMs: setting(
      process.env.NEXT_PUBLIC_IBVS_LOCATION_MAX_AGE_MS,
      30000,
      60000,
    ),
  };
}
export type LocationPolicy = ReturnType<typeof locationPolicy>;
export function metresBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * rad) / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(((b.longitude - a.longitude) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function assessPhotoLocation(
  photo: { gps: GpsObservation; capturedAt: string },
  target: { latitude: number; longitude: number; uncertainty_m: number },
  policy = locationPolicy(),
): {
  status:
    | "within_area"
    | "missing"
    | "stale"
    | "low_accuracy"
    | "outside_area"
    | "source_uncertain";
  distanceM?: number;
  allowedDistanceM?: number;
} {
  if (photo.gps.status !== "ok") return { status: "missing" };
  const gps = photo.gps;
  if (
    ![
      gps.latitude,
      gps.longitude,
      gps.accuracy,
      target.latitude,
      target.longitude,
      target.uncertainty_m,
    ].every(Number.isFinite) ||
    gps.accuracy < 0 ||
    Math.abs(gps.latitude) > 90 ||
    Math.abs(gps.longitude) > 180
  )
    return { status: "missing" };
  const age = Math.abs(
    Date.parse(photo.capturedAt) - Date.parse(gps.observedAt),
  );
  if (!Number.isFinite(age) || age > policy.maxCaptureAgeMs)
    return { status: "stale" };
  const distanceM = metresBetween(gps, target);
  const allowedDistanceM =
    policy.baseRadiusM +
    Math.min(gps.accuracy, policy.maxAccuracyM) +
    Math.min(target.uncertainty_m, policy.maxSourceUncertaintyM);
  if (gps.accuracy > policy.maxAccuracyM)
    return { status: "low_accuracy", distanceM, allowedDistanceM };
  if (distanceM > allowedDistanceM)
    return { status: "outside_area", distanceM, allowedDistanceM };
  if (target.uncertainty_m > policy.maxSourceUncertaintyM)
    return { status: "source_uncertain", distanceM, allowedDistanceM };
  return { status: "within_area", distanceM, allowedDistanceM };
}
export const locationMessages = {
  within_area: "Within the expected billboard area",
  missing:
    "Location is missing. Enable location permission and retake this photo, or ask your supervisor for an exception.",
  stale:
    "Location is too old for this capture. Retake the photo to collect a fresh reading.",
  low_accuracy:
    "Location accuracy is poor. Move safely to an open area and retake, or ask your supervisor for an exception.",
  outside_area:
    "You are outside the expected billboard area. Confirm the billboard and retake, or ask your supervisor for an exception.",
  source_uncertain:
    "Registered coordinates need confirmation. Ask your supervisor to correct them or authorize an exception.",
};
export const locationMessagesAr: Record<keyof typeof locationMessages, string> =
  {
    within_area: "ضمن النطاق المتوقع للوحة",
    missing:
      "الموقع مفقود. اسمح بالوصول للموقع وأعد التقاط الصورة، أو اطلب استثناء من المشرف.",
    stale:
      "قراءة الموقع قديمة بالنسبة للصورة. أعد الالتقاط للحصول على قراءة حديثة.",
    low_accuracy:
      "دقة الموقع ضعيفة. انتقل بأمان لمكان مفتوح وأعد الالتقاط، أو اطلب استثناء من المشرف.",
    outside_area:
      "أنت خارج نطاق اللوحة المتوقع. تحقق من رمز اللوحة وأعد الالتقاط، أو اطلب استثناء من المشرف.",
    source_uncertain:
      "الإحداثيات المسجلة تحتاج تأكيداً. اطلب من المشرف تصحيحها أو منح استثناء.",
  };
