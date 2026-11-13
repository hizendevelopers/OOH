// Public entry point for evidence bytes. Callers keep using putPrivate and readPrivate;
// the configured backend (the database, S3-compatible object storage or a single-host
// filesystem) is chosen in evidence-store.ts. Pass the open transaction when there is one.
import type { Database } from "./db";
import { evidenceStore } from "./evidence-store";

export { evidenceRoot } from "./evidence-store";

export async function putPrivate(key: string, data: Buffer, db?: Database) {
  await evidenceStore().put(key, data, db);
}

export async function readPrivate(key: string, db?: Database) {
  return evidenceStore().get(key, db);
}
