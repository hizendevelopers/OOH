import { describe, expect, it } from "vitest";
import { decidePromotion, isInsideIraq, promotionMaxAccuracyM, DEFAULT_PROMOTION_MAX_ACCURACY_M, BOUNDARY_EXCEPTION_MIN_REASON } from "../apps/web/src/server/gps-promotion";
import { IRAQ_BOUNDARY_SOURCE } from "../apps/web/src/server/iraq-boundary";

describe("vetted Iraq boundary", () => {
  it("records the source and checksum of the boundary it was built from", () => {
    expect(IRAQ_BOUNDARY_SOURCE.name).toBe("geoBoundaries IRQ ADM0");
    expect(IRAQ_BOUNDARY_SOURCE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("places field locations inside Iraq", () => {
    expect(isInsideIraq(33.3152, 44.3661)).toBe(true); // Baghdad
    expect(isInsideIraq(36.1911, 44.0092)).toBe(true); // Erbil
    expect(isInsideIraq(30.5085, 47.7835)).toBe(true); // Basra
    expect(isInsideIraq(35.8, 43.4)).toBe(true); // north of Mosul
  });

  it("places neighbouring capitals and the sea outside Iraq", () => {
    expect(isInsideIraq(35.6892, 51.389)).toBe(false); // Tehran
    expect(isInsideIraq(33.5138, 36.2765)).toBe(false); // Damascus
    expect(isInsideIraq(29.3759, 47.9774)).toBe(false); // Kuwait City
    expect(isInsideIraq(24.7136, 46.6753)).toBe(false); // Riyadh
    expect(isInsideIraq(30.0, 49.0)).toBe(false); // Persian Gulf
  });

  it("refuses non-finite and out-of-range coordinates", () => {
    expect(isInsideIraq(Number.NaN, 44)).toBe(false);
    expect(isInsideIraq(33, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInsideIraq(91, 44)).toBe(false);
    expect(isInsideIraq(33, 181)).toBe(false);
  });
});

describe("pilot accuracy threshold", () => {
  it("defaults to 50 metres", () => {
    expect(promotionMaxAccuracyM({})).toBe(DEFAULT_PROMOTION_MAX_ACCURACY_M);
    expect(DEFAULT_PROMOTION_MAX_ACCURACY_M).toBe(50);
  });

  it("can be tightened, but never loosened above 50 metres", () => {
    expect(promotionMaxAccuracyM({ IBVS_GPS_PROMOTION_MAX_ACCURACY_M: "30" })).toBe(30);
    expect(() => promotionMaxAccuracyM({ IBVS_GPS_PROMOTION_MAX_ACCURACY_M: "60" })).toThrow("misconfigured");
    expect(() => promotionMaxAccuracyM({ IBVS_GPS_PROMOTION_MAX_ACCURACY_M: "0" })).toThrow("misconfigured");
    expect(() => promotionMaxAccuracyM({ IBVS_GPS_PROMOTION_MAX_ACCURACY_M: "soon" })).toThrow("misconfigured");
  });
});

const base = { latitude: 33.3152, longitude: 44.3661, accuracyM: 12, maxAccuracyM: 50, evidenceComplete: true };
describe("promotion decision", () => {
  it("promotes an accurate, complete, in-boundary capture", () => {
    expect(decidePromotion(base)).toEqual({ ok: true, insideIraq: true, boundaryException: false });
  });

  it("refuses a missing accuracy, and a reading above the limit", () => {
    expect(decidePromotion({ ...base, accuracyM: null })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...base, accuracyM: undefined })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...base, accuracyM: Number.NaN })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...base, accuracyM: 50.1 })).toMatchObject({ ok: false, reason: expect.stringContaining("above the 50 m limit") });
    expect(decidePromotion({ ...base, accuracyM: -1 })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...base, accuracyM: 50 })).toMatchObject({ ok: true });
  });

  it("refuses a visit without complete server-received photo evidence", () => {
    expect(decidePromotion({ ...base, evidenceComplete: false })).toMatchObject({ ok: false, reason: expect.stringContaining("evidence") });
  });

  it("refuses an outside-boundary position unless a documented exception is given", () => {
    const outside = { ...base, latitude: 33.5138, longitude: 36.2765 };
    expect(decidePromotion(outside)).toMatchObject({ ok: false, reason: expect.stringContaining("outside the Iraq boundary") });
    expect(decidePromotion({ ...outside, boundaryExceptionReason: "too short" })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...outside, boundaryExceptionReason: "x".repeat(BOUNDARY_EXCEPTION_MIN_REASON - 1) })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...outside, boundaryExceptionReason: "Border crossing; supervisor confirmed the pin on site" })).toEqual({
      ok: true,
      insideIraq: false,
      boundaryException: true,
    });
  });

  it("does not let a boundary exception waive the accuracy or evidence rules", () => {
    const outside = { ...base, latitude: 33.5138, longitude: 36.2765, boundaryExceptionReason: "Border crossing; supervisor confirmed the pin on site" };
    expect(decidePromotion({ ...outside, accuracyM: 80 })).toMatchObject({ ok: false });
    expect(decidePromotion({ ...outside, evidenceComplete: false })).toMatchObject({ ok: false });
  });
});
