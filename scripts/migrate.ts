import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb, root } from "../apps/web/src/server/db";
export async function migrate() {
  const db = await getDb();
  const [existing] = await db.query<{ name: string | null }>(
    "SELECT to_regclass('schema_migrations')::text AS name",
  );
  if (!existing.name)
    await db.query(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
  for (const file of (await readdir(path.join(root(), "db", "migrations")))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if (
      (
        await db.query("SELECT name FROM schema_migrations WHERE name=$1", [
          file,
        ])
      ).length
    )
      continue;
    const sql = await readFile(
      path.join(root(), "db", "migrations", file),
      "utf8",
    );
    const applied = await db.transaction(async (tx) => {
      // One migration runs at a time across all processes. The lock is released at commit or rollback.
      await tx.query("SELECT pg_advisory_xact_lock(727001)");
      // Re-check under the lock: another process may have applied this file meanwhile.
      const [recorded] = await tx.query("SELECT 1 AS present FROM schema_migrations WHERE name=$1", [file]);
      if (recorded) return false;
      // Split only at top-level semicolons; preserve PL/pgSQL dollar blocks.
      const statements =
        sql.match(/(?:[^;$]|\$(?!\$)|\$\$[\s\S]*?\$\$)+;?/g) ?? [];
      for (const statement of statements)
        if (statement.trim()) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
      return true;
    });
    if (applied) console.log(`Applied ${file}`);
  }
}
if (process.argv[1]?.endsWith("migrate.ts")) {
  // Migrations may use a separate, more privileged connection than the runtime account.
  if (process.env.DATABASE_MIGRATION_URL) process.env.DATABASE_URL = process.env.DATABASE_MIGRATION_URL;
  migrate()
    .then(closeDb)
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
