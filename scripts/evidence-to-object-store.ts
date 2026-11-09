// One-time copy of existing private evidence from the local directory to the
// S3-compatible store. Dry run by default. Originals are never deleted or modified.
// Usage:
//   npx tsx scripts/evidence-to-object-store.ts              (dry run, lists files)
//   npx tsx scripts/evidence-to-object-store.ts --apply      (copies and verifies)
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { S3EvidenceStore, createEvidenceStoreFromEnv, sha256Hex, validateEvidenceKey } from "../apps/web/src/server/evidence-store";

const source = process.env.IBVS_EVIDENCE_DIR;
if (!source || !path.isAbsolute(source)) throw new Error("IBVS_EVIDENCE_DIR must point at the existing absolute evidence directory");
const apply = process.argv.includes("--apply");
// The object store is needed only when copying; a dry run needs no storage settings.
const target = apply ? createEvidenceStoreFromEnv({ ...process.env, IBVS_EVIDENCE_STORE: "s3" }) : null;
if (apply && !(target instanceof S3EvidenceStore)) throw new Error("Target must be the S3 evidence store");

async function* files(directory: string, relative = ""): AsyncGenerator<string> {
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) yield* files(directory, next);
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) yield next;
  }
}

let copied = 0, skipped = 0, failed = 0;
for await (const key of files(source)) {
  let k: string;
  try {
    k = validateEvidenceKey(key.split(path.sep).join("/"));
  } catch {
    console.log(`skip (not an evidence key): ${key}`);
    skipped++;
    continue;
  }
  const data = await readFile(path.join(source, key));
  const size = (await stat(path.join(source, key))).size;
  if (size !== data.length) throw new Error("Size changed while reading " + key);
  if (!apply) {
    console.log(`would copy ${key} (${data.length} bytes, sha256 ${sha256Hex(data)})`);
    continue;
  }
  try {
    await target!.put(k, data);
    const back = await target!.get(k);
    if (sha256Hex(back) !== sha256Hex(data)) throw new Error("Read-back hash mismatch");
    copied++;
    console.log(`copied and verified ${key}`);
  } catch (error) {
    failed++;
    console.error(`FAILED ${key}: ${(error as Error).message}`);
  }
}
console.log(apply ? `done: copied ${copied}, skipped ${skipped}, failed ${failed}. Local originals were not changed.` : "dry run only; add --apply to copy");
