import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb, closeDb } from "../apps/web/src/server/db";
const [name, requestedId] = process.argv.slice(2);
const input = z
  .object({
    name: z.string().trim().min(1).max(120),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  })
  .parse({ name, id: requestedId || randomUUID() });
try {
  await (
    await getDb()
  ).query("INSERT INTO organizations(id,name) VALUES($1,$2)", [
    input.id,
    input.name,
  ]);
  console.log(`Organization created: ${input.id}`);
} catch {
  console.error(
    "Organization creation failed. Check migrations and duplicate ID.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}
