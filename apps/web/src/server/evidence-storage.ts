// Public entry point for evidence bytes. Callers keep using putPrivate and readPrivate;
// the configured backend (S3-compatible object storage or a single-host filesystem) is
// chosen in evidence-store.ts.
import { evidenceStore } from "./evidence-store";

export { evidenceRoot } from "./evidence-store";

export async function putPrivate(key: string, data: Buffer) {
  await evidenceStore().put(key, data);
}

export async function readPrivate(key: string) {
  return evidenceStore().get(key);
}
