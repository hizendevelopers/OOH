import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { DatabaseEvidenceStore, evidenceHealth } from "../apps/web/src/server/evidence-store";

const key = () => `${randomUUID()}/front/original-${"b".repeat(64)}`;
const photo = (size = 4096) => Buffer.from(Array.from({ length: size }, (_, i) => (i * 17) % 253));

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("evidence-db-store-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
});

describe("database store", () => {
  it("returns exactly the bytes it stored, from a new store instance", async () => {
    const k = key();
    const data = photo();
    await new DatabaseEvidenceStore().put(k, data);
    expect(await new DatabaseEvidenceStore().get(k)).toEqual(data);
  });
  it("treats a repeated write of the same key as the same photo", async () => {
    const k = key();
    const store = new DatabaseEvidenceStore();
    await store.put(k, photo());
    await store.put(k, photo());
    const [row] = await (await getDb()).query<{ n: number }>("SELECT count(*)::int n FROM evidence_objects WHERE key=$1", [k]);
    expect(row.n).toBe(1);
  });
  it("writes inside the caller's transaction and rolls back with it", async () => {
    const db = await getDb();
    const store = new DatabaseEvidenceStore();
    const kept = key();
    await db.transaction(async (tx) => {
      await store.put(kept, photo(), tx);
      expect(await store.get(kept, tx)).toEqual(photo());
    });
    expect(await store.get(kept)).toEqual(photo());
    const dropped = key();
    await expect(
      db.transaction(async (tx) => {
        await store.put(dropped, photo(), tx);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    await expect(store.get(dropped)).rejects.toThrow("not found");
  });
  it("never changes or deletes a stored photo", async () => {
    const k = key();
    await new DatabaseEvidenceStore().put(k, photo());
    const db = await getDb();
    await expect(db.query("UPDATE evidence_objects SET data=$1 WHERE key=$2", [Buffer.from("x"), k])).rejects.toThrow();
    await expect(db.query("DELETE FROM evidence_objects WHERE key=$1", [k])).rejects.toThrow();
  });
  it("refuses bad keys and sizes", async () => {
    const store = new DatabaseEvidenceStore();
    await expect(store.put("../etc/passwd", photo())).rejects.toThrow("Invalid internal evidence key");
    await expect(store.put(key(), Buffer.alloc(0))).rejects.toThrow("Invalid private evidence size");
  });
});

describe("evidence store health", () => {
  const hosted = { NODE_ENV: "production" } as NodeJS.ProcessEnv;
  it("reports the database store as usable when the table and grants are in place", async () => {
    expect(await evidenceHealth(await getDb(), hosted)).toEqual({ kind: "database", usable: true, problem: null });
  });
  it("names a misconfigured object store instead of reporting it healthy", async () => {
    const result = await evidenceHealth(await getDb(), { ...hosted, IBVS_EVIDENCE_S3_BUCKET: "photos" } as NodeJS.ProcessEnv);
    expect(result.kind).toBeNull();
    expect(result.usable).toBe(false);
    expect(result.problem).toContain("bucket, endpoint and access key");
  });
  it("says so when the photo table is missing", async () => {
    const db = { query: async () => [{ present: false }] } as unknown as Awaited<ReturnType<typeof getDb>>;
    expect(await evidenceHealth(db, hosted)).toMatchObject({ kind: "database", usable: false });
    expect((await evidenceHealth(db, hosted)).problem).toContain("migration 017");
  });
  it("says so when this database user cannot write photos", async () => {
    let call = 0;
    const db = { query: async () => (call++ === 0 ? [{ present: true }] : [{ can_insert: false, can_read: true }]) } as unknown as Awaited<ReturnType<typeof getDb>>;
    const result = await evidenceHealth(db, hosted);
    expect(result).toMatchObject({ kind: "database", usable: false });
    expect(result.problem).toContain("cannot read and write");
  });
});

describe("reading many parts at once", () => {
  it("returns the parts in the order asked for, in one query", async () => {
    const store = new DatabaseEvidenceStore();
    const keys = [key(), key(), key()];
    const data = keys.map((_, i) => photo(1024 + i));
    for (const [i, k] of keys.entries()) await store.put(k, data[i]);
    expect(await store.getMany(keys)).toEqual(data);
    expect(await store.getMany([keys[2], keys[0]])).toEqual([data[2], data[0]]);
    expect(await store.getMany([])).toEqual([]);
  });
  it("refuses a key that is not stored rather than returning a short list", async () => {
    await expect(new DatabaseEvidenceStore().getMany([key()])).rejects.toThrow("not found");
  });
  it("refuses a key that is not a valid evidence key", async () => {
    await expect(new DatabaseEvidenceStore().getMany(["../escape"])).rejects.toThrow("Invalid internal evidence key");
  });
});
