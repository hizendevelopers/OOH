import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb, type Database } from "./db";
import { ApiError, audit, requireAdmin } from "./service";

export type LocationException = {
  id: string;
  reason: string;
  authorized_by: string;
  expires_at: string;
  assignment_version: number;
};
export const locationExceptionInput = z.object({
  assignmentId: z.uuid(),
  assignmentVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(1000),
});

export async function activeLocationException(
  db: Database,
  actor: Actor,
  assignmentId: string,
  version: number,
): Promise<LocationException | null> {
  const [row] = await db.query<LocationException>(
    `SELECT e.id,e.reason,e.authorized_by,e.expires_at,e.assignment_version
     FROM location_exceptions e JOIN assignments a ON a.id=e.assignment_id
     WHERE e.organization_id=$1 AND a.organization_id=$1 AND a.id=$2
       AND e.assignment_version=$3 AND a.version=$3 AND e.expires_at>now()
       AND ($4::text='admin' OR a.worker_id=$5)
     ORDER BY e.created_at DESC,e.id DESC LIMIT 1`,
    [actor.organizationId, assignmentId, version, actor.role, actor.id],
  );
  return row ?? null;
}

export async function authorizeLocationException(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const parsed = locationExceptionInput.parse(input);
  return (await getDb()).transaction(async (db) => {
    const [assignment] = await db.query<{ version: number; status: string }>(
      "SELECT version,status FROM assignments WHERE id=$1 AND organization_id=$2 FOR UPDATE",
      [parsed.assignmentId, actor.organizationId],
    );
    if (!assignment) throw new ApiError(404, "Assignment not found");
    if (assignment.version !== parsed.assignmentVersion)
      throw new ApiError(409, "Assignment changed; refresh before authorizing");
    if (!["assigned", "resurvey_requested"].includes(assignment.status))
      throw new ApiError(409, "This assignment no longer accepts a survey");
    const [exception] = await db.query<LocationException>(
      `INSERT INTO location_exceptions(id,organization_id,assignment_id,assignment_version,reason,authorized_by,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,now()+interval '24 hours')
       RETURNING id,reason,authorized_by,expires_at,assignment_version`,
      [
        randomUUID(),
        actor.organizationId,
        parsed.assignmentId,
        assignment.version,
        parsed.reason,
        actor.id,
      ],
    );
    await audit(
      db,
      actor,
      "location.exception.authorized",
      parsed.assignmentId,
      {
        exceptionId: exception.id,
        reason: parsed.reason,
        assignmentVersion: assignment.version,
        expiresAt: exception.expires_at,
      },
    );
    return exception;
  });
}
