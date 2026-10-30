import { afterEach, expect, it, vi } from "vitest";
import { assessPhotoLocation, locationPolicy, metresBetween } from "../apps/web/src/field/location-policy";

afterEach(() => vi.unstubAllEnvs());
const target = { latitude: 24.86, longitude: 67.01, uncertainty_m: 10 };
const capturedAt = "2026-10-30T10:00:00.000Z";
const photo = { capturedAt, gps: { status: "ok" as const, latitude: target.latitude, longitude: target.longitude, accuracy: 10, observedAt: capturedAt } };
it("accepts fresh accurate capture coordinates independent of later upload time", () => {
  expect(assessPhotoLocation(photo, target)).toMatchObject({ status: "within_area", distanceM: 0, allowedDistanceM: 120 });
  expect(metresBetween({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111195, -1);
});
it("requires a fresh reading for each photo and rejects denied, invalid and stale readings", () => {
  expect(assessPhotoLocation({ capturedAt, gps: { status: "denied", observedAt: capturedAt } }, target).status).toBe("missing");
  expect(assessPhotoLocation({ ...photo, gps: { ...photo.gps, latitude: NaN } }, target).status).toBe("missing");
  for (const offset of [-31000, 31000]) expect(assessPhotoLocation({ ...photo, gps: { ...photo.gps, observedAt: new Date(Date.parse(capturedAt) + offset).toISOString() } }, target).status).toBe("stale");
});
it("does not let poor accuracy or uncertain source coordinates automatically pass", () => {
  expect(assessPhotoLocation({ ...photo, gps: { ...photo.gps, accuracy: 101 } }, target).status).toBe("low_accuracy");
  expect(assessPhotoLocation({ ...photo, gps: { ...photo.gps, latitude: target.latitude + 0.1 } }, target).status).toBe("outside_area");
  expect(assessPhotoLocation(photo, { ...target, uncertainty_m: 101 }).status).toBe("source_uncertain");
});
it("bounds configured thresholds and falls back safely on invalid settings", () => {
  vi.stubEnv("NEXT_PUBLIC_IBVS_LOCATION_RADIUS_M", "200");
  expect(locationPolicy().baseRadiusM).toBe(200);
  for (const value of ["-1", "NaN", "Infinity", "100000", "0", ""]) {
    vi.stubEnv("NEXT_PUBLIC_IBVS_LOCATION_RADIUS_M", value);
    expect(locationPolicy().baseRadiusM).toBe(100);
  }
});
