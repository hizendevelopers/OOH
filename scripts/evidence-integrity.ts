import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../apps/web/src/server/db";
import { CHUNK_SIZE } from "../packages/domain/src/inspection";

type Media = {
  id: string;
  expected_bytes: number;
  expected_hash: string;
  server_hash: string | null;
  object_key: string | null;
  receipt_id: string | null;
  inspection_status: string;
  inspection_receipt: string | null;
};
type Part = { part: number; hash: string; bytes: number; object_key: string };
export type IntegrityReport = {
  mediaChecked: number;
  partsChecked: number;
  originalsChecked: number;
  failures: Record<
    | "unreadablePart"
    | "partHash"
    | "partSize"
    | "partManifest"
    | "unreadableOriginal"
    | "originalHash"
    | "originalSize"
    | "receiptLink",
    number
  >;
  ok: boolean;
};
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Read-only reconciliation. Deliberately returns no IDs, file paths, GPS or image bytes. */
export async function reconcileEvidence(
  db: Database,
  read: (key: string) => Promise<Buffer>,
): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    mediaChecked: 0,
    partsChecked: 0,
    originalsChecked: 0,
    failures: {
      unreadablePart: 0,
      partHash: 0,
      partSize: 0,
      partManifest: 0,
      unreadableOriginal: 0,
      originalHash: 0,
      originalSize: 0,
      receiptLink: 0,
    },
    ok: true,
  };
  let cursor = "";
  const incomplete = await db.query<{ count: string | number }>(
    `SELECT count(*) count FROM inspections i WHERE i.status='server_received' AND (i.receipt_id IS NULL OR (SELECT count(*) FROM media_evidence m WHERE m.inspection_id=i.id AND m.receipt_id IS NOT NULL)<>2)`,
  );
  report.failures.receiptLink += Number(incomplete[0]?.count ?? 0);
  for (;;) {
    const rows = await db.query<Media>(
      `SELECT m.*,i.status inspection_status,i.receipt_id inspection_receipt FROM media_evidence m JOIN inspections i ON i.id=m.inspection_id WHERE m.id>$1 ORDER BY m.id LIMIT 200`,
      [cursor],
    );
    if (!rows.length) break;
    for (const media of rows) {
      cursor = media.id;
      report.mediaChecked++;
      const parts = await db.query<Part>(
        "SELECT part,hash,bytes,object_key FROM evidence_parts WHERE media_id=$1 ORDER BY part",
        [media.id],
      );
      for (const part of parts) {
        report.partsChecked++;
        try {
          const bytes = await read(part.object_key);
          if (sha(bytes) !== part.hash) report.failures.partHash++;
          if (bytes.length !== part.bytes) report.failures.partSize++;
        } catch {
          report.failures.unreadablePart++;
        }
      }
      if (media.receipt_id) {
        const expected = Math.ceil(media.expected_bytes / CHUNK_SIZE);
        if (
          parts.length !== expected ||
          parts.some(
            (p, index) =>
              p.part !== index ||
              p.bytes !==
                Math.min(CHUNK_SIZE, media.expected_bytes - index * CHUNK_SIZE),
          )
        )
          report.failures.partManifest++;
        if (!media.object_key || !media.server_hash)
          report.failures.receiptLink++;
        else {
          report.originalsChecked++;
          try {
            const bytes = await read(media.object_key);
            const digest = sha(bytes);
            if (digest !== media.server_hash || digest !== media.expected_hash)
              report.failures.originalHash++;
            if (bytes.length !== media.expected_bytes)
              report.failures.originalSize++;
          } catch {
            report.failures.unreadableOriginal++;
          }
        }
      }
      if (
        media.inspection_status === "server_received" &&
        (!media.inspection_receipt || !media.receipt_id)
      )
        report.failures.receiptLink++;
    }
  }
  report.ok = Object.values(report.failures).every((count) => count === 0);
  return report;
}

if (process.argv[1]?.endsWith("evidence-integrity.ts")) {
  if (process.env.IBVS_RUN_INTEGRITY_CHECK !== "true") {
    console.error(
      "Explicit IBVS_RUN_INTEGRITY_CHECK=true is required; use a quiesced isolated restore first.",
    );
    process.exitCode = 1;
  } else {
    const { getDb, closeDb } = await import("../apps/web/src/server/db");
    const { readPrivate } =
      await import("../apps/web/src/server/evidence-storage");
    try {
      if (
        !process.env.IBVS_EVIDENCE_DIR ||
        !path.isAbsolute(process.env.IBVS_EVIDENCE_DIR)
      )
        throw new Error("Explicit absolute evidence directory required");
      if (!(await stat(process.env.IBVS_EVIDENCE_DIR)).isDirectory())
        throw new Error("Evidence directory must already exist");
      if (!process.env.DATABASE_URL) {
        const local = process.env.IBVS_LOCAL_DB;
        if (
          !local ||
          !path.isAbsolute(local) ||
          !(await stat(local)).isDirectory()
        )
          throw new Error("Explicit existing absolute local database required");
      }
      const db = await getDb();
      const report = await db.transaction(async (tx) => {
        await tx.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        return reconcileEvidence(tx, readPrivate);
      });
      console.log(JSON.stringify(report));
      if (!report.ok) process.exitCode = 1;
    } catch {
      console.error(
        "Evidence reconciliation failed; inspect configuration privately. No repairs performed.",
      );
      process.exitCode = 1;
    } finally {
      await closeDb();
    }
  }
}
