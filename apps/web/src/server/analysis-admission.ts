import { randomUUID } from "node:crypto";
import type { Actor } from "@ibvs/domain";
import type { Database } from "./db";
import { ApiError } from "./service";

// Admission precedes image reads/decoding. Database leases bound work across
// processes; expiration recovers a crashed process, not a durable job guarantee.
export async function admitAnalysis(db: Database, actor: Actor) {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query("SET LOCAL lock_timeout='2s'");
    await tx.query("SET LOCAL statement_timeout='5s'");
    await tx.query(
      "SELECT id FROM organizations WHERE id=$1 FOR NO KEY UPDATE",
      [actor.organizationId],
    );
    await tx.query(
      "DELETE FROM analysis_admissions WHERE organization_id=$1 AND started_at<now()-interval '1 minute' AND lease_until<=now()",
      [actor.organizationId],
    );
    const [usage] = await tx.query<{
      active: number;
      actor_starts: number;
      org_starts: number;
    }>(
      "SELECT count(*) FILTER(WHERE lease_until>now())::int active,count(*) FILTER(WHERE actor_id=$2 AND started_at>now()-interval '1 minute')::int actor_starts,count(*) FILTER(WHERE started_at>now()-interval '1 minute')::int org_starts FROM analysis_admissions WHERE organization_id=$1",
      [actor.organizationId, actor.id],
    );
    if (
      usage.active >= 2 ||
      usage.actor_starts >= 60 ||
      usage.org_starts >= 180
    )
      throw new ApiError(
        429,
        "Evidence analysis is busy. Retry shortly; received evidence remains saved.",
      );
    await tx.query(
      "INSERT INTO analysis_admissions(id,organization_id,actor_id) VALUES($1,$2,$3)",
      [id, actor.organizationId, actor.id],
    );
  });
  return async () => {
    await db.query(
      "UPDATE analysis_admissions SET lease_until=now() WHERE id=$1",
      [id],
    );
  };
}
