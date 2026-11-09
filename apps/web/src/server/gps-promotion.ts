import { IRAQ_POLYGONS } from "./iraq-boundary";
import { ApiError } from "./service";

// Server-side rules for promoting a field-captured position to a verified coordinate.
// Browser GPS coordinates and reported accuracy are untrusted claims. A promotion is allowed only when
// every rule below holds. A boundary exception is possible, but only with a documented, audited decision.

export const DEFAULT_PROMOTION_MAX_ACCURACY_M = 50;
// Pilot ceiling. A configured value above this is refused, so the threshold can only be tightened.
const CEILING_ACCURACY_M = 50;
export const BOUNDARY_EXCEPTION_MIN_REASON = 20;

// Reads the configured horizontal accuracy threshold. Anything invalid fails closed: no promotion is possible.
export function promotionMaxAccuracyM(env: Record<string, string | undefined> = process.env): number {
  const raw = env.IBVS_GPS_PROMOTION_MAX_ACCURACY_M;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PROMOTION_MAX_ACCURACY_M;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > CEILING_ACCURACY_M)
    throw new ApiError(503, "GPS promotion threshold is misconfigured; no promotions can be made until it is fixed");
  return value;
}

// Ray casting over every ring of every polygon. Holes flip the result, so a point in a hole is outside.
export function isInsideIraq(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  let inside = false;
  for (const polygon of IRAQ_POLYGONS) {
    for (const ring of polygon) {
      let crossings = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > latitude !== yj > latitude && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi)
          crossings = !crossings;
      }
      if (crossings) inside = !inside;
    }
  }
  return inside;
}

export type PromotionCheck =
  | { ok: true; insideIraq: boolean; boundaryException: boolean }
  | { ok: false; reason: string };

// Pure decision. Inputs are server-held values: the stored capture, the evidence check, and the exception decision.
export function decidePromotion(input: {
  latitude: number;
  longitude: number;
  accuracyM: number | null | undefined;
  maxAccuracyM: number;
  evidenceComplete: boolean;
  boundaryExceptionReason?: string | null;
}): PromotionCheck {
  if (input.accuracyM === null || input.accuracyM === undefined || !Number.isFinite(input.accuracyM))
    return { ok: false, reason: "The capture has no reported accuracy, so it cannot be promoted" };
  if (input.accuracyM < 0 || input.accuracyM > input.maxAccuracyM)
    return { ok: false, reason: `The capture accuracy (${Math.round(input.accuracyM)} m) is above the ${input.maxAccuracyM} m limit` };
  if (!input.evidenceComplete)
    return { ok: false, reason: "The visit does not have complete, server-received photo evidence" };
  const insideIraq = isInsideIraq(input.latitude, input.longitude);
  if (insideIraq) return { ok: true, insideIraq: true, boundaryException: false };
  const reason = (input.boundaryExceptionReason ?? "").trim();
  if (reason.length < BOUNDARY_EXCEPTION_MIN_REASON)
    return {
      ok: false,
      reason: `The position is outside the Iraq boundary. A boundary exception needs a documented reason of at least ${BOUNDARY_EXCEPTION_MIN_REASON} characters`,
    };
  return { ok: true, insideIraq: false, boundaryException: true };
}
