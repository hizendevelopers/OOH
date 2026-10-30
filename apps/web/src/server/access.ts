import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { ApiError } from "./service";
import type { Actor } from "@ibvs/domain";
import { environment } from "./env";

export function signInRequired() {
  const env = environment();
  // A hosted installation must never expose an administrator without a session.
  return (
    (env.NODE_ENV === "production" && env.IBVS_ALLOW_LOCAL_DB !== "true") ||
    env.IBVS_REQUIRE_SIGN_IN === "true"
  );
}

export async function currentActor(): Promise<Actor> {
  if (!signInRequired()) {
    const [admin] = await (
      await getDb()
    ).query<Actor>(
      `SELECT u.id, m.organization_id AS "organizationId", m.role, u.name, u.email
       FROM organization_members m JOIN "user" u ON u.id = m.user_id
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.role = 'admin' AND o.is_demo = false
         AND ($1::text IS NULL OR m.organization_id = $1)
       ORDER BY m.organization_id, u.id LIMIT 1`,
      [environment().IBVS_WORKSPACE_ID ?? null],
    );
    if (!admin)
      throw new ApiError(
        503,
        "Provision an administrator to open the workspace",
      );
    return admin;
  }
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new ApiError(401, "Sign in required");
  const [member] = await (
    await getDb()
  ).query<{ organization_id: string; role: "admin" | "worker" }>(
    "SELECT organization_id,role FROM organization_members WHERE user_id=$1",
    [session.user.id],
  );
  if (!member) throw new ApiError(403, "No active organization membership");
  return {
    id: session.user.id,
    organizationId: member.organization_id,
    role: member.role,
    name: session.user.name,
    email: session.user.email,
  };
}
