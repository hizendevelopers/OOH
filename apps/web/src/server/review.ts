import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb, type Database } from "./db";
import { ApiError, audit, requireAdmin } from "./service";
import { assessInspection, inspectionRecord } from "./risk-analysis";
import { sha256 } from "./image-analysis";
import {
  decisionInput,
  baselineInput,
  type RiskReport,
} from "../../../../packages/domain/src/risk";

type Case = {
  inspection_id: string;
  state: string;
  version: number;
  epoch: number;
  independent_required: boolean;
  assessment_id: string;
};
export type QueueItem = {
  id: string;
  code: string;
  city: string;
  worker_name: string;
  worker_id: string;
  received_at: string;
  state: string;
  version: number;
  risk_level: string;
  evidence_type: string;
};
export async function reviewQueue(
  actor: Actor,
  filters = new URLSearchParams(),
) {
  requireAdmin(actor);
  const date = filters.get("date") || null;
  if (date && !z.iso.date().safeParse(date).success)
    throw new ApiError(422, "Invalid date");
  return (await getDb()).query<QueueItem>(
    `SELECT i.id,f.code,s.city,u.name worker_name,i.worker_id,i.received_at,r.state,r.version,r.risk_level,CASE WHEN i.metadata::text LIKE '%offline%' THEN 'offline' ELSE 'online' END evidence_type FROM review_cases r JOIN inspections i ON i.id=r.inspection_id JOIN billboard_faces f ON f.id=i.face_id JOIN billboard_structures s ON s.id=f.structure_id JOIN "user" u ON u.id=i.worker_id WHERE r.organization_id=$1 AND ($2::text IS NULL OR r.state=$2) AND ($3::text IS NULL OR i.worker_id=$3) AND ($4::text IS NULL OR s.city ILIKE '%'||$4||'%') AND ($5::text IS NULL OR f.code ILIKE '%'||$5||'%') AND ($6::text IS NULL OR r.risk_level=$6) AND ($7::date IS NULL OR i.received_at::date=$7::date) AND ($8::text IS NULL OR ($8='offline')=(i.metadata::text LIKE '%offline%')) ORDER BY i.received_at DESC,i.id LIMIT 500`,
    [
      actor.organizationId,
      filters.get("state") || null,
      filters.get("worker") || null,
      filters.get("city") || null,
      filters.get("billboard") || null,
      filters.get("risk") || null,
      date,
      filters.get("evidence") || null,
    ],
  );
}
export async function reviewDetail(actor: Actor, id: string) {
  requireAdmin(actor);
  const inspection = await inspectionRecord(actor.organizationId, id),
    db = await getDb();
  const [review] = await db.query<Case>(
    "SELECT * FROM review_cases WHERE inspection_id=$1",
    [id],
  );
  const [run] = await db.query<{ report: RiskReport }>(
    "SELECT report FROM verification_runs WHERE id=$1",
    [review?.assessment_id || null],
  );
  const decisions = await db.query<{
    id: string;
    action: string;
    reason: string;
    created_at: string;
    actor_name: string;
    version: number;
    assessment_hash: string;
    epoch: number;
  }>(
    `SELECT d.id,d.action,d.reason,d.created_at,u.name actor_name,d.version,d.assessment_hash,d.epoch FROM review_decisions d JOIN "user" u ON u.id=d.actor_id WHERE d.inspection_id=$1 ORDER BY d.version`,
    [id],
  );
  const baselines = await db.query<{
    id: string;
    version: number;
    structure_details: Record<string, unknown>;
    created_at: string;
    withdrawn_at: string | null;
    withdrawal_reason: string | null;
    inspection_id: string;
    on_hold: boolean;
  }>(
    `SELECT b.id,b.version,b.inspection_id,b.structure_details,b.created_at,e.created_at withdrawn_at,e.reason withdrawal_reason,(coalesce(rc.state,'pending')<>'approved' OR b.assessment_hash<>coalesce(vr.assessment_hash,'')) on_hold FROM reference_baselines b LEFT JOIN baseline_events e ON e.baseline_id=b.id LEFT JOIN review_cases rc ON rc.inspection_id=b.inspection_id LEFT JOIN verification_runs vr ON vr.id=rc.assessment_id WHERE b.face_id=$1 ORDER BY b.version DESC`,
    [inspection.face_id],
  );
  const history = await db.query<{
    action: string;
    created_at: string;
    detail: Record<string, unknown>;
  }>(
    "SELECT action,created_at,detail FROM audit_events WHERE organization_id=$1 AND entity_id=$2 ORDER BY created_at,id",
    [actor.organizationId, id],
  );
  const media = await db.query<{
    kind: string;
    server_hash: string;
    received_at: string;
    width: number;
    height: number;
    receipt_id: string;
    parts: number;
  }>(
    "SELECT m.kind,m.server_hash,m.received_at,m.width,m.height,m.receipt_id,(SELECT count(*)::integer FROM evidence_parts p WHERE p.media_id=m.id) parts FROM media_evidence m WHERE m.inspection_id=$1 ORDER BY kind",
    [id],
  );
  const assessments = await db.query<{
    id: string;
    created_at: string;
    rule_version: string;
    assessment_hash: string;
  }>(
    "SELECT id,created_at,rule_version,assessment_hash FROM verification_runs WHERE inspection_id=$1 ORDER BY created_at DESC,id",
    [id],
  );
  return {
    inspection,
    review,
    report: run?.report || null,
    decisions,
    baselines,
    history,
    media,
    assessments,
  };
}
export type ReviewDetail = Awaited<ReturnType<typeof reviewDetail>>;
export async function reviewAssessment(
  actor: Actor,
  inspectionId: string,
  runId: string,
) {
  requireAdmin(actor);
  await inspectionRecord(actor.organizationId, inspectionId);
  const [run] = await (
    await getDb()
  ).query<{ report: RiskReport }>(
    "SELECT report FROM verification_runs WHERE id=$1 AND inspection_id=$2 AND organization_id=$3",
    [runId, inspectionId, actor.organizationId],
  );
  if (!run) throw new ApiError(404, "Assessment not found");
  return run.report;
}
// Organization mutation locks use NO KEY UPDATE so concurrent audit/reference FK
// KEY SHARE checks cannot create an organization -> case -> organization deadlock.
async function replay(
  tx: Database,
  table: string,
  actor: Actor,
  operationId: string,
  hash: string,
) {
  // Table names are internal constants, never request input.
  const [old] = await tx.query<{
    payload_hash: string;
    result?: unknown;
    id: string;
  }>(
    `SELECT * FROM ${table} WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3`,
    [actor.organizationId, actor.id, operationId],
  );
  if (old && old.payload_hash !== hash)
    throw new ApiError(409, "Operation ID already used for different content");
  return old;
}
async function lockCase(tx: Database, id: string, version: number) {
  const [c] = await tx.query<Case>(
    "SELECT * FROM review_cases WHERE inspection_id=$1 FOR UPDATE",
    [id],
  );
  if (!c || c.version !== version)
    throw new ApiError(409, "Review changed. Refresh before deciding.");
  return c;
}
async function assertNoBaseline(tx: Database, id: string) {
  const active = await tx.query(
    "SELECT b.id FROM reference_baselines b LEFT JOIN baseline_events e ON e.baseline_id=b.id WHERE b.inspection_id=$1 AND e.id IS NULL",
    [id],
  );
  if (active.length)
    throw new ApiError(
      409,
      "Withdraw the active reference before changing its review outcome",
    );
}
async function assertCurrentAssessment(tx: Database, c: Case, hash: string) {
  const [run] = await tx.query<{ assessment_hash: string }>(
    "SELECT assessment_hash FROM verification_runs WHERE id=$1",
    [c.assessment_id],
  );
  if (!run || run.assessment_hash !== hash)
    throw new ApiError(409, "Evidence assessment changed. Refresh review.");
}
export async function decide(actor: Actor, id: string, data: unknown) {
  requireAdmin(actor);
  const input = decisionInput.parse(data),
    hash = sha256(JSON.stringify({ id, ...input })),
    db = await getDb();
  const inspection = await inspectionRecord(actor.organizationId, id);
  if (inspection.worker_id === actor.id)
    throw new ApiError(403, "Independent supervisor required");
  const old = await replay(
    db,
    "review_decisions",
    actor,
    input.operationId,
    hash,
  );
  if (old) return old.result;
  const report = await assessInspection(actor, id);
  return db.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE",
      [actor.organizationId],
    );
    const previous = await replay(
      tx,
      "review_decisions",
      actor,
      input.operationId,
      hash,
    );
    if (previous) return previous.result;
    const c = await lockCase(tx, id, input.expectedVersion);
    await assertCurrentAssessment(tx, c, input.assessmentHash);
    if (input.assessmentHash !== report.assessmentHash)
      throw new ApiError(409, "Evidence assessment changed. Refresh review.");
    if (c.state === "resurvey_requested")
      throw new ApiError(409, "Review the linked resurvey task");
    let state: string =
      input.action === "approve"
        ? "approved"
        : input.action === "reject"
          ? "rejected"
          : input.action === "resurvey"
            ? "resurvey_requested"
            : "ambiguous";
    let epoch = c.epoch,
      followupAssignmentId: string | null = null;
    if (input.action === "approve") {
      if (c.state === "approved")
        throw new ApiError(409, "Inspection already approved");
      if (report.blocksApproval)
        throw new ApiError(422, "Integrity failure requires resurvey");
      if (
        !input.identityConfirmed ||
        (["high", "critical"].includes(report.level) && !input.riskAcknowledged)
      )
        throw new ApiError(
          422,
          "Confirm exact face identity and acknowledge detected risks",
        );
      const approvals = await tx.query<{ actor_id: string }>(
        "SELECT actor_id FROM review_decisions WHERE inspection_id=$1 AND epoch=$2 AND assessment_hash=$3 AND action='approve'",
        [id, c.epoch, report.assessmentHash],
      );
      if (approvals.some((a) => a.actor_id === actor.id))
        throw new ApiError(
          409,
          "Another supervisor must provide the next approval",
        );
      if (
        (c.independent_required || report.requiresIndependentReview) &&
        !approvals.length
      )
        state = "ambiguous";
    } else {
      await assertNoBaseline(tx, id);
      epoch++;
    }
    if (input.action === "resurvey") {
      const workerId = input.workerId || inspection.worker_id;
      const eligible = await tx.query(
        `SELECT p.user_id FROM worker_profiles p JOIN organization_members m ON m.user_id=p.user_id WHERE p.user_id=$1 AND p.active=true AND m.organization_id=$2 AND m.role='worker'`,
        [workerId, actor.organizationId],
      );
      if (!eligible.length)
        throw new ApiError(422, "Active organization worker required");
      await tx.query(
        "UPDATE assignments SET status='superseded',version=version+1 WHERE id=$1",
        [inspection.assignment_id],
      );
      followupAssignmentId = randomUUID();
      await tx.query(
        "INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date,status,parent_inspection_id,instructions) VALUES($1,$2,$3,$4,$5,$6,'resurvey_requested',$7,$8)",
        [
          followupAssignmentId,
          actor.organizationId,
          inspection.face_id,
          workerId,
          actor.id,
          input.dueDate,
          id,
          input.instructions,
        ],
      );
    } else
      await tx.query(
        "UPDATE assignments SET status=$1,version=version+1 WHERE id=$2",
        [
          state === "pending" ? "pending_review" : state,
          inspection.assignment_id,
        ],
      );
    const result = {
      inspectionId: id,
      state,
      version: c.version + 1,
      followupAssignmentId,
    };
    await tx.query(
      "INSERT INTO review_decisions(id,inspection_id,organization_id,actor_id,operation_id,payload_hash,version,epoch,action,reason,assessment_hash,identity_confirmed,risk_acknowledged,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        randomUUID(),
        id,
        actor.organizationId,
        actor.id,
        input.operationId,
        hash,
        c.version + 1,
        c.epoch,
        input.action,
        input.reason,
        report.assessmentHash,
        input.identityConfirmed,
        input.riskAcknowledged,
        JSON.stringify(result),
      ],
    );
    await tx.query(
      "UPDATE review_cases SET state=$1,version=version+1,epoch=$2,independent_required=independent_required OR $3,updated_at=now() WHERE inspection_id=$4",
      [state, epoch, input.action === "ambiguous", id],
    );
    await audit(tx, actor, "inspection.reviewed", id, {
      action: input.action,
      state,
      version: result.version,
      followupAssignmentId,
    });
    return result;
  });
}
export async function enrollBaseline(actor: Actor, id: string, data: unknown) {
  requireAdmin(actor);
  const input = baselineInput.parse(data),
    hash = sha256(JSON.stringify({ id, ...input })),
    db = await getDb(),
    inspection = await inspectionRecord(actor.organizationId, id);
  if (inspection.worker_id === actor.id)
    throw new ApiError(403, "Independent supervisor required");
  const prior = await replay(
    db,
    "reference_baselines",
    actor,
    input.operationId,
    hash,
  );
  if (prior) return { id: prior.id };
  const report = await assessInspection(actor, id);
  return db.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE",
      [actor.organizationId],
    );
    const old = await replay(
      tx,
      "reference_baselines",
      actor,
      input.operationId,
      hash,
    );
    if (old) return { id: old.id };
    const c = await lockCase(tx, id, input.expectedVersion);
    await assertCurrentAssessment(tx, c, input.assessmentHash);
    if (
      c.state !== "approved" ||
      input.faceId !== inspection.face_id ||
      report.blocksApproval ||
      input.assessmentHash !== report.assessmentHash
    )
      throw new ApiError(409, "Current approved exact-face review required");
    const approvals = await tx.query<{ actor_id: string }>(
      "SELECT DISTINCT actor_id FROM review_decisions WHERE inspection_id=$1 AND epoch=$2 AND assessment_hash=$3 AND action='approve'",
      [id, c.epoch, report.assessmentHash],
    );
    if (
      approvals.length <
      (c.independent_required || report.requiresIndependentReview ? 2 : 1)
    )
      throw new ApiError(
        409,
        "Fresh supervisor approvals required for this assessment",
      );
    await tx.query("SELECT id FROM billboard_faces WHERE id=$1 FOR UPDATE", [
      input.faceId,
    ]);
    const active = await tx.query(
      "SELECT b.id FROM reference_baselines b LEFT JOIN baseline_events e ON e.baseline_id=b.id WHERE b.face_id=$1 AND e.id IS NULL",
      [input.faceId],
    );
    if (active.length)
      throw new ApiError(
        409,
        "Withdraw the current baseline before correcting it",
      );
    const [last] = await tx.query<{ version: number }>(
      "SELECT coalesce(max(version),0)::integer version FROM reference_baselines WHERE face_id=$1",
      [input.faceId],
    );
    const baselineId = randomUUID();
    const details = {
      shape: input.shape,
      mounting: input.mounting,
      numberOfFaces: input.numberOfFaces,
      facing: input.facing,
      landmarks: input.landmarks,
      reason: input.reason,
    };
    await tx.query(
      "INSERT INTO reference_baselines(id,organization_id,face_id,inspection_id,version,structure_details,actor_id,assessment_hash,operation_id,payload_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        baselineId,
        actor.organizationId,
        input.faceId,
        id,
        last.version + 1,
        JSON.stringify(details),
        actor.id,
        report.assessmentHash,
        input.operationId,
        hash,
      ],
    );
    await tx.query(
      "INSERT INTO reference_photos(baseline_id,media_id,kind,original_hash) SELECT $1,id,kind,server_hash FROM media_evidence WHERE inspection_id=$2 AND receipt_id IS NOT NULL",
      [baselineId, id],
    );
    await audit(tx, actor, "baseline.enrolled", id, {
      baselineId,
      version: last.version + 1,
      faceId: input.faceId,
    });
    return { id: baselineId };
  });
}
export async function withdrawBaseline(
  actor: Actor,
  id: string,
  data: unknown,
) {
  requireAdmin(actor);
  const input = z
      .object({
        operationId: z.uuid(),
        reason: z.string().trim().min(5).max(2000),
      })
      .parse(data),
    hash = sha256(JSON.stringify({ id, ...input })),
    db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query(
      "SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE",
      [actor.organizationId],
    );
    const old = await replay(
      tx,
      "baseline_events",
      actor,
      input.operationId,
      hash,
    );
    if (old) return { id: old.id };
    const [baseline] = await tx.query<{ inspection_id: string }>(
      "SELECT inspection_id FROM reference_baselines WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [id, actor.organizationId],
    );
    if (!baseline) throw new ApiError(404, "Baseline not found");
    if (
      (
        await tx.query("SELECT id FROM baseline_events WHERE baseline_id=$1", [
          id,
        ])
      ).length
    )
      throw new ApiError(409, "Baseline already withdrawn");
    const eventId = randomUUID();
    await tx.query(
      "INSERT INTO baseline_events(id,baseline_id,organization_id,actor_id,action,reason,operation_id,payload_hash) VALUES($1,$2,$3,$4,'withdraw',$5,$6,$7)",
      [
        eventId,
        id,
        actor.organizationId,
        actor.id,
        input.reason,
        input.operationId,
        hash,
      ],
    );
    await audit(tx, actor, "baseline.withdrawn", baseline.inspection_id, {
      baselineId: id,
      eventId,
    });
    return { id: eventId };
  });
}
