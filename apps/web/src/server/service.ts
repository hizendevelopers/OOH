import { randomUUID } from "node:crypto";
import { z } from "zod";
import { previewCsv, type Actor, type FaceInput } from "@ibvs/domain";
import { getDb, type Database } from "./db";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireAdmin(actor: Actor) {
  if (actor.role !== "admin")
    throw new ApiError(403, "Administrator access required");
}
export async function audit(
  db: Database,
  actor: Actor,
  action: string,
  id: string,
  detail: object = {},
) {
  await db.query(
    "INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      actor.organizationId,
      actor.id,
      action,
      id,
      JSON.stringify(detail),
    ],
  );
}
export async function inventory(actor: Actor) {
  requireAdmin(actor);
  return (await getDb()).query<Face>(
    `SELECT f.id,f.code,f.orientation,s.code structure_code,s.city,s.zone,c.latitude,c.longitude,c.uncertainty_m, a.status, a.worker_id FROM billboard_faces f JOIN billboard_structures s ON s.id=f.structure_id JOIN source_coordinates c ON c.face_id=f.id LEFT JOIN assignments a ON a.face_id=f.id AND a.status IN ('assigned','server_received','pending_review','resurvey_requested') WHERE f.organization_id=$1 ORDER BY f.created_at DESC,f.code LIMIT 10001`,
    [actor.organizationId],
  );
}
export type Face = {
  id: string;
  code: string;
  orientation: string;
  structure_code: string;
  city: string;
  zone: string;
  latitude: number;
  longitude: number;
  uncertainty_m: number;
  status: string | null;
  worker_id: string | null;
};
export type Assignment = Face & {
  assignment_id: string;
  worker_name: string;
  due_date: string;
  status: string;
  version: number;
  parent_inspection_id?: string | null;
  instructions?: string | null;
};
export async function assignments(actor: Actor, id?: string) {
  return (await getDb()).query<Assignment>(
    `SELECT f.id,f.code,f.orientation,s.code structure_code,s.city,s.zone,c.latitude,c.longitude,c.uncertainty_m,a.id assignment_id,a.parent_inspection_id,a.instructions,a.status,a.worker_id,a.due_date::text,a.version,u.name worker_name FROM assignments a JOIN billboard_faces f ON f.id=a.face_id JOIN billboard_structures s ON s.id=f.structure_id JOIN source_coordinates c ON c.face_id=f.id JOIN "user" u ON u.id=a.worker_id WHERE a.organization_id=$1 AND ($2::text='admin' OR a.worker_id=$3) AND ($4::text IS NULL OR a.id=$4) ORDER BY a.due_date,a.created_at DESC LIMIT 10000`,
    [actor.organizationId, actor.role, actor.id, id ?? null],
  );
}
export async function workers(actor: Actor) {
  requireAdmin(actor);
  return (await getDb()).query<{ id: string; name: string; email: string }>(
    `SELECT u.id,u.name,u.email FROM "user" u JOIN organization_members m ON m.user_id=u.id JOIN worker_profiles p ON p.user_id=u.id WHERE m.organization_id=$1 AND m.role='worker' AND p.active=true ORDER BY u.name`,
    [actor.organizationId],
  );
}
export async function previewImport(actor: Actor, csv: string) {
  requireAdmin(actor);
  const db = await getDb();
  const existing = await db.query<{ code: string }>(
    "SELECT code FROM billboard_faces WHERE organization_id=$1",
    [actor.organizationId],
  );
  return previewCsv(
    csv,
    existing.map((f) => f.code),
  );
}
export async function importCsv(actor: Actor, csv: string, sourceName: string) {
  requireAdmin(actor);
  const preview = await previewImport(actor, csv);
  if (preview.errors.length)
    throw new ApiError(
      422,
      "Import has validation errors; preview before committing",
    );
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [
        actor.organizationId,
      ]);
      for (const row of preview.rows)
        await insertFace(tx, actor, row, sourceName);
      await audit(tx, actor, "inventory.import", actor.organizationId, {
        rows: preview.rows.length,
        sourceName,
      });
      return { imported: preview.rows.length };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ApiError(409, "A face was already imported; refresh preview");
    throw e;
  }
}
async function insertFace(
  tx: Database,
  actor: Actor,
  row: FaceInput,
  source: string,
) {
  let structures = await tx.query<{ id: string; city: string; zone: string }>(
    "SELECT id,city,zone FROM billboard_structures WHERE organization_id=$1 AND code=$2",
    [actor.organizationId, row.structure_code],
  );
  if (
    structures.length &&
    (structures[0].city !== row.city || structures[0].zone !== row.zone)
  )
    throw new ApiError(
      422,
      `Structure ${row.structure_code} has different city/zone; import cancelled`,
    );
  if (!structures.length)
    structures = await tx.query(
      "INSERT INTO billboard_structures(id,organization_id,code,city,zone) VALUES($1,$2,$3,$4,$5) RETURNING id,city,zone",
      [
        randomUUID(),
        actor.organizationId,
        row.structure_code,
        row.city,
        row.zone,
      ],
    );
  const id = randomUUID();
  await tx.query(
    "INSERT INTO billboard_faces(id,organization_id,structure_id,code,orientation) VALUES($1,$2,$3,$4,$5)",
    [id, actor.organizationId, structures[0].id, row.code, row.orientation],
  );
  await tx.query(
    "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      id,
      row.latitude,
      row.longitude,
      row.uncertainty_m,
      source,
      actor.id,
    ],
  );
}
export const assignmentInput = z.object({
  faceIds: z
    .array(z.string().uuid())
    .min(1)
    .max(1000)
    .refine((v) => new Set(v).size === v.length, "Duplicate selection"),
  workerId: z.string().min(1).max(100),
  dueDate: z.iso.date(),
});
export async function assign(
  actor: Actor,
  input: z.infer<typeof assignmentInput>,
) {
  requireAdmin(actor);
  const parsed = assignmentInput.parse(input);
  const db = await getDb();
  try {
    return await db.transaction(async (tx) => {
      const member = await tx.query(
        "SELECT m.user_id FROM organization_members m JOIN worker_profiles p ON p.user_id=m.user_id WHERE m.organization_id=$1 AND m.user_id=$2 AND m.role='worker' AND p.active=true",
        [actor.organizationId, parsed.workerId],
      );
      if (!member.length)
        throw new ApiError(422, "Select an active worker in this organization");
      for (const faceId of parsed.faceIds) {
        const face = await tx.query(
          "SELECT id FROM billboard_faces WHERE id=$1 AND organization_id=$2 FOR UPDATE",
          [faceId, actor.organizationId],
        );
        if (!face.length) throw new ApiError(404, "Face not found");
        const id = randomUUID();
        await tx.query(
          "INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date) VALUES($1,$2,$3,$4,$5,$6)",
          [
            id,
            actor.organizationId,
            faceId,
            parsed.workerId,
            actor.id,
            parsed.dueDate,
          ],
        );
        await audit(tx, actor, "assignment.create", id, {
          faceId,
          workerId: parsed.workerId,
          dueDate: parsed.dueDate,
        });
      }
      return { assigned: parsed.faceIds.length };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505")
      throw new ApiError(
        409,
        "A selected face already has an active assignment",
      );
    throw e;
  }
}
export async function overview(actor: Actor) {
  requireAdmin(actor);
  const db = await getDb();
  const totals = await db.query<{
    faces: number;
    structures: number;
    workers: number;
    assigned: number;
    pending: number;
    verified: number;
    rejected: number;
  }>(
    `SELECT (SELECT count(*)::int FROM billboard_faces WHERE organization_id=$1) faces,(SELECT count(*)::int FROM billboard_structures WHERE organization_id=$1) structures,(SELECT count(*)::int FROM organization_members WHERE organization_id=$1 AND role='worker') workers,(SELECT count(*)::int FROM assignments WHERE organization_id=$1 AND status='assigned') assigned,(SELECT count(*)::int FROM assignments WHERE organization_id=$1 AND status IN ('server_received','pending_review','ambiguous')) pending,(SELECT count(*)::int FROM reference_baselines b LEFT JOIN baseline_events e ON e.baseline_id=b.id WHERE b.organization_id=$1 AND e.id IS NULL) verified,(SELECT count(*)::int FROM assignments WHERE organization_id=$1 AND status='rejected') rejected`,
    [actor.organizationId],
  );
  const cities = await db.query<{
    city: string;
    faces: number;
    assigned: number;
  }>(
    `SELECT s.city,count(f.id)::int faces,count(a.id)::int assigned FROM billboard_structures s JOIN billboard_faces f ON f.structure_id=s.id LEFT JOIN assignments a ON a.face_id=f.id AND a.status IN ('assigned','pending_review','server_received','resurvey_requested') WHERE s.organization_id=$1 GROUP BY s.city ORDER BY faces DESC`,
    [actor.organizationId],
  );
  return { ...totals[0], cities };
}
export async function auditLog(actor: Actor) {
  requireAdmin(actor);
  return (await getDb()).query<{
    id: string;
    action: string;
    entity_id: string;
    detail: object;
    created_at: string;
    actor_name: string;
  }>(
    `SELECT a.*,u.name actor_name FROM audit_events a JOIN "user" u ON u.id=a.actor_id WHERE a.organization_id=$1 ORDER BY a.created_at DESC LIMIT 200`,
    [actor.organizationId],
  );
}
