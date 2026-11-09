import { afterAll, beforeAll, expect, it } from "vitest";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { verifyMigrationHistory } from "../apps/web/src/server/migration-verify";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("migration-verify-qa-");
  await migrate();
});
afterAll(closeDb);

it("passes on a fully migrated database", async () => {
  const result = await verifyMigrationHistory(await getDb());
  expect(result).toMatchObject({ ok: true, problems: [] });
});

it("reports a missing migration and restores it without changing other history", async () => {
  const db = await getDb();
  const [kept] = await db.query<{ applied_at: string }>("SELECT applied_at FROM schema_migrations WHERE name=$1", ["005_review_queue_index.sql"]);
  await db.query("DELETE FROM schema_migrations WHERE name=$1", ["005_review_queue_index.sql"]);
  try {
    const result = await verifyMigrationHistory(db);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(["missing: 005_review_queue_index.sql"]);
  } finally {
    await db.query("INSERT INTO schema_migrations(name, applied_at) VALUES($1,$2)", ["005_review_queue_index.sql", kept.applied_at]);
  }
  expect((await verifyMigrationHistory(db)).ok).toBe(true);
});

it("reports an unexpected migration record", async () => {
  const db = await getDb();
  await db.query("INSERT INTO schema_migrations(name) VALUES($1)", ["999_unknown.sql"]);
  try {
    expect((await verifyMigrationHistory(db)).problems).toEqual(["unexpected: 999_unknown.sql"]);
  } finally {
    await db.query("DELETE FROM schema_migrations WHERE name=$1", ["999_unknown.sql"]);
  }
});

it("reports a migration applied before its predecessor", async () => {
  const db = await getDb();
  const [original] = await db.query<{ applied_at: string }>("SELECT applied_at FROM schema_migrations WHERE name=$1", ["009_angle_photos.sql"]);
  await db.query("UPDATE schema_migrations SET applied_at=(SELECT applied_at - interval '1 day' FROM schema_migrations WHERE name=$1) WHERE name=$2", ["001_core.sql", "009_angle_photos.sql"]);
  try {
    const result = await verifyMigrationHistory(db);
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.startsWith("out of order: 002_inspections.sql"))).toBe(false);
    expect(result.problems.join(" ")).toMatch(/out of order/);
  } finally {
    await db.query("UPDATE schema_migrations SET applied_at=$1 WHERE name=$2", [original.applied_at, "009_angle_photos.sql"]);
  }
  expect((await verifyMigrationHistory(db)).ok).toBe(true);
});

it("a second concurrent run applies nothing twice", async () => {
  await Promise.all([migrate(), migrate()]);
  const rows = await (await getDb()).query<{ name: string }>("SELECT name FROM schema_migrations");
  expect(rows.length).toBe(new Set(rows.map((r) => r.name)).size);
  expect((await verifyMigrationHistory(await getDb())).ok).toBe(true);
});
