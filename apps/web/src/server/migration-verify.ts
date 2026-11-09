import type { Database } from "./db";
import { REQUIRED_MIGRATIONS } from "./migration-status";

export type MigrationVerification = {
  ok: boolean;
  problems: string[];
  applied: string[];
};

// Strict check used by deployment gates. It fails on a missing, unexpected or
// out-of-order migration, and on a migration recorded before its predecessor.
export async function verifyMigrationHistory(db: Pick<Database, "query">): Promise<MigrationVerification> {
  const rows = await db.query<{ name: string; applied_at: string }>(
    "SELECT name, applied_at FROM schema_migrations ORDER BY applied_at, name",
  );
  const problems: string[] = [];
  const required = new Set<string>(REQUIRED_MIGRATIONS);
  const recorded = new Set(rows.map((row) => row.name));
  for (const name of REQUIRED_MIGRATIONS)
    if (!recorded.has(name)) problems.push(`missing: ${name}`);
  for (const row of rows)
    if (!required.has(row.name)) problems.push(`unexpected: ${row.name}`);
  // Each migration must be applied no earlier than its predecessor.
  const byOrder = REQUIRED_MIGRATIONS.filter((name) => recorded.has(name));
  const appliedAt = new Map(rows.map((row) => [row.name, new Date(row.applied_at).getTime()]));
  for (let i = 1; i < byOrder.length; i++)
    if ((appliedAt.get(byOrder[i]) ?? 0) < (appliedAt.get(byOrder[i - 1]) ?? 0))
      problems.push(`out of order: ${byOrder[i]} applied before ${byOrder[i - 1]}`);
  return { ok: problems.length === 0, problems, applied: rows.map((row) => row.name) };
}
