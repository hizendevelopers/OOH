import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { ApiError } from "./service";
import type { Actor } from "@ibvs/domain";
import { environment } from "./env";
import type { ServerActor } from "./mfa-gate";

export function signInRequired() {
  const env = environment();
  // A hosted installation must never expose an administrator without a session.
  return (
    (env.NODE_ENV === "production" && env.IBVS_ALLOW_LOCAL_DB !== "true") ||
    env.IBVS_REQUIRE_SIGN_IN === "true"
  );
}

// Every value here is read from the database or the authenticated session on the server.
// Client-supplied flags and claims are never used.
export async function currentActor(): Promise<ServerActor> {
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
    return { ...admin, secondFactor: { localOpen: true } };
  }
  const auth = await getAuth();
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.session || !result.user) throw new ApiError(401, "Sign in required");
  const db = await getDb();
  const [member] = await db.query<{ organization_id: string; role: "admin" | "worker" }>(
    "SELECT organization_id,role FROM organization_members WHERE user_id=$1",
    [result.user.id],
  );
  if (!member) throw new ApiError(403, "No active organization membership");
  const [security] = await db.query<{ enabled: boolean | null; verified_at: Date | string | null }>(
    `SELECT u."twoFactorEnabled" AS enabled,
       (SELECT max(t."verifiedAt") FROM "twoFactor" t WHERE t."userId" = u.id AND t.verified) AS verified_at
     FROM "user" u WHERE u.id = $1`,
    [result.user.id],
  );
  const verifiedAt = security?.verified_at ? new Date(security.verified_at).getTime() : null;
  const createdAt = result.session.createdAt ? new Date(result.session.createdAt).getTime() : null;
  return {
    id: result.user.id,
    organizationId: member.organization_id,
    role: member.role,
    name: result.user.name,
    email: result.user.email,
    secondFactor: {
      enrolled: security?.enabled === true,
      verifiedAt: verifiedAt !== null && Number.isFinite(verifiedAt) ? verifiedAt : null,
      sessionCreatedAt: createdAt !== null && Number.isFinite(createdAt) ? createdAt : null,
    },
  };
}
