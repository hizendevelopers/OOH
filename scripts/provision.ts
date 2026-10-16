import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAuth } from "../apps/web/src/server/auth";
import { getDb, closeDb } from "../apps/web/src/server/db";
export async function provision(input: {
  email: string;
  name: string;
  password: string;
  role: "admin" | "worker";
  organizationId: string;
}) {
  z.object({
    email: z.email(),
    name: z.string().min(1),
    password: z.string().min(12),
    role: z.enum(["admin", "worker"]),
    organizationId: z.string().min(1),
  }).parse(input);
  const db = await getDb();
  const org = await db.query("SELECT id FROM organizations WHERE id=$1", [
    input.organizationId,
  ]);
  if (!org.length) throw new Error("Organization not found");
  const auth = await createAuth(true);
  const result = await auth.api.signUpEmail({
    body: { email: input.email, password: input.password, name: input.name },
  });
  try {
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",
        [input.organizationId, result.user.id, input.role],
      );
      if (input.role === "worker")
        await tx.query(
          "INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)",
          [result.user.id, input.organizationId],
        );
      await tx.query(
        "INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4,$3)",
        [
          randomUUID(),
          input.organizationId,
          result.user.id,
          "user.provisioned",
        ],
      );
    });
  } catch (e) {
    await db.query('DELETE FROM "user" WHERE id=$1', [result.user.id]);
    throw e;
  }
  return result.user;
}
if (process.argv[1]?.endsWith("provision.ts")) {
  const run = async () => {
    const password = process.env.IBVS_USER_PASSWORD;
    if (!password)
      throw new Error(
        "Set IBVS_USER_PASSWORD in the environment (minimum 12 characters); never pass it on the command line",
      );
    const [email, name, role, organizationId] = process.argv.slice(2);
    if (role !== "admin" && role !== "worker")
      throw new Error(
        "Usage: npm run user:create -- email name admin|worker organizationId",
      );
    await provision({ email, name, password, role, organizationId });
    console.log("User provisioned. Password was not printed.");
  };
  run()
    .then(closeDb)
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
