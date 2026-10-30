import { getDb, closeDb } from "../apps/web/src/server/db";
import { environment } from "../apps/web/src/server/env";
import type { Database } from "../apps/web/src/server/db";

// Internal actor for the explicitly enabled no-login workspace. It has no password
// or authentication account, and does not represent an invented field worker.
export async function bootstrapWorkspace(
  db: Database,
  organizationId = "billboard-operations",
) {
  await db.transaction(async (tx) => {
    const existing = await tx.query(
      "SELECT id FROM organizations WHERE id=$1",
      [organizationId],
    );
    if (!existing.length)
      await tx.query(
        "INSERT INTO organizations(id,name,is_demo) VALUES($1,$2,false) ON CONFLICT(id) DO NOTHING",
        [organizationId, "Billboard Tracking System"],
      );
    const [organization] = await tx.query<{ is_demo: boolean }>(
      "SELECT is_demo FROM organizations WHERE id=$1",
      [organizationId],
    );
    if (organization.is_demo)
      throw new Error(
        "Cannot use a demo organization for the operations workspace",
      );
    const id = `workspace:${organizationId}`;
    await tx.query(
      'INSERT INTO "user"(id,name,email) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
      [id, "Operations workspace", `${organizationId}@workspace.ibvs.invalid`],
    );
    await tx.query(
      "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'admin') ON CONFLICT(organization_id,user_id) DO NOTHING",
      [organizationId, id],
    );
  });
}
if (process.argv[1]?.endsWith("bootstrap-workspace.ts")) {
  try {
    await bootstrapWorkspace(await getDb(), environment().IBVS_WORKSPACE_ID);
    console.log(
      "Operations workspace ready. No inventory, workers, assignments or evidence were generated.",
    );
  } finally {
    await closeDb();
  }
}
