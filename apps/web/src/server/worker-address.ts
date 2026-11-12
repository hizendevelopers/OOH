// A worker records the street or landmark for a visit whose imported list has none. Append-only; the latest wins.
// Only the assigned worker, and only while the visit is still open.
import { randomUUID } from "node:crypto";
import type { Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, audit } from "./service";

export async function recordWorkerAddress(actor: Actor, assignmentId: string, address: string) {
  if (actor.role !== "worker") throw new ApiError(403, "Only field workers can record an address");
  const text = address.trim();
  if (text.length < 5 || text.length > 300) throw new ApiError(422, "Enter a street or landmark of 5 to 300 characters");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [visit] = await tx.query<{ face_id: string; status: string }>(
      "SELECT a.face_id, a.status FROM assignments a JOIN worker_profiles p ON p.user_id=a.worker_id WHERE a.id=$1 AND a.organization_id=$2 AND a.worker_id=$3 AND p.active=true FOR UPDATE OF a",
      [assignmentId, actor.organizationId, actor.id],
    );
    if (!visit) throw new ApiError(404, "Visit not found");
    if (!["assigned", "resurvey_requested"].includes(visit.status))
      throw new ApiError(409, "This visit is closed, so its address can no longer change");
    await tx.query(
      "INSERT INTO face_addresses(id,organization_id,face_id,assignment_id,address,recorded_by) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), actor.organizationId, visit.face_id, assignmentId, text, actor.id],
    );
    await audit(tx, actor, "face.address_recorded", visit.face_id, { assignmentId });
    return { assignmentId, address: text };
  });
}
