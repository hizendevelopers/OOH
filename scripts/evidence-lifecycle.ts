import { lstat, opendir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { Database } from "../apps/web/src/server/db";

const keyPattern =
  /^[a-f0-9-]{36}\/(front|wide)\/(?:[0-9]{1,2}-[a-f0-9]{64}|original-[a-f0-9]{64})$/;
const temporaryPattern = /\.[a-f0-9-]{36}\.tmp$/;

/** Inventory only. No retention policy or legal-hold model grants deletion authority. */
export async function planEvidenceLifecycle(
  db: Database,
  directory: string,
  options: { maxEntries?: number; now?: number } = {},
) {
  if (!path.isAbsolute(directory)) throw new Error("Absolute root required");
  const resolved = path.resolve(directory);
  const info = await lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("Existing nonsymlink directory required");
  if ((await realpath(resolved)) !== resolved)
    throw new Error("Canonical root required");
  const maxEntries = options.maxEntries ?? 100_000;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 100_000)
    throw new Error("Invalid inventory bound");
  const report = {
    dryRun: true,
    entriesSeen: 0,
    referencedFiles: 0,
    unregisteredObjects: 0,
    temporaryFiles: 0,
    temporaryOlderThan24h: 0,
    unknownFiles: 0,
    skippedLinksOrSpecial: 0,
    retainedFiles: 0,
    deletionEligible: 0,
    policy: "No approved retention/hold policy; retain every object",
  };
  const batch: string[] = [];
  async function flush() {
    if (!batch.length) return;
    const rows = await db.query<{ object_key: string }>(
      "SELECT object_key FROM media_evidence WHERE object_key=ANY($1::text[]) UNION SELECT object_key FROM evidence_parts WHERE object_key=ANY($1::text[])",
      [batch],
    );
    const referenced = new Set(rows.map((row) => row.object_key));
    for (const key of batch)
      if (referenced.has(key)) report.referencedFiles++;
      else report.unregisteredObjects++;
    batch.length = 0;
  }
  async function walk(current: string, depth: number) {
    const entries = await opendir(current);
    for await (const entry of entries) {
      if (++report.entriesSeen > maxEntries)
        throw new Error("Inventory entry bound exceeded; no complete plan");
      const filename = path.join(current, entry.name);
      const relative = path.relative(resolved, filename);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Inventory boundary failure");
      // lstat avoids following static symlinks/junctions; run on a quiesced restore.
      const item = await lstat(filename);
      if (item.isSymbolicLink()) report.skippedLinksOrSpecial++;
      else if (item.isDirectory()) {
        if (depth >= 3) throw new Error("Unexpected directory depth");
        await walk(filename, depth + 1);
      } else if (item.isFile()) {
        report.retainedFiles++;
        const key = relative.split(path.sep).join("/");
        if (keyPattern.test(key)) {
          batch.push(key);
          if (batch.length >= 200) await flush();
        } else if (
          temporaryPattern.test(key) &&
          keyPattern.test(key.replace(temporaryPattern, ""))
        ) {
          report.temporaryFiles++;
          if ((options.now ?? Date.now()) - item.mtimeMs > 86_400_000)
            report.temporaryOlderThan24h++;
        } else report.unknownFiles++;
      } else report.skippedLinksOrSpecial++;
    }
  }
  await walk(resolved, 0);
  await flush();
  return report;
}

if (process.argv[1]?.endsWith("evidence-lifecycle.ts")) {
  if (process.env.IBVS_RUN_LIFECYCLE_PLAN !== "true") {
    console.error(
      "Explicit IBVS_RUN_LIFECYCLE_PLAN=true required; isolated quiesced targets only.",
    );
    process.exitCode = 1;
  } else {
    const { getDb, closeDb } = await import("../apps/web/src/server/db");
    try {
      const directory = process.env.IBVS_EVIDENCE_DIR;
      if (!directory || !path.isAbsolute(directory))
        throw new Error("Explicit root required");
      if (!process.env.DATABASE_URL) {
        const local = process.env.IBVS_LOCAL_DB;
        if (
          !local ||
          !path.isAbsolute(local) ||
          !(await stat(local)).isDirectory()
        )
          throw new Error("Explicit existing database required");
      }
      // Validate root before getDb can create/open anything.
      if (
        !(await lstat(directory)).isDirectory() ||
        (await realpath(directory)) !== path.resolve(directory)
      )
        throw new Error("Canonical existing root required");
      const db = await getDb();
      const report = await db.transaction(async (tx) => {
        await tx.query(
          "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        );
        return planEvidenceLifecycle(tx, directory);
      });
      console.log(JSON.stringify(report));
    } catch {
      console.error(
        "Lifecycle inventory incomplete. No files changed; inspect configuration privately.",
      );
      process.exitCode = 1;
    } finally {
      await closeDb();
    }
  }
}
