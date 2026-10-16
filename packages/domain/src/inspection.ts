import { z } from "zod";

export const PHOTO_LIMIT = 6 * 1024 * 1024;
export const CHUNK_SIZE = 256 * 1024;
export const photoKinds = ["front", "wide"] as const;
export type PhotoKind = (typeof photoKinds)[number];
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
  kind: z.enum(photoKinds),
  bytes: z.number().int().min(1).max(PHOTO_LIMIT),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.iso.datetime(),
  captureMode: z.enum(["offline", "online_challenged", "online_unchallenged"]),
  gps: gpsSchema,
});
export const inspectionInput = z.object({
  operationId: z.uuid(),
  assignmentId: z.uuid(),
  faceId: z.uuid(),
  faceCode: z.string().min(3).max(48),
  assignmentVersion: z.number().int().positive(),
  challengeId: z.uuid().nullable(),
  photos: z
    .array(photoMetadata)
    .length(2)
    .refine(
      (photos) => new Set(photos.map((p) => p.kind)).size === 2,
      "Front and wide context required",
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
export type UploadSession = {
  inspectionId: string;
  chunkSize: number;
  photos: {
    kind: PhotoKind;
    receivedParts: number[];
    receiptId: string | null;
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
