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
  target: {
    latitude: number | null;
    longitude: number | null;
    uncertainty_m: number | null;
  },
  policy = locationPolicy(),
): {
  status:
    | "within_area"
    | "first_capture"
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
  // No verified coordinate yet (pending GPS): only the reading itself can be checked here.
  // The server compares every photo of the visit before the inspection can be completed.
  if (target.latitude === null || target.longitude === null || target.uncertainty_m === null) {
    if (![gps.latitude, gps.longitude, gps.accuracy].every(Number.isFinite) || gps.accuracy < 0)
      return { status: "missing" };
    const pendingAge = Math.abs(Date.parse(photo.capturedAt) - Date.parse(gps.observedAt));
    if (!Number.isFinite(pendingAge) || pendingAge > policy.maxCaptureAgeMs) return { status: "stale" };
    if (gps.accuracy > policy.maxAccuracyM) return { status: "low_accuracy" };
    return { status: "first_capture" };
  }
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
  const distanceM = metresBetween(gps, { latitude: target.latitude, longitude: target.longitude });
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
  first_capture:
    "This billboard has no verified location yet. This reading will be recorded for the visit and checked against your other photos when you submit.",
  missing:
    "Location is not available. Turn on location for the browser, then take the photo again.",
  stale:
    "The GPS reading is too old. Wait a few seconds, then take the photo again.",
  low_accuracy:
    "The GPS signal is weak. Move to an open area, wait a few seconds, then take the photo again. If it still fails, ask your supervisor.",
  outside_area:
    "You seem to be too far from this billboard. Walk closer, check it is the right billboard, then take the photo again. If you cannot get closer, ask your supervisor.",
  source_uncertain:
    "This billboard's saved location needs checking. Tell your supervisor; you can still take the photos.",
};
export const locationMessagesAr: Record<keyof typeof locationMessages, string> =
  {
    within_area: "ضمن النطاق المتوقع للوحة",
    first_capture:
      "لا يوجد موقع موثّق لهذه اللوحة بعد. سيُسجَّل هذا القياس للزيارة وسيُقارن بباقي صورك عند الإرسال.",
    missing:
      "الموقع غير متاح. فعّل إذن الموقع للمتصفح ثم التقط الصورة مرة أخرى.",
    stale:
      "قراءة الموقع قديمة. انتظر بضع ثوانٍ ثم التقط الصورة مرة أخرى.",
    low_accuracy:
      "إشارة الموقع ضعيفة. انتقل إلى مكان مفتوح وانتظر بضع ثوانٍ ثم التقط الصورة مرة أخرى. إن استمرت المشكلة فاطلب مساعدة المشرف.",
    outside_area:
      "يبدو أنك بعيد عن هذه اللوحة. اقترب منها وتأكد أنها اللوحة الصحيحة ثم التقط الصورة مرة أخرى. إن تعذّر ذلك فاطلب مساعدة المشرف.",
    source_uncertain:
      "موقع هذه اللوحة المسجل يحتاج إلى مراجعة. أخبر المشرف؛ يمكنك متابعة التقاط الصور.",
  };
