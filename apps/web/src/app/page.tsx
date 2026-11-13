import { redirect } from "next/navigation";
import { currentActor, signInRequired } from "@/server/access";
import { evaluateAccess } from "@/server/mfa-gate";
import { ApiError } from "@/server/service";
import Workspace from "@/components/workspace";
import { ConfigurationError } from "@/server/env";
export const dynamic = "force-dynamic";
export default async function Page() {
  let actor;
  let requiresSignIn = false;
  try {
    requiresSignIn = signInRequired();
    actor = await currentActor();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      redirect("/sign-in");
    console.error(
      JSON.stringify({
        category:
          e instanceof ConfigurationError
            ? "configuration_error"
            : "workspace_load_failed",
        ...(e instanceof ConfigurationError ? { message: e.message } : {}),
      }),
    );
  }
  // Workers have one app: the field workspace. The operations workspace is for administrators.
  if (actor && requiresSignIn && actor.role === "worker") redirect("/field");
  if (actor) {
    // Administrators must have a verified second factor before the workspace opens.
    const decision = evaluateAccess(actor, "ordinary");
    if (!decision.allowed)
      redirect(decision.code === "MFA_SETUP_REQUIRED" ? "/security" : "/sign-in?reauth=1");
  }
  if (actor) return <Workspace actor={actor} signInRequired={requiresSignIn} />;
  return (
    <main className="service-error">
      <h1>IBVS needs database setup</h1>
      <p>
        Run the migration and provision an administrator. Check server
        configuration.
      </p>
      {requiresSignIn && <a href="/sign-in">Open sign in</a>}
    </main>
  );
}
