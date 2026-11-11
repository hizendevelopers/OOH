import { createHash, randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Actor } from "@ibvs/domain";
import { distanceM, locationFlag, normalizeBrandKey } from "@ibvs/domain";
import {
  inspectionInput,
  CHUNK_SIZE,
  type InspectionInput,
  type UploadSession,
  type Receipt,
  type PhotoKind,
  type PhotoVerification,
} from "../../../../packages/domain/src/inspection";
import { getDb, type Database } from "./db";
import { ApiError, audit } from "./service";
import { putPrivate, readPrivate } from "./evidence-storage";
import { assessInspection } from "./risk-analysis";
import {
  assessPhotoLocation,
  locationMessages,
} from "../field/location-policy";
import { activeLocationException } from "./location-exceptions";
import { assessFieldCapture, insertFieldCapture } from "./location-capture";
import {
  decideGalleryPhoto,
  detectFormat,
  readExif,
  SITE_TIMEZONE,
  VERIFIER_VERSION,
  type Decision,
  type ImageFormat,
  type RawExif,
} from "./gallery-verification";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
type Inspection = {
  id: string;
  organization_id: string;
  assignment_id: string;
  worker_id: string;
  metadata: InspectionInput;
  payload_hash: string;
  status: string;
  challenge_id: string | null;
  receipt_id: string | null;
  received_at: Date | string | null;
  flags: string[];
};
type Media = {
  id: string;
  kind: PhotoKind;
  expected_bytes: number;
  expected_hash: string;
  receipt_id: string | null;
  object_key: string | null;
  server_hash: string | null;
  source?: "camera" | "gallery";
  original_format?: ImageFormat | null;
  superseded_at?: Date | string | null;
};
const EXIF_KEEP = [
  "DateTimeOriginal",
  "OffsetTimeOriginal",
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  "GPSDateStamp",
  "GPSTimeStamp",
] as const;
async function task(db: Database, actor: Actor, id: string) {
  if (actor.role !== "worker")
    throw new ApiError(403, "Worker access required");
  const [row] = await db.query<{
    id: string;
    face_id: string;
    code: string;
    version: number;
    status: string;
    latitude: number | null;
    longitude: number | null;
    uncertainty_m: number | null;
    gps_status: string | null;
  }>(
    `SELECT a.*,f.code,c.latitude,c.longitude,c.uncertainty_m,r.gps_status FROM assignments a JOIN billboard_faces f ON f.id=a.face_id LEFT JOIN effective_source_coordinates c ON c.face_id=f.id LEFT JOIN location_import_records r ON r.face_id=f.id JOIN worker_profiles w ON w.user_id=a.worker_id WHERE a.id=$1 AND a.organization_id=$2 AND a.worker_id=$3 AND w.active=true FOR UPDATE OF a`,
    [id, actor.organizationId, actor.id],
  );
  if (!row) throw new ApiError(404, "Assignment not found");
  return row;
}
async function enforcePhotoLocations(
  db: Database,
  actor: Actor,
  bound: Awaited<ReturnType<typeof task>>,
  photos: InspectionInput["photos"],
) {
  // Pending GPS: no verified coordinate exists yet, so the visit must supply valid GPS for every photo.
  // A supervisor exception cannot waive this, because nothing has been verified to compare against.
  if (bound.latitude === null || bound.longitude === null || bound.uncertainty_m === null) {
    const capture = assessFieldCapture(photos);
    if (!capture.ok)
      throw new ApiError(
        422,
        "This location has no verified GPS yet. " +
          capture.failures
            .map((f) => `${f.kind}: ${locationMessages[f.status]}`)
            .join(" "),
      );
    return { failures: [], exception: null, fieldCapture: capture.capture };
  }
  const target = {
    latitude: bound.latitude,
    longitude: bound.longitude,
    uncertainty_m: bound.uncertainty_m,
  };
  const failures = photos
    .map((photo) => ({
      kind: photo.kind,
      ...assessPhotoLocation(photo, target),
    }))
    .filter((result) => result.status !== "within_area");
  if (!failures.length) return { failures, exception: null, fieldCapture: null };
  const exception = await activeLocationException(
    db,
    actor,
    bound.id,
    bound.version,
  );
  if (!exception)
    throw new ApiError(
      422,
      failures
        .map((result) => `${result.kind}: ${locationMessages[result.status]}`)
        .join(" "),
    );
  return { failures, exception, fieldCapture: null };
}
async function owned(db: Database, actor: Actor, id: string, lock = false) {
  const [row] = await db.query<Inspection>(
    `SELECT * FROM inspections WHERE id=$1 AND organization_id=$2 AND worker_id=$3 ${lock ? "FOR UPDATE" : ""}`,
    [id, actor.organizationId, actor.id],
  );
  if (!row || actor.role !== "worker")
    throw new ApiError(404, "Inspection not found");
  return row;
}
function receipt(row: Inspection): Receipt | null {
  return row.receipt_id
    ? {
        inspectionId: row.id,
        receiptId: row.receipt_id,
        receivedAt: new Date(row.received_at!).toISOString(),
        status: "server_received",
        flags: row.flags,
      }
    : null;
}
async function session(db: Database, row: Inspection): Promise<UploadSession> {
  const photos = await db.query<
    Media & { verification_status: string | null; verification_reasons: unknown }
  >(
    "SELECT m.*, v.status AS verification_status, v.reason_codes AS verification_reasons FROM media_evidence m LEFT JOIN media_verification v ON v.media_id=m.id WHERE m.inspection_id=$1 AND m.superseded_at IS NULL ORDER BY m.kind",
    [row.id],
  );
  const result = [];
  for (const photo of photos) {
    const parts = await db.query<{ part: number }>(
      "SELECT part FROM evidence_parts WHERE media_id=$1 ORDER BY part",
      [photo.id],
    );
    result.push({
      kind: photo.kind,
      receivedParts: parts.map((p) => p.part),
      receiptId: photo.receipt_id,
      sha256: photo.expected_hash,
      source: photo.source ?? "camera",
      verification: photo.verification_status
        ? {
            status: photo.verification_status as PhotoVerification["status"],
            reasons: (photo.verification_reasons ?? []) as PhotoVerification["reasons"],
          }
        : null,
    });
  }
  return {
    inspectionId: row.id,
    chunkSize: CHUNK_SIZE,
    photos: result,
    receipt: receipt(row),
  };
}
export async function issueChallenge(actor: Actor, assignmentId: string) {
  return (await getDb()).transaction(async (db) => {
    const row = await task(db, actor, assignmentId);
    if (!["assigned", "resurvey_requested"].includes(row.status))
      throw new ApiError(409, "Assignment no longer accepts a survey");
    const recent = await db.query<{ count: number }>(
      "SELECT count(*)::int count FROM challenges WHERE worker_id=$1 AND issued_at>now()-interval '1 minute'",
      [actor.id],
    );
    if (recent[0].count >= 10)
      throw new ApiError(429, "Too many challenges; retry shortly");
    const id = randomUUID(),
      nonce = randomBytes(6).toString("hex").toUpperCase(),
      expiresAt = new Date(Date.now() + 300000).toISOString();
    await db.query(
      "INSERT INTO challenges(id,organization_id,assignment_id,worker_id,nonce,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
      [id, actor.organizationId, assignmentId, actor.id, nonce, expiresAt],
    );
    return { id, nonce, expiresAt };
  });
}
export async function beginInspection(actor: Actor, input: InspectionInput) {
  const payload = inspectionInput.parse(input);
  const digest = hash(JSON.stringify(payload));
  return (await getDb()).transaction(async (db) => {
    const bound = await task(db, actor, payload.assignmentId);
    const [existing] = await db.query<Inspection>(
      "SELECT * FROM inspections WHERE worker_id=$1 AND operation_id=$2",
      [actor.id, payload.operationId],
    );
    if (existing) {
      if (existing.organization_id !== actor.organizationId)
        throw new ApiError(409, "Idempotency key payload conflict");
      if (existing.payload_hash !== digest)
        return replaceRejectedGalleryPhotos(db, actor, existing, bound, payload, digest);
      return session(db, existing);
    }
    if (bound.face_id !== payload.faceId || bound.code !== payload.faceCode)
      throw new ApiError(409, "Locked billboard identity mismatch");
    if (
      bound.version !== payload.assignmentVersion ||
      !["assigned", "resurvey_requested"].includes(bound.status)
    )
      throw new ApiError(
        409,
        "Assignment changed; keep local evidence and contact administrator",
      );
    if (
      (
        await db.query("SELECT id FROM inspections WHERE assignment_id=$1", [
          bound.id,
        ])
      ).length
    )
      throw new ApiError(409, "A survey already exists for this assignment");
    if (payload.challengeId) {
      const [c] = await db.query(
        "SELECT id FROM challenges WHERE id=$1 AND assignment_id=$2 AND worker_id=$3 AND organization_id=$4",
        [payload.challengeId, bound.id, actor.id, actor.organizationId],
      );
      if (!c) throw new ApiError(422, "Challenge does not belong to this task");
    }
    // Gallery originals are judged by the server from their EXIF, so only camera photos use the device location gate.
    const cameraPhotos = payload.photos.filter((p) => p.source !== "gallery");
    if (cameraPhotos.length) await enforcePhotoLocations(db, actor, bound, cameraPhotos);
    const id = randomUUID();
    await db.query(
      "INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata,challenge_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        actor.organizationId,
        bound.id,
        bound.face_id,
        actor.id,
        payload.operationId,
        digest,
        JSON.stringify(payload),
        payload.challengeId,
      ],
    );
    for (const photo of payload.photos)
      await db.query(
        "INSERT INTO media_evidence(id,inspection_id,kind,expected_bytes,expected_hash,source) VALUES($1,$2,$3,$4,$5,$6)",
        [randomUUID(), id, photo.kind, photo.bytes, photo.sha256, photo.source ?? "camera"],
      );
    if (payload.brand)
      await db.query(
        "INSERT INTO brand_observations(id,organization_id,face_id,inspection_id,kind,observed_text,normalized_key,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          actor.organizationId,
          bound.face_id,
          id,
          payload.brand.kind,
          payload.brand.text,
          payload.brand.kind === "advertiser"
            ? normalizeBrandKey(payload.brand.text)
            : "",
          actor.id,
        ],
      );
    await audit(db, actor, "inspection.initiated", id, {
      assignmentId: bound.id,
    });
    return session(db, await owned(db, actor, id));
  });
}
export async function uploadPart(
  actor: Actor,
  id: string,
  kind: PhotoKind,
  part: number,
  data: Buffer,
) {
  return (await getDb()).transaction(async (db) => {
    const row = await owned(db, actor, id, true);
    await task(db, actor, row.assignment_id);
    const [photo] = await db.query<Media>(
      "SELECT * FROM media_evidence WHERE inspection_id=$1 AND kind=$2 AND superseded_at IS NULL",
      [id, kind],
    );
    if (!photo) throw new ApiError(404, "Photo not found");
    const expected = Math.min(
      CHUNK_SIZE,
      photo.expected_bytes - part * CHUNK_SIZE,
    );
    if (
      !Number.isInteger(part) ||
      part < 0 ||
      part >= Math.ceil(photo.expected_bytes / CHUNK_SIZE) ||
      data.length !== expected
    )
      throw new ApiError(422, "Invalid photo part or byte length");
    const digest = hash(data);
    const [existing] = await db.query<{ hash: string }>(
      "SELECT hash FROM evidence_parts WHERE media_id=$1 AND part=$2",
      [photo.id, part],
    );
    if (existing) {
      if (existing.hash !== digest)
        throw new ApiError(409, "Part replay has different bytes");
      return { part, received: true };
    }
    if (row.status !== "uploading" || photo.receipt_id)
      throw new ApiError(409, "Photo is already complete");
    const key = `${id}/${kind}/${part}-${digest}`;
    await putPrivate(key, data);
    await db.query(
      "INSERT INTO evidence_parts(media_id,part,hash,bytes,object_key) VALUES($1,$2,$3,$4,$5)",
      [photo.id, part, digest, data.length, key],
    );
    return { part, received: true };
  });
}
export async function completePhoto(actor: Actor, id: string, kind: PhotoKind) {
  return (await getDb()).transaction(async (db) => {
    const row = await owned(db, actor, id, true);
    await task(db, actor, row.assignment_id);
    const [photo] = await db.query<Media>(
      "SELECT * FROM media_evidence WHERE inspection_id=$1 AND kind=$2 AND superseded_at IS NULL",
      [id, kind],
    );
    if (!photo) throw new ApiError(404, "Photo not found");
    if (photo.receipt_id)
      return { receiptId: photo.receipt_id, verification: await storedVerification(db, photo.id) };
    const parts = await db.query<{
      part: number;
      object_key: string;
      hash: string;
    }>("SELECT * FROM evidence_parts WHERE media_id=$1 ORDER BY part", [
      photo.id,
    ]);
    if (
      parts.length !== Math.ceil(photo.expected_bytes / CHUNK_SIZE) ||
      parts.some((p, i) => p.part !== i)
    )
      throw new ApiError(409, "Photo upload is incomplete");
    const buffers = [];
    for (const p of parts) {
      const b = await readPrivate(p.object_key);
      if (hash(b) !== p.hash)
        throw new ApiError(409, "Stored part integrity check failed");
      buffers.push(b);
    }
    const bytes = Buffer.concat(buffers);
    if (
      bytes.length !== photo.expected_bytes ||
      hash(bytes) !== photo.expected_hash
    )
      throw new ApiError(422, "Photo integrity check failed");
    if (photo.source === "gallery")
      return completeGalleryPhoto(db, actor, row, photo, bytes);
    let dimensions;
    try {
      if (bytes[0] !== 255 || bytes[1] !== 216)
        throw new Error("JPEG required");
      const image = sharp(bytes, {
        limitInputPixels: 24000000,
        failOn: "warning",
      });
      dimensions = await image.metadata();
      if (
        dimensions.format !== "jpeg" ||
        !dimensions.width ||
        !dimensions.height ||
        Math.min(dimensions.width, dimensions.height) < 320
      )
        throw new Error("Dimensions");
      await image.stats();
    } catch {
      throw new ApiError(
        422,
        "Invalid JPEG; use camera photos at least 320px, up to 24 megapixels",
      );
    }
    const key = `${id}/${kind}/original-${photo.expected_hash}`;
    await putPrivate(key, bytes);
    const receiptId = randomUUID();
    await db.query(
      "UPDATE media_evidence SET server_hash=$1,object_key=$2,width=$3,height=$4,receipt_id=$5,received_at=now() WHERE id=$6",
      [
        photo.expected_hash,
        key,
        dimensions.width,
        dimensions.height,
        receiptId,
        photo.id,
      ],
    );
    return { receiptId, verification: null };
  });
}
export async function submitInspection(actor: Actor, id: string) {
  let newlyReceived = false;
  const result = await (
    await getDb()
  ).transaction(async (db) => {
    const row = await owned(db, actor, id, true);
    const bound = await task(db, actor, row.assignment_id);
    if (row.receipt_id) return receipt(row)!;
    if (
      bound.version !== row.metadata.assignmentVersion ||
      !["assigned", "resurvey_requested"].includes(bound.status)
    )
      throw new ApiError(
        409,
        "Assignment changed; submission retained for investigation",
      );
    const cameraPhotos = row.metadata.photos.filter((p) => p.source !== "gallery");
    const locationAssessment = cameraPhotos.length
      ? await enforcePhotoLocations(db, actor, bound, cameraPhotos)
      : { failures: [], exception: null, fieldCapture: null };
    const media = await db.query<Media>(
      "SELECT * FROM media_evidence WHERE inspection_id=$1 AND superseded_at IS NULL",
      [id],
    );
    if (media.length !== row.metadata.photos.length || media.some((p) => !p.receipt_id))
      throw new ApiError(
        409,
        "Every photograph must have a server receipt before submission",
      );
    // Gallery photos must each be approved by server verification before the visit can be received.
    const notApproved = await db.query<{ kind: string; status: string | null; reasons: unknown }>(
      "SELECT m.kind, v.status, v.reason_codes AS reasons FROM media_evidence m LEFT JOIN media_verification v ON v.media_id=m.id WHERE m.inspection_id=$1 AND m.superseded_at IS NULL AND m.source='gallery' AND (v.status IS DISTINCT FROM 'approved')",
      [id],
    );
    if (notApproved.length)
      throw new ApiError(
        422,
        "Some gallery photos did not pass verification. Replace them, then submit again.",
        {
          verification: notApproved.map((r) => ({
            kind: r.kind,
            status: r.status ?? "pending",
            reasons: r.reasons ?? [],
          })),
        },
      );
    if (new Set(media.map((p) => p.server_hash)).size !== media.length)
      throw new ApiError(
        422,
        "Each photograph must be a separate capture",
      );
    const flags = new Set<string>([
      "browser_signals_untrusted",
      "human_review_required",
    ]);
    if (locationAssessment.exception) {
      flags.add("location_supervisor_exception");
      flags.add(`location_exception:${locationAssessment.exception.id}`);
      for (const failure of locationAssessment.failures)
        flags.add(`location_${failure.kind}_${failure.status}`);
    }
    for (const p of row.metadata.photos) {
      // Gallery time and location come from the verified original, not from browser claims.
      if (p.source === "gallery") {
        flags.add("gallery_exif_checked_by_server");
        continue;
      }
      if (p.captureMode === "offline")
        flags.add("offline_capture_device_claim");
      if (p.captureMode === "online_unchallenged")
        flags.add("online_unchallenged");
      const captured = Date.parse(p.capturedAt);
      if (
        Math.abs(Date.now() - captured) > 86400000 ||
        captured > Date.now() + 300000
      )
        flags.add("device_clock_or_delayed_sync");
      if (p.gps.status !== "ok") {
        flags.add("gps_" + p.gps.status);
      } else {
        if (Math.abs(captured - Date.parse(p.gps.observedAt)) > 30000)
          flags.add("gps_stale_device_claim");
        if (p.gps.accuracy > 100) flags.add("gps_low_accuracy");
        if (bound.latitude !== null && bound.longitude !== null && bound.uncertainty_m !== null)
          flags.add(
            locationFlag(
              distanceM(p.gps, bound as { latitude: number; longitude: number }),
              p.gps.accuracy,
              bound.uncertainty_m,
            ),
          );
      }
    }
    if (locationAssessment.fieldCapture) {
      // The visit established the position. Stored as evidence; no source coordinate is changed.
      flags.add("pending_gps_first_capture");
      await insertFieldCapture(db, {
        organizationId: actor.organizationId,
        faceId: bound.face_id,
        inspectionId: id,
        workerId: actor.id,
        capture: locationAssessment.fieldCapture,
      });
    }
    if (row.challenge_id) {
      const [challenge] = await db.query<{
        issued_at: Date;
        expires_at: Date;
        consumed_by: string | null;
      }>("SELECT * FROM challenges WHERE id=$1 FOR UPDATE", [row.challenge_id]);
      if (challenge.consumed_by && challenge.consumed_by !== id)
        throw new ApiError(409, "Challenge already consumed");
      flags.add(
        new Date(challenge.expires_at).getTime() < Date.now()
          ? "challenge_expired_at_receipt"
          : "challenge_unexpired_at_receipt_not_capture_attestation",
      );
      await db.query("UPDATE challenges SET consumed_by=$1 WHERE id=$2", [
        id,
        row.challenge_id,
      ]);
    } else if (
      row.metadata.photos.some((p) => p.captureMode === "online_challenged")
    )
      flags.add("challenge_claim_missing");
    const duplicates = await db.query(
      "SELECT m.id FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE m.inspection_id<>$1 AND m.server_hash=ANY($2::text[]) AND i.organization_id=$3 AND m.superseded_at IS NULL",
      [id, media.map((m) => m.server_hash), actor.organizationId],
    );
    if (duplicates.length) flags.add("duplicate_photo_candidate");
    const receiptId = randomUUID(),
      receivedAt = new Date().toISOString();
    await db.query(
      "UPDATE inspections SET status='server_received',receipt_id=$1,received_at=$2,flags=$3 WHERE id=$4",
      [receiptId, receivedAt, JSON.stringify([...flags]), id],
    );
    await db.query(
      "UPDATE assignments SET status='server_received',version=version+1 WHERE id=$1",
      [row.assignment_id],
    );
    await audit(db, actor, "inspection.server_received", id, {
      receiptId,
      flags: [...flags],
    });
    await db.query(
      "INSERT INTO review_cases(inspection_id,organization_id) VALUES($1,$2) ON CONFLICT(inspection_id) DO NOTHING",
      [id, actor.organizationId],
    );
    newlyReceived = true;
    return {
      inspectionId: id,
      receiptId,
      receivedAt,
      status: "server_received" as const,
      flags: [...flags],
    };
  });
  try {
    // Receipt replay is cheap and immutable. Explicit supervisor reanalysis
    // remains available when new evidence or risk context needs reconsidering.
    if (newlyReceived) await assessInspection(actor, id);
  } catch {
    console.error(
      JSON.stringify({ category: "risk_analysis_pending", inspectionId: id }),
    );
  }
  return result;
}
export async function inspectionStatus(actor: Actor, id: string) {
  const db = await getDb();
  return session(db, await owned(db, actor, id));
}
export async function inspectionHistory(actor: Actor) {
  return (await getDb()).query(
    "SELECT id,assignment_id,status,receipt_id,received_at,flags FROM inspections WHERE organization_id=$1 AND ($2='admin' OR worker_id=$3) ORDER BY created_at DESC LIMIT 200",
    [actor.organizationId, actor.role, actor.id],
  );
}
export async function evidenceAccess(
  actor: Actor,
  id: string,
  kind: PhotoKind,
) {
  const db = await getDb();
  const [photo] = await db.query<Media>(
    `SELECT m.* FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE i.id=$1 AND m.kind=$2 AND i.organization_id=$3 AND ($4='admin' OR i.worker_id=$5) AND m.superseded_at IS NULL`,
    [id, kind, actor.organizationId, actor.role, actor.id],
  );
  if (!photo?.receipt_id || !photo.object_key)
    throw new ApiError(404, "Evidence not found");
  return readPrivate(photo.object_key);
}

// ----- Gallery originals: server-side EXIF verification -----

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function whitelistExif(exif: RawExif) {
  const kept: Record<string, unknown> = {};
  for (const key of EXIF_KEEP) {
    const value = exif[key];
    if (value !== undefined && value !== null) kept[key] = value;
  }
  return kept;
}

async function storedVerification(db: Database, mediaId: string) {
  const [row] = await db.query<{ status: string; reasons: unknown }>(
    "SELECT status, reason_codes AS reasons FROM media_verification WHERE media_id=$1",
    [mediaId],
  );
  return row
    ? { status: row.status as PhotoVerification["status"], reasons: row.reasons as PhotoVerification["reasons"] }
    : null;
}

// Verifies one gallery original after its bytes are complete. The original is stored unchanged first;
// the decision is then appended. A rejected original stays as evidence, but it blocks submission.
async function completeGalleryPhoto(
  db: Database,
  actor: Actor,
  row: Inspection,
  photo: Media,
  bytes: Buffer,
) {
  const bound = await task(db, actor, row.assignment_id);
  const detected = detectFormat(bytes);
  let format: ImageFormat | null = null;
  let exif: RawExif = {};
  if (detected) {
    try {
      exif = await readExif(bytes);
      format = detected;
    } catch {
      format = null;
    }
  }
  // Visit window: from the assignment's start (site calendar date) to its due date.
  const [visit] = await db.query<{ start_date: string; end_date: string }>(
    "SELECT to_char(created_at AT TIME ZONE $2,'YYYY-MM-DD') AS start_date, due_date::text AS end_date FROM assignments WHERE id=$1",
    [bound.id, SITE_TIMEZONE],
  );
  const [duplicate] = await db.query<{ id: string }>(
    "SELECT m.id FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE m.id<>$1 AND m.expected_hash=$2 AND i.organization_id=$3 AND m.superseded_at IS NULL AND i.status='server_received' LIMIT 1",
    [photo.id, photo.expected_hash, actor.organizationId],
  );
  const uploadedAtMs = Date.now();
  const decision: Decision = decideGalleryPhoto({
    format,
    exif,
    uploadedAtMs,
    nowMs: uploadedAtMs,
    visitWindow: { startDate: visit.start_date, endDate: visit.end_date },
    site: { latitude: bound.latitude, longitude: bound.longitude, uncertaintyM: bound.uncertainty_m },
    ownership: {
      workerMatches: row.worker_id === actor.id,
      assignmentMatches: row.assignment_id === bound.id,
    },
    duplicate: duplicate ? "exact" : "none",
  });
  const key = `${row.id}/${photo.kind}/original-${photo.expected_hash}`;
  await putPrivate(key, bytes);
  const receiptId = randomUUID();
  await db.query(
    "UPDATE media_evidence SET server_hash=$1,object_key=$2,receipt_id=$3,received_at=now(),original_format=$4 WHERE id=$5",
    [photo.expected_hash, key, receiptId, format, photo.id],
  );
  await db.query(
    "INSERT INTO media_verification(id,media_id,organization_id,verifier_version,status,reason_codes,exif,capture_local_date,capture_local_time,capture_offset,capture_timezone,capture_at,photo_latitude,photo_longitude,site_latitude,site_longitude,site_coordinate_source,distance_m,uploaded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
    [
      randomUUID(),
      photo.id,
      actor.organizationId,
      VERIFIER_VERSION,
      decision.status,
      JSON.stringify(decision.reasons),
      JSON.stringify(whitelistExif(exif)),
      decision.capture.localDate,
      decision.capture.localTime,
      decision.capture.offset,
      decision.capture.timezone,
      decision.capture.instant,
      decision.photo.latitude,
      decision.photo.longitude,
      bound.latitude,
      bound.longitude,
      bound.latitude !== null ? "effective_source_coordinates" : null,
      decision.distanceM,
      new Date(uploadedAtMs).toISOString(),
    ],
  );
  await audit(db, actor, "gallery.verified", photo.id, {
    kind: photo.kind,
    status: decision.status,
    reasons: decision.reasons.map((r) => r.code),
  });
  return {
    receiptId,
    verification: { status: decision.status, reasons: decision.reasons } as PhotoVerification,
  };
}

// Same assignment, same visit, but the worker replaced a gallery photo the server rejected (or has not
// yet judged). Accepted photos cannot be changed. Old rows are kept and marked superseded.
async function replaceRejectedGalleryPhotos(
  db: Database,
  actor: Actor,
  existing: Inspection,
  bound: Awaited<ReturnType<typeof task>>,
  payload: InspectionInput,
  digest: string,
) {
  if (existing.receipt_id || existing.status !== "uploading")
    throw new ApiError(409, "Idempotency key payload conflict");
  if (
    bound.version !== existing.metadata.assignmentVersion ||
    !["assigned", "resurvey_requested"].includes(bound.status)
  )
    throw new ApiError(409, "Assignment changed; keep local evidence and contact administrator");
  const strip = (value: InspectionInput | InspectionInput["photos"] | object) => ({
    ...(value as object),
    photos: undefined,
  });
  if (canonical(strip(payload)) !== canonical(strip(existing.metadata)))
    throw new ApiError(409, "Idempotency key payload conflict");
  const current = await db.query<Media & { verification_status: string | null }>(
    "SELECT m.*, v.status AS verification_status FROM media_evidence m LEFT JOIN media_verification v ON v.media_id=m.id WHERE m.inspection_id=$1 AND m.superseded_at IS NULL",
    [existing.id],
  );
  const byKind = new Map(current.map((m) => [m.kind, m]));
  const replaced: string[] = [];
  for (const photo of payload.photos) {
    const old = byKind.get(photo.kind);
    if (!old) throw new ApiError(409, "Photo kinds cannot change after upload began");
    if (old.expected_hash === photo.sha256) continue;
    if (
      old.source !== "gallery" ||
      photo.source !== "gallery" ||
      old.verification_status === "approved"
    )
      throw new ApiError(409, `The ${photo.kind} photo was already accepted and cannot be replaced`);
    await db.query("UPDATE media_evidence SET superseded_at=now() WHERE id=$1", [old.id]);
    await db.query(
      "INSERT INTO media_evidence(id,inspection_id,kind,expected_bytes,expected_hash,source) VALUES($1,$2,$3,$4,$5,'gallery')",
      [randomUUID(), existing.id, photo.kind, photo.bytes, photo.sha256],
    );
    replaced.push(photo.kind);
  }
  if (replaced.length) {
    await db.query("UPDATE inspections SET metadata=$1,payload_hash=$2 WHERE id=$3", [
      JSON.stringify(payload),
      digest,
      existing.id,
    ]);
    await audit(db, actor, "inspection.gallery_photo_replaced", existing.id, { kinds: replaced });
  }
  return session(db, await owned(db, actor, existing.id));
}
