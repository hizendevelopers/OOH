import { describe, expect, it } from "vitest";
import { inspectionInput, MAX_PHOTOS } from "../packages/domain/src/inspection";

const photo = (kind: string) => ({
  kind,
  bytes: 1000,
  sha256: "a".repeat(64),
  capturedAt: new Date().toISOString(),
  captureMode: "offline" as const,
  gps: { status: "ok" as const, latitude: 30.5, longitude: 47.8, accuracy: 10, observedAt: new Date().toISOString() },
});
const submission = (kinds: string[]) => ({
  operationId: crypto.randomUUID(),
  assignmentId: crypto.randomUUID(),
  faceId: crypto.randomUUID(),
  faceCode: "TEST-ANGLE-001",
  assignmentVersion: 1,
  challengeId: null,
  photos: kinds.map((kind) => photo(kind)),
});

describe("photograph count rules", () => {
  it("accepts front, wide and one angle photograph", () => {
    expect(() => inspectionInput.parse(submission(["front", "wide", "angle_1"]))).not.toThrow();
  });
  it("accepts up to six photographs", () => {
    expect(MAX_PHOTOS).toBe(6);
    expect(() => inspectionInput.parse(submission(["front", "wide", "angle_1", "angle_2", "angle_3", "angle_4"]))).not.toThrow();
  });
  it("rejects two photographs, which lacks an angle", () => {
    expect(() => inspectionInput.parse(submission(["front", "wide"]))).toThrow();
  });
  it("rejects a visit without a wide photograph", () => {
    expect(() => inspectionInput.parse(submission(["front", "angle_1", "angle_2"]))).toThrow();
  });
  it("rejects a repeated kind", () => {
    expect(() => inspectionInput.parse(submission(["front", "wide", "angle_1", "angle_1"]))).toThrow();
  });
  it("rejects more than six photographs and unknown kinds", () => {
    expect(() => inspectionInput.parse(submission(["front", "wide", "angle_1", "angle_2", "angle_3", "angle_4", "angle_5"]))).toThrow();
    expect(() => inspectionInput.parse(submission(["front", "wide", "side"]))).toThrow();
  });
});
