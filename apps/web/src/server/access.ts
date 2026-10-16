import { headers } from "next/headers";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { ApiError } from "./service";
import type { Actor } from "@ibvs/domain";
export async function currentActor(): Promise<Actor> {
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
