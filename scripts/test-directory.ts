import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
export async function testDirectory(prefix: string) {
  const base = path.resolve(".local", "test-data");
  await mkdir(base, { recursive: true });
  return mkdtemp(path.join(base, prefix));
}
