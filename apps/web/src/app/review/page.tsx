import { redirect } from "next/navigation";
import { currentActor } from "@/server/access";
import { evaluateAccess } from "@/server/mfa-gate";
import { ApiError } from "@/server/service";
import ReviewWorkspace from "@/review/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  let actor;
  try {
    actor = await currentActor();
  } catch (e) {
    if (e instanceof ApiError && [401, 403].includes(e.status))
      redirect("/sign-in");
    throw e;
  }
  if (actor.role !== "admin") redirect("/field");
  const decision = evaluateAccess(actor, "ordinary");
  if (!decision.allowed) redirect(decision.code === "MFA_SETUP_REQUIRED" ? "/security" : "/sign-in?reauth=1");
  return <ReviewWorkspace actor={actor} />;
}
