import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { DatabaseEvidenceStore } from "../apps/web/src/server/evidence-store";

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
