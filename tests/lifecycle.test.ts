import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, utimes } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../apps/web/src/server/db";
import { planEvidenceLifecycle } from "../scripts/evidence-lifecycle";

function database(references: string[]): Database {
  return {
    async query<T>(_sql: string, args: unknown[] = []) {
      const keys = args[0] as string[];
      return references
        .filter((key) => keys.includes(key))
        .map((object_key) => ({ object_key })) as T[];
    },
    async transaction() {
      throw new Error("unused");
    },
  };
}
async function fixture() {
  const root = path.resolve(".local", "test-data", "lifecycle-" + randomUUID());
  const folder = `${randomUUID()}/front`;
  await mkdir(path.join(root, folder), { recursive: true });
  const original = `${folder}/original-${"a".repeat(64)}`;
  const chunk = `${folder}/0-${"b".repeat(64)}`;
  const temporary = `${chunk}.${randomUUID()}.tmp`;
  const files = [original, chunk, temporary, "unknown-private-file"];
  for (const key of files)
    await writeFile(path.join(root, key), "preserve evidence");
  await utimes(path.join(root, temporary), new Date(0), new Date(0));
  return { root, original, chunk, temporary, files };
}

it("reports referenced, unregistered and old temporary objects but retains all without policy authority", async () => {
  const f = await fixture();
  const report = await planEvidenceLifecycle(database([f.original]), f.root);
  expect(report).toMatchObject({
    dryRun: true,
    referencedFiles: 1,
    unregisteredObjects: 1,
    temporaryFiles: 1,
    temporaryOlderThan24h: 1,
    unknownFiles: 1,
    retainedFiles: 4,
    deletionEligible: 0,
  });
  for (const key of f.files)
    expect(await readFile(path.join(f.root, key), "utf8")).toBe(
      "preserve evidence",
    );
  expect(JSON.stringify(report)).not.toMatch(
    /original-|private-file|front|evidence\/|\.tmp/,
  );
});

it("fails closed on traversal limits and relative roots without modifying evidence", async () => {
  const f = await fixture();
  await expect(
    planEvidenceLifecycle(database([]), f.root, { maxEntries: 1 }),
  ).rejects.toThrow("bound exceeded");
  await expect(planEvidenceLifecycle(database([]), "relative")).rejects.toThrow(
    "Absolute",
  );
  await expect(
    planEvidenceLifecycle(database([]), f.root, { maxEntries: Infinity }),
  ).rejects.toThrow("bound");
  for (const key of f.files)
    expect(await readFile(path.join(f.root, key), "utf8")).toBe(
      "preserve evidence",
    );
});

it("does not report a completed plan after database failure", async () => {
  const f = await fixture();
  const db = database([]);
  db.query = async () => {
    throw new Error("unavailable");
  };
  await expect(planEvidenceLifecycle(db, f.root)).rejects.toThrow(
    "unavailable",
  );
  expect(await readFile(path.join(f.root, f.original), "utf8")).toBe(
    "preserve evidence",
  );
});
