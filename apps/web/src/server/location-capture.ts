import { randomUUID } from "node:crypto";
import type { GpsObservation } from "../../../../packages/domain/src/inspection";
import {
  locationMessages,
  locationPolicy,
  metresBetween,
  type LocationPolicy,
} from "../field/location-policy";
import type { Database } from "./db";

// A location with no verified coordinate (pending GPS, approximate or to correct) is located by the
// visit itself. Every photo must carry a fresh, accurate GPS reading, and the readings must agree.
// The captured position is stored as inspection evidence. It never replaces source coordinates.

export type CapturePhoto = { kind: string; gps: GpsObservation; capturedAt: string };
export type FieldCapture = {
  latitude: number;
  longitude: number;
  accuracy_m: number;
  captured_at: string;
};
export type FieldCaptureResult =
  | { ok: true; capture: FieldCapture }
  | { ok: false; failures: { kind: string; status: keyof typeof locationMessages }[] };

export function assessFieldCapture(photos: CapturePhoto[], policy: LocationPolicy = locationPolicy()): FieldCaptureResult {
  if (!photos.length) return { ok: false, failures: [{ kind: "front", status: "missing" }] };
  const failures: { kind: string; status: keyof typeof locationMessages }[] = [];
  for (const photo of photos) {
    const gps = photo.gps;
    if (gps.status !== "ok") {
      failures.push({ kind: photo.kind, status: "missing" });
      continue;
    }
    if (![gps.latitude, gps.longitude, gps.accuracy].every(Number.isFinite) || gps.accuracy < 0) {
      failures.push({ kind: photo.kind, status: "missing" });
      continue;
    }
    const age = Math.abs(Date.parse(photo.capturedAt) - Date.parse(gps.observedAt));
    if (!Number.isFinite(age) || age > policy.maxCaptureAgeMs) {
      failures.push({ kind: photo.kind, status: "stale" });
      continue;
    }
    if (gps.accuracy > policy.maxAccuracyM) failures.push({ kind: photo.kind, status: "low_accuracy" });
  }
  if (failures.length) return { ok: false, failures };
  // The front photo anchors the capture. Other photos must agree with it within the allowed radius.
  const anchor = photos.find((p) => p.kind === "front") ?? photos[0]!;
  const anchorGps = anchor.gps as Extract<GpsObservation, { status: "ok" }>;
  for (const photo of photos) {
    const gps = photo.gps as Extract<GpsObservation, { status: "ok" }>;
    const allowed =
      policy.baseRadiusM + Math.min(anchorGps.accuracy, policy.maxAccuracyM) + Math.min(gps.accuracy, policy.maxAccuracyM);
    if (metresBetween(anchorGps, gps) > allowed) failures.push({ kind: photo.kind, status: "outside_area" });
  }
  if (failures.length) return { ok: false, failures };
  return {
    ok: true,
    capture: {
      latitude: anchorGps.latitude,
      longitude: anchorGps.longitude,
      accuracy_m: anchorGps.accuracy,
      captured_at: anchorGps.observedAt,
    },
  };
}

export async function insertFieldCapture(
  tx: Database,
  input: { organizationId: string; faceId: string; inspectionId: string; workerId: string; capture: FieldCapture },
) {
  await tx.query(
    "INSERT INTO location_field_captures(id,organization_id,face_id,inspection_id,worker_id,latitude,longitude,accuracy_m,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      randomUUID(),
      input.organizationId,
      input.faceId,
      input.inspectionId,
      input.workerId,
      input.capture.latitude,
      input.capture.longitude,
      input.capture.accuracy_m,
      input.capture.captured_at,
    ],
  );
}
