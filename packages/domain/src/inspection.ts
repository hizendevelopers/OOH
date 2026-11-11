import { z } from "zod";
import { brandEntry } from "./brand";

export const PHOTO_LIMIT = 6 * 1024 * 1024;
export const CHUNK_SIZE = 256 * 1024;
// Front and wide are required. Angle photos are optional extras, and a visit
// needs at least one of them, so every visit has at least three photographs.
export const photoKinds = ["front", "wide"] as const;
export const angleKinds = ["angle_1", "angle_2", "angle_3", "angle_4"] as const;
export const allPhotoKinds = [...photoKinds, ...angleKinds] as const;
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;
export type PhotoKind = (typeof allPhotoKinds)[number];
export const gpsSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000),
    observedAt: z.iso.datetime(),
  }),
  z.object({
    status: z.enum(["denied", "unavailable", "timeout"]),
    observedAt: z.iso.datetime(),
  }),
]);
export type GpsObservation = z.infer<typeof gpsSchema>;
export const photoMetadata = z.object({
  kind: z.enum(allPhotoKinds),
  bytes: z.number().int().min(1).max(PHOTO_LIMIT),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime(),
  captureMode: z.enum(["offline", "online_challenged", "online_unchallenged", "gallery_original"]),
  gps: gpsSchema,
  // Camera photos are checked by the device-side rules. Gallery originals are judged only by the
  // server, from the EXIF inside the original bytes; the browser's capturedAt and gps are advisory.
  source: z.enum(["camera", "gallery"]).optional(),
});
export const inspectionInput = z.object({
  operationId: z.uuid(),
  assignmentId: z.uuid(),
  faceId: z.uuid(),
  faceCode: z.string().min(3).max(48),
  assignmentVersion: z.number().int().positive(),
  challengeId: z.uuid().nullable(),
  // Optional so drafts queued before brand entry existed still synchronize.
  brand: brandEntry.nullable().optional(),
  photos: z
    .array(photoMetadata)
    .min(MIN_PHOTOS)
    .max(MAX_PHOTOS)
    .refine(
      (photos) => new Set(photos.map((p) => p.kind)).size === photos.length,
      "Each photograph must have a different kind",
    )
    .refine(
      (photos) => photos.some((p) => p.kind === "front") && photos.some((p) => p.kind === "wide"),
      "Front and wide context required",
    )
    .refine(
      (photos) => photos.some((p) => (angleKinds as readonly string[]).includes(p.kind)),
      "At least one additional angle photograph is required",
    )
    .refine(
      (photos) => photos.every((p) => (p.source === "gallery") === (p.captureMode === "gallery_original")),
      "Gallery photos and gallery capture mode must go together",
    ),
});
export type InspectionInput = z.infer<typeof inspectionInput>;
export type Receipt = {
  inspectionId: string;
  receiptId: string;
  receivedAt: string;
  status: "server_received";
  flags: string[];
};
export type VerificationReason = { code: string; severity: "reject" | "review"; detail?: string };
export type PhotoVerification = {
  status: "approved" | "rejected" | "needs_review";
  reasons: VerificationReason[];
};
export type UploadSession = {
  inspectionId: string;
  chunkSize: number;
  photos: {
    kind: PhotoKind;
    receivedParts: number[];
    receiptId: string | null;
    sha256?: string;
    source?: "camera" | "gallery";
    verification?: PhotoVerification | null;
  }[];
  receipt: Receipt | null;
};
export function retryDelay(attempt: number) {
  return Math.min(300000, 1000 * 2 ** Math.min(attempt, 9));
}
export function storageError(error: unknown) {
  return (error as { name?: string })?.name === "QuotaExceededError"
    ? "storage_full"
    : "storage_unavailable";
}
