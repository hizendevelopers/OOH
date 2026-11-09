// Deployment gate: exits non-zero unless every required migration is recorded, in order.
// Uses DATABASE_MIGRATION_URL when set, so the runtime account is never used for DDL.
import { getDb, closeDb } from "../apps/web/src/server/db";
import { verifyMigrationHistory } from "../apps/web/src/server/migration-verify";

if (process.env.DATABASE_MIGRATION_URL) process.env.DATABASE_URL = process.env.DATABASE_MIGRATION_URL;
const result = await verifyMigrationHistory(await getDb());
await closeDb();
if (result.ok) {
  console.log(`Migrations verified: ${result.applied.length} recorded, none missing or out of order.`);
} else {
  console.error("Migration verification failed:");
  for (const problem of result.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
