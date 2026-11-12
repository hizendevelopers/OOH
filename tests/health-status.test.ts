import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { REQUIRED_MIGRATIONS, migrationStatus, publicHealth } from "../apps/web/src/server/migration-status";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("health-qa-");
  await migrate();
});
afterAll(closeDb);

it("lists every migration file in order, so a new file cannot ship unlisted", async () => {
  const files = (await readdir(path.join(process.cwd(), "db", "migrations"))).filter((f) => f.endsWith(".sql")).sort();
  expect([...REQUIRED_MIGRATIONS]).toEqual(files);
});

it("reports a complete schema with the newest required migration as latest", async () => {
  const status = await migrationStatus(await getDb());
  expect(status).toMatchObject({ complete: true, requiredCount: REQUIRED_MIGRATIONS.length, appliedCount: REQUIRED_MIGRATIONS.length, latest: "017_evidence_objects.sql", missing: [] });
  expect(publicHealth(status)).toEqual({ httpStatus: 200, body: { status: "ok" } });
});

it("reports an incomplete schema as unavailable and names the missing migration only to administrators", async () => {
  const db = await getDb();
  await db.query("DELETE FROM schema_migrations WHERE name=$1", ["008_advertiser_history.sql"]);
  try {
    const status = await migrationStatus(db);
    expect(status.complete).toBe(false);
    expect(status.missing).toEqual(["008_advertiser_history.sql"]);
    const publicBody = publicHealth(status);
    expect(publicBody).toEqual({ httpStatus: 503, body: { status: "unavailable" } });
    expect(JSON.stringify(publicBody)).not.toMatch(/\d{3}_|migration|postgres/i);
  } finally {
    await db.query("INSERT INTO schema_migrations(name) VALUES($1)", ["008_advertiser_history.sql"]);
  }
  expect((await migrationStatus(db)).complete).toBe(true);
});
