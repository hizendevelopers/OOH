import { createHash, randomUUID, randomBytes } from "node:crypto";
import sharp from "sharp";
import type { Actor } from "@ibvs/domain";
import { distanceM, locationFlag } from "@ibvs/domain";
import {
  inspectionInput,
  CHUNK_SIZE,
  type InspectionInput,
  type UploadSession,
  type Receipt,
  type PhotoKind,
} from "../../../../packages/domain/src/inspection";
import { getDb, type Database } from "./db";
import { ApiError, audit } from "./service";
import { putPrivate, readPrivate } from "./evidence-storage";
import { assessInspection } from "./risk-analysis";

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
};
async function task(db: Database, actor: Actor, id: string) {
  if (actor.role !== "worker")
    throw new ApiError(403, "Worker access required");
  const [row] = await db.query<{
    id: string;
    face_id: string;
    code: string;
    version: number;
    status: string;
    latitude: number;
    longitude: number;
    uncertainty_m: number;
  }>(
    `SELECT a.*,f.code,c.latitude,c.longitude,c.uncertainty_m FROM assignments a JOIN billboard_faces f ON f.id=a.face_id JOIN source_coordinates c ON c.face_id=f.id JOIN worker_profiles w ON w.user_id=a.worker_id WHERE a.id=$1 AND a.organization_id=$2 AND a.worker_id=$3 AND w.active=true FOR UPDATE OF a`,
    [id, actor.organizationId, actor.id],
  );
  if (!row) throw new ApiError(404, "Assignment not found");
  return row;
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
  const photos = await db.query<Media>(
    "SELECT * FROM media_evidence WHERE inspection_id=$1 ORDER BY kind",
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
      if (
        existing.organization_id !== actor.organizationId ||
        existing.payload_hash !== digest
      )
        throw new ApiError(409, "Idempotency key payload conflict");
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
        "INSERT INTO media_evidence(id,inspection_id,kind,expected_bytes,expected_hash) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), id, photo.kind, photo.bytes, photo.sha256],
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
      "SELECT * FROM media_evidence WHERE inspection_id=$1 AND kind=$2",
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
      "SELECT * FROM media_evidence WHERE inspection_id=$1 AND kind=$2",
      [id, kind],
    );
    if (!photo) throw new ApiError(404, "Photo not found");
    if (photo.receipt_id) return { receiptId: photo.receipt_id };
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
    return { receiptId };
  });
}
export async function submitInspection(actor: Actor, id: string) {
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
    const media = await db.query<Media>(
      "SELECT * FROM media_evidence WHERE inspection_id=$1",
      [id],
    );
    if (media.length !== 2 || media.some((p) => !p.receipt_id))
      throw new ApiError(
        409,
        "Front and wide photographs must both have server receipts",
      );
    if (media[0].server_hash === media[1].server_hash)
      throw new ApiError(
        422,
        "Front and wide photographs must be separate captures",
      );
    const flags = new Set<string>([
      "browser_signals_untrusted",
      "human_review_required",
    ]);
    for (const p of row.metadata.photos) {
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
        flags.add(
          locationFlag(
            distanceM(p.gps, bound),
            p.gps.accuracy,
            bound.uncertainty_m,
          ),
        );
      }
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
      "SELECT m.id FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE m.inspection_id<>$1 AND m.server_hash=ANY($2::text[]) AND i.organization_id=$3",
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
    return {
      inspectionId: id,
      receiptId,
      receivedAt,
      status: "server_received" as const,
      flags: [...flags],
    };
  });
  try {
    await assessInspection(actor, id);
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
    `SELECT m.* FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE i.id=$1 AND m.kind=$2 AND i.organization_id=$3 AND ($4='admin' OR i.worker_id=$5)`,
    [id, kind, actor.organizationId, actor.role, actor.id],
  );
  if (!photo?.receipt_id || !photo.object_key)
    throw new ApiError(404, "Evidence not found");
  return readPrivate(photo.object_key);
}
