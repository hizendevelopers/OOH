import { randomUUID } from "node:crypto";
import { getDb, type Database } from "./db";
import { ApiError, audit } from "./service";
import { readPrivate } from "./evidence-storage";
import { imageAnalysis, IMAGE_ALGORITHM, sha256 } from "./image-analysis";
import { spatialEngine, geoDistance, nearbyFaces } from "./spatial";
import {
  inspectionInput,
  type InspectionInput,
} from "../../../../packages/domain/src/inspection";
import {
  RULE_VERSION,
  signal,
  summarize,
  hamming,
  travelSignal,
  type RiskSignal,
  type RiskReport,
  type PhotoFacts,
  type SpatialObservation,
} from "../../../../packages/domain/src/risk";
import type { Actor } from "@ibvs/domain";
import { admitAnalysis } from "./analysis-admission";

export type ReviewInspection = {
  id: string;
  organization_id: string;
  assignment_id: string;
  face_id: string;
  worker_id: string;
  metadata: InspectionInput;
  received_at: string | Date;
  created_at: string | Date;
  receipt_id: string;
  flags: string[];
  code: string;
  structure_code: string;
  city: string;
  zone: string;
  orientation: string;
  is_test: boolean;
  latitude: number;
  longitude: number;
  uncertainty_m: number;
  original_latitude: number;
  original_longitude: number;
  original_uncertainty_m: number;
  worker_name: string;
  assigned_face_id: string;
  parent_inspection_id: string | null;
};
export async function inspectionRecord(
  organizationId: string,
  id: string,
): Promise<ReviewInspection> {
  const [row] = await (
    await getDb()
  ).query<ReviewInspection>(
    `SELECT i.*,a.face_id assigned_face_id,a.parent_inspection_id,f.code,s.code structure_code,s.city,s.zone,f.orientation,f.is_test,c.latitude,c.longitude,c.uncertainty_m,c.original_latitude,c.original_longitude,c.original_uncertainty_m,u.name worker_name FROM inspections i JOIN assignments a ON a.id=i.assignment_id JOIN billboard_faces f ON f.id=i.face_id JOIN billboard_structures s ON s.id=f.structure_id JOIN effective_source_coordinates c ON c.face_id=f.id JOIN "user" u ON u.id=i.worker_id WHERE i.id=$1 AND i.organization_id=$2 AND i.status='server_received'`,
    [id, organizationId],
  );
  if (!row) throw new ApiError(404, "Received inspection not found");
  return row;
}
export async function assessInspection(
  actor: Actor,
  id: string,
): Promise<RiskReport> {
  const db = await getDb(),
    row = await inspectionRecord(actor.organizationId, id);
  if (actor.role !== "admin" && row.worker_id !== actor.id)
    throw new ApiError(404, "Inspection not found");
  const release = await admitAnalysis(db, actor);
  try {
    return await analyzeReceivedInspection(db, actor, id, row);
  } finally {
    await release();
  }
}
async function analyzeReceivedInspection(
  db: Database,
  actor: Actor,
  id: string,
  row: ReviewInspection,
): Promise<RiskReport> {
  const signals: RiskSignal[] = [
    signal("human_review_required", "info", {
      reason:
        "No browser signal establishes genuine capture or exact face identity",
    }),
  ];
  const parsed = inspectionInput.safeParse(row.metadata);
  if (
    !parsed.success ||
    row.assigned_face_id !== row.face_id ||
    row.metadata.faceId !== row.face_id ||
    row.metadata.faceCode !== row.code ||
    row.metadata.assignmentId !== row.assignment_id
  )
    signals.push(
      signal(
        "task_binding_mismatch",
        "critical",
        { inspectionId: id, faceCode: row.code },
        { blocksApproval: true },
      ),
    );
  const media = await db.query<{
    id: string;
    kind: string;
    server_hash: string;
    object_key: string | null;
    receipt_id: string | null;
  }>("SELECT * FROM media_evidence WHERE inspection_id=$1 ORDER BY kind", [id]);
  if (
    media.length !== 2 ||
    !media.some((m) => m.kind === "front") ||
    !media.some((m) => m.kind === "wide") ||
    media.some((m) => !m.receipt_id)
  )
    signals.push(
      signal(
        "missing_evidence",
        "critical",
        {
          receivedKinds: media.filter((m) => m.receipt_id).map((m) => m.kind),
        },
        { blocksApproval: true },
      ),
    );
  const photos: PhotoFacts[] = [];
  for (const m of media) {
    try {
      if (!m.object_key) throw new Error("Missing object");
      const bytes = await readPrivate(m.object_key),
        facts = await imageAnalysis(bytes),
        integrity = facts.sha256 === m.server_hash;
      photos.push({
        ...facts,
        kind: m.kind,
        mediaId: m.id,
        valid: true,
        integrity,
      });
      if (!integrity)
        signals.push(
          signal(
            "integrity_failure",
            "critical",
            { kind: m.kind, reason: "server_hash_mismatch" },
            { blocksApproval: true },
          ),
        );
      else
        await db.query(
          "INSERT INTO media_analysis(media_id,algorithm,verified_hash,phash,facts) VALUES($1,$2,$3,$4,$5) ON CONFLICT(media_id) DO NOTHING",
          [
            m.id,
            IMAGE_ALGORITHM,
            facts.sha256,
            facts.phash,
            JSON.stringify(facts),
          ],
        );
      if (Math.min(facts.width, facts.height) < 720)
        signals.push(
          signal("low_resolution", "medium", {
            kind: m.kind,
            width: facts.width,
            height: facts.height,
            minimumSuggestedShortEdge: 720,
          }),
        );
      if (
        facts.deviation < 12 ||
        facts.edgeEnergy < 20 ||
        facts.mean < 25 ||
        facts.mean > 235
      )
        signals.push(
          signal("poor_quality", "medium", {
            kind: m.kind,
            mean: round(facts.mean),
            deviation: round(facts.deviation),
            edgeEnergy: round(facts.edgeEnergy),
            thresholds: {
              minDeviation: 12,
              minEdgeEnergy: 20,
              minMean: 25,
              maxMean: 235,
            },
            note: "Heuristic detail/exposure warning, not a calibrated quality classifier",
          }),
        );
    } catch {
      photos.push({
        kind: m.kind,
        mediaId: m.id,
        width: 0,
        height: 0,
        sha256: m.server_hash || "",
        phash: "",
        mean: 0,
        deviation: 0,
        edgeEnergy: 0,
        valid: false,
        integrity: false,
      });
      signals.push(
        signal(
          "integrity_failure",
          "critical",
          { kind: m.kind, reason: "missing_or_invalid_private_JPEG" },
          { blocksApproval: true },
        ),
      );
    }
  }
  const duplicates = await db.query<{
    inspection_id: string;
    worker_id: string;
    code: string;
    kind: string;
    verified_hash: string;
    phash: string;
  }>(
    `SELECT m.inspection_id,i.worker_id,f.code,m.kind,m.server_hash verified_hash,coalesce(a.phash,'') phash FROM media_evidence m LEFT JOIN media_analysis a ON a.media_id=m.id JOIN inspections i ON i.id=m.inspection_id JOIN billboard_faces f ON f.id=i.face_id WHERE i.organization_id=$1 AND i.id<>$2 AND i.status='server_received' ORDER BY i.created_at DESC,i.id,m.kind LIMIT 10001`,
    [actor.organizationId, id],
  );
  if (duplicates.length > 10000)
    signals.push(
      signal(
        "analysis_scope_limited",
        "high",
        { area: "photo_candidates", limit: 10000 },
        { independent: true },
      ),
    );
  for (const p of photos.filter((p) => p.valid && p.integrity)) {
    const allExact = duplicates.filter((d) => d.verified_hash === p.sha256);
    const exact = allExact.slice(0, 20);
    if (exact.length) {
      signals.push(
        signal(
          "exact_duplicate",
          "high",
          {
            kind: p.kind,
            matches: exact.map((d) => ({
              inspectionId: d.inspection_id,
              faceCode: d.code,
              workerId: d.worker_id,
            })),
          },
          { independent: true },
        ),
      );
      if (allExact.some((d) => d.worker_id !== row.worker_id))
        signals.push(
          signal(
            "cross_worker_duplicate",
            "high",
            {
              kind: p.kind,
              inspectionIds: allExact
                .filter((d) => d.worker_id !== row.worker_id)
                .slice(0, 20)
                .map((d) => d.inspection_id),
            },
            { independent: true },
          ),
        );
    }
    const similar = duplicates
      .map((d) => ({ ...d, hamming: hamming(p.phash, d.phash) }))
      .filter((d) => d.verified_hash !== p.sha256 && d.hamming <= 8)
      .sort((a, b) => a.hamming - b.hamming)
      .slice(0, 20);
    if (similar.length)
      signals.push(
        signal("perceptual_similarity", "medium", {
          kind: p.kind,
          algorithm: IMAGE_ALGORITHM,
          thresholdHamming: 8,
          matches: similar.map((d) => ({
            inspectionId: d.inspection_id,
            faceCode: d.code,
            workerId: d.worker_id,
            hamming: d.hamming,
          })),
          note: "Similar advertisement creative can be legitimate; compare structure/context",
        }),
      );
  }
  const engine = await spatialEngine(db),
    candidates = await nearbyFaces(
      db,
      actor.organizationId,
      row.face_id,
      row,
      engine,
    );
  if (candidates.length)
    signals.push(
      signal(
        "neighboring_faces",
        "high",
        {
          sourceUncertaintyM: row.uncertainty_m,
          candidates: candidates.map((c) => ({
            id: c.id,
            code: c.code,
            distanceM: round(c.distanceM),
            orientation: c.orientation,
          })),
          search: "150m plus both source uncertainty radii",
        },
        { independent: true },
      ),
    );
  const observations: SpatialObservation[] = [];
  if (candidates.length >= 101)
    signals.push(
      signal(
        "analysis_scope_limited",
        "high",
        { area: "neighboring_faces", limit: 101 },
        { independent: true },
      ),
    );
  const captured = parsed.success ? parsed.data.photos : [];
  for (const photo of captured) {
    const time = Date.parse(photo.capturedAt),
      receiptTime = new Date(row.received_at).getTime(),
      delta = receiptTime - time;
    if (delta > 86400000 || delta < -300000)
      signals.push(
        signal("capture_receipt_discrepancy", "medium", {
          kind: photo.kind,
          claimedCaptureTime: photo.capturedAt,
          serverReceivedTime: new Date(row.received_at).toISOString(),
          differenceSeconds: round(delta / 1000),
          offlineCapture: photo.captureMode === "offline",
        }),
      );
    if (photo.captureMode === "offline")
      signals.push(
        signal("offline_capture", "low", {
          kind: photo.kind,
          claim: "device_reported_connectivity_and_time",
        }),
      );
    else if (
      photo.captureMode === "online_challenged" &&
      row.flags.includes(
        "challenge_unexpired_at_receipt_not_capture_attestation",
      )
    )
      signals.push(
        signal("online_challenged", "info", {
          kind: photo.kind,
          meaning:
            "challenge unexpired at receipt; not proof of camera presence",
        }),
      );
    else
      signals.push(
        signal("unchallenged_capture", "low", {
          kind: photo.kind,
          claimedMode: photo.captureMode,
        }),
      );
    if (photo.gps.status !== "ok") {
      signals.push(
        signal("gps_missing", "medium", {
          kind: photo.kind,
          status: photo.gps.status,
        }),
      );
      continue;
    }
    const gps = photo.gps,
      distance = await geoDistance(db, gps, row, engine);
    observations.push({ kind: photo.kind, ...gps, distanceM: distance });
    if (gps.accuracy > 100)
      signals.push(
        signal("gps_low_accuracy", "medium", {
          kind: photo.kind,
          accuracyM: gps.accuracy,
          thresholdM: 100,
        }),
      );
    if (distance > gps.accuracy + row.uncertainty_m)
      signals.push(
        signal(
          "gps_mismatch",
          "high",
          {
            kind: photo.kind,
            distanceM: round(distance),
            accuracyM: gps.accuracy,
            sourceUncertaintyM: row.uncertainty_m,
            spatialEngine: engine,
          },
          { independent: true },
        ),
      );
    if (Math.abs(time - Date.parse(gps.observedAt)) > 30000)
      signals.push(
        signal("gps_stale", "medium", {
          kind: photo.kind,
          claimedCaptureTime: photo.capturedAt,
          claimedGpsTime: gps.observedAt,
          thresholdSeconds: 30,
        }),
      );
  }
  if (row.flags.includes("challenge_expired_at_receipt"))
    signals.push(
      signal("challenge_expired", "medium", {
        reason:
          "Receipt after server challenge expiry; offline capture time is not attested",
      }),
    );
  const previous = await db.query<{ id: string; metadata: InspectionInput }>(
    "SELECT id,metadata FROM inspections WHERE organization_id=$1 AND worker_id=$2 AND id<>$3 AND status='server_received' ORDER BY received_at DESC,id LIMIT 501",
    [actor.organizationId, row.worker_id, id],
  );
  if (previous.length > 500)
    signals.push(
      signal(
        "analysis_scope_limited",
        "high",
        { area: "worker_capture_history", limit: 500 },
        { independent: true },
      ),
    );
  for (const old of previous.slice(0, 500)) {
    const valid = inspectionInput.safeParse(old.metadata);
    if (!valid.success) continue;
    const a = captured.find((p) => p.gps.status === "ok"),
      b = valid.data.photos.find((p) => p.gps.status === "ok");
    if (!a || !b || a.gps.status !== "ok" || b.gps.status !== "ok") continue;
    const aTimes = captured.map((p) => Date.parse(p.capturedAt)),
      bTimes = valid.data.photos.map((p) => Date.parse(p.capturedAt));
    const overlap =
      Math.max(Math.min(...aTimes), Math.min(...bTimes)) <=
      Math.min(Math.max(...aTimes), Math.max(...bTimes));
    const temporalGap = overlap
      ? 0
      : Math.max(Math.min(...aTimes), Math.min(...bTimes)) -
        Math.min(Math.max(...aTimes), Math.max(...bTimes));
    const travel = travelSignal(
      await geoDistance(db, a.gps, b.gps, engine),
      a.gps.accuracy,
      b.gps.accuracy,
      temporalGap / 1000,
      overlap,
    );
    if (travel)
      signals.push({
        ...travel,
        evidence: { ...travel.evidence, otherInspectionId: old.id },
      });
  }
  const base = {
    ruleVersion: RULE_VERSION,
    ...summarize(signals),
    signals,
    spatialEngine: engine,
    candidates,
    observations,
    photos,
  };
  const assessmentHash = sha256(JSON.stringify(base));
  const report: RiskReport = { ...base, assessmentHash };
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO review_cases(inspection_id,organization_id) VALUES($1,$2) ON CONFLICT(inspection_id) DO NOTHING",
      [id, actor.organizationId],
    );
    const [current] = await tx.query<{
      assessment_id: string | null;
      state: string;
    }>(
      "SELECT assessment_id,state FROM review_cases WHERE inspection_id=$1 FOR UPDATE",
      [id],
    );
    const [existing] = current.assessment_id
      ? await tx.query<{ assessment_hash: string }>(
          "SELECT assessment_hash FROM verification_runs WHERE id=$1",
          [current.assessment_id],
        )
      : [];
    if (existing?.assessment_hash === assessmentHash) return;
    if (current.state === "approved") {
      await tx.query(
        "UPDATE review_cases SET state='pending',version=version+1,epoch=epoch+1,updated_at=now() WHERE inspection_id=$1",
        [id],
      );
      await audit(tx, actor, "inspection.review_reopened", id, {
        reason: "assessment_changed",
        previousAssessmentHash: existing?.assessment_hash,
        assessmentHash,
      });
    }
    const runId = randomUUID();
    await tx.query(
      "INSERT INTO verification_runs(id,organization_id,inspection_id,rule_version,assessment_hash,report) VALUES($1,$2,$3,$4,$5,$6)",
      [
        runId,
        actor.organizationId,
        id,
        RULE_VERSION,
        assessmentHash,
        JSON.stringify(report),
      ],
    );
    await tx.query(
      "UPDATE review_cases SET assessment_id=$1,risk_level=$2,independent_required=independent_required OR $3 WHERE inspection_id=$4",
      [runId, report.level, report.requiresIndependentReview, id],
    );
    await audit(tx, actor, "inspection.risk_assessed", id, {
      ruleVersion: RULE_VERSION,
      assessmentHash,
      level: report.level,
    });
  });
  return report;
}
const round = (number: number) => Math.round(number * 100) / 100;
