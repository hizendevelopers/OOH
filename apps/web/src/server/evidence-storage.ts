import path from "node:path";
import { mkdir, writeFile, readFile, link, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { root } from "./db";

// Private, single-host storage. No filename or path component comes from a client.
export function evidenceRoot() {
  const configured = process.env.IBVS_EVIDENCE_DIR;
  if (configured && !path.isAbsolute(configured))
    throw new Error("IBVS_EVIDENCE_DIR must be absolute");
  if (
    !configured &&
    process.env.NODE_ENV === "production" &&
    process.env.IBVS_ALLOW_LOCAL_DB !== "true"
  )
    throw new Error("Production requires private persistent IBVS_EVIDENCE_DIR");
  const directory = path.resolve(/* turbopackIgnore: true */
    configured || path.join(root(), ".local", "evidence"),
  );
  const publicDirectory = path.resolve(root(), "apps", "web");
  if (
    directory === publicDirectory ||
    directory.startsWith(publicDirectory + path.sep)
  )
    throw new Error("Evidence cannot be stored under the web application directory");
  return directory;
}
function filename(key: string) {
  if (
    !/^[a-f0-9-]{36}\/(?:front|wide)\/(?:[0-9]{1,2}-[a-f0-9]{64}|original-[a-f0-9]{64})$/.test(
      key,
    )
  )
    throw new Error("Invalid internal evidence key");
  return path.join(evidenceRoot(), ...key.split("/"));
}
export async function putPrivate(key: string, data: Buffer) {
  const file = filename(key);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + randomUUID() + ".tmp";
  await writeFile(temp, data, { flag: "wx", mode: 0o600 });
  try {
    await link(temp, file);
  } catch (e) {
    if ((e as { code?: string }).code !== "EEXIST") throw e;
  } finally {
    await unlink(temp);
  }
}
export const readPrivate = (key: string) => readFile(filename(key));
