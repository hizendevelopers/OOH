import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { reconcileEvidence } from "../scripts/evidence-integrity";
import { restoreDrill } from "../scripts/restore-drill";
import type { Database } from "../apps/web/src/server/db";

function fixture(
  options: { corrupt?: boolean; missing?: boolean; incomplete?: boolean } = {},
) {
  const bytes = Buffer.from("fixture-private-photo"),
    digest = createHash("sha256").update(bytes).digest("hex");
  const media = {
    id: "private-id",
    expected_bytes: bytes.length,
    expected_hash: digest,
    server_hash: digest,
    object_key: "private/original",
    receipt_id: "media-receipt",
    inspection_status: "server_received",
    inspection_receipt: "inspection-receipt",
  };
  let page = 0;
  const db: Database = {
    async query<T>(sql: string) {
      if (sql.includes("FROM inspections i")) return [{ count: 0 }] as T[];
      if (sql.includes("FROM media_evidence"))
        return (page++ === 0 ? [media] : []) as T[];
      return (
        options.incomplete
          ? []
          : [
              {
                part: 0,
                hash: digest,
                bytes: bytes.length,
                object_key: "private/part",
              },
            ]
      ) as T[];
    },
    async transaction() {
      throw new Error("unused");
    },
  };
  const read = async () => {
    if (options.missing) throw new Error("secret internal path");
    return options.corrupt ? Buffer.from("bad") : bytes;
  };
  return { db, read };
}

it("reconciles private originals and chunks with aggregate-only output", async () => {
  const { db, read } = fixture();
  const report = await reconcileEvidence(db, read);
  expect(report.ok).toBe(true);
  expect(report).toMatchObject({
    mediaChecked: 1,
    originalsChecked: 1,
    partsChecked: 1,
  });
  expect(JSON.stringify(report)).not.toMatch(
    /private-id|media-receipt|inspection-receipt|fixture-private-photo|private\/original/,
  );
});

it("detects corrupt bytes, missing files and incomplete completed manifests without leaking errors", async () => {
  const corrupt = fixture({ corrupt: true });
  const mismatch = await reconcileEvidence(corrupt.db, corrupt.read);
  expect(mismatch.ok).toBe(false);
  expect(mismatch.failures).toMatchObject({
    originalHash: 1,
    originalSize: 1,
    partHash: 1,
    partSize: 1,
  });
  const missing = fixture({ missing: true });
  const report = await reconcileEvidence(missing.db, missing.read);
  expect(report.failures).toMatchObject({
    unreadablePart: 1,
    unreadableOriginal: 1,
  });
  expect(JSON.stringify(report)).not.toContain("secret");
  const incomplete = fixture({ incomplete: true });
  expect(
    (await reconcileEvidence(incomplete.db, incomplete.read)).failures
      .partManifest,
  ).toBe(1);
});

it("restores generated isolated database schema, immutable audit history and private evidence", async () => {
  const prior = {
    database: process.env.DATABASE_URL,
    local: process.env.IBVS_LOCAL_DB,
    evidence: process.env.IBVS_EVIDENCE_DIR,
  };
  process.env.DATABASE_URL = "postgres://never-open.invalid/never";
  process.env.IBVS_LOCAL_DB = "must-never-open";
  process.env.IBVS_EVIDENCE_DIR = "must-never-open";
  try {
    const report = await restoreDrill();
    expect(report).toMatchObject({
      ok: true,
      scope: "generated-isolated-pglite-fixtures",
      schemaVerified: true,
      auditMutationDenied: true,
      integrity: {
        ok: true,
        mediaChecked: 2,
        partsChecked: 2,
        originalsChecked: 2,
      },
    });
    expect(report.tablesVerified).toBeGreaterThan(20);
    expect(process.env.DATABASE_URL).toBe(
      "postgres://never-open.invalid/never",
    );
  } finally {
    for (const [key, value] of [
      ["DATABASE_URL", prior.database],
      ["IBVS_LOCAL_DB", prior.local],
      ["IBVS_EVIDENCE_DIR", prior.evidence],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
