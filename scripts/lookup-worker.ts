// Read-only lookup of worker accounts by name or email fragment. Prints database IDs for confirmation.
// It never writes. Each query runs in a READ ONLY transaction. Run it against the hosted database only with
// the administrator's approval, using the same environment as the other operator scripts:
//   node scripts/with-app-env.mjs scripts/lookup-worker.ts --match hyder
import { closeDb, getDb } from "../apps/web/src/server/db";

const match = process.argv[process.argv.indexOf("--match") + 1];

async function main() {
  if (!match || match.length < 3) throw new Error("Pass --match with at least three characters of the name or email");
  const db = await getDb();
  const pattern = `%${match.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await db.transaction(async (tx) => {
    await tx.query("SET TRANSACTION READ ONLY");
    return tx.query<{
      user_id: string;
      name: string;
      email: string;
      organization_id: string;
      role: string;
      active: boolean | null;
    }>(
      `SELECT u.id AS user_id, u.name, u.email, m.organization_id, m.role, p.active
       FROM "user" u
       JOIN organization_members m ON m.user_id = u.id
       LEFT JOIN worker_profiles p ON p.user_id = u.id AND p.organization_id = m.organization_id
       WHERE u.name ILIKE $1 OR u.email ILIKE $1
       ORDER BY m.organization_id, u.name`,
      [pattern],
    );
  });
  if (!rows.length) {
    console.log("No matching accounts. Check the spelling, or search by email.");
    return;
  }
  console.log(`${rows.length} matching membership(s). Confirm the user_id and organization_id before any assignment.`);
  for (const row of rows)
    console.log(
      `user_id=${row.user_id} | organization_id=${row.organization_id} | role=${row.role} | active=${row.active ?? "n/a"} | name=${row.name} | email=${row.email}`,
    );
}

if (process.argv[1]?.endsWith("lookup-worker.ts")) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
