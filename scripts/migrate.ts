import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb, root } from "../apps/web/src/server/db";
export async function migrate() {
  const db = await getDb();
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
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
    await db.transaction(async (tx) => {
      // Split only at top-level semicolons; preserve PL/pgSQL dollar blocks.
      const statements =
        sql.match(/(?:[^;$]|\$(?!\$)|\$\$[\s\S]*?\$\$)+;?/g) ?? [];
      for (const statement of statements)
        if (statement.trim()) await tx.query(statement);
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [file]);
    });
    console.log(`Applied ${file}`);
  }
}
if (process.argv[1]?.endsWith("migrate.ts"))
  migrate()
    .then(closeDb)
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
