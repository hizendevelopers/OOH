import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAuth } from "./auth";
import { getDb } from "./db";
import { ApiError } from "./service";
export async function provision(
  input: {
    email: string;
    name: string;
    password: string;
    role: "admin" | "worker";
    organizationId: string;
  },
  actorId?: string,
) {
  input = z
    .object({
      email: z.email().max(254),
      name: z.string().trim().min(1).max(120),
      password: z.string().min(12).max(128),
      role: z.enum(["admin", "worker"]),
      organizationId: z.string().min(1),
    })
    .parse(input);
  const db = await getDb();
  const org = await db.query("SELECT id FROM organizations WHERE id=$1", [
    input.organizationId,
  ]);
  if (!org.length) throw new Error("Organization not found");
  input.email = input.email.toLowerCase();
  if (
    (await db.query('SELECT id FROM "user" WHERE email=$1', [input.email]))
      .length
  )
    throw new ApiError(409, "An account with this email already exists");
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
        "INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          input.organizationId,
          actorId ?? result.user.id,
          "user.provisioned",
          result.user.id,
        ],
      );
    });
  } catch (e) {
    await db.query('DELETE FROM "user" WHERE id=$1', [result.user.id]);
    throw e;
  }
  return result.user;
}
