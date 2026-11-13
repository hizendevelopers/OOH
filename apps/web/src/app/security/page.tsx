import { redirect } from "next/navigation";
import { currentActor } from "@/server/access";
import { ApiError } from "@/server/service";
import SecuritySettings from "@/components/security-settings";
export const dynamic = "force-dynamic";

// Enrollment page. It does not require a verified second factor, so an administrator who has not enrolled can
// finish setup. Every data route still requires it.
export default async function Page() {
  try {
    await currentActor();
  } catch (e) {
    if (e instanceof ApiError && [401, 403].includes(e.status)) redirect("/sign-in");
    throw e;
  }
  return (
    <main className="service-error">
      {/* The heading is rendered by SecuritySettings so it follows the chosen language. */}
      <SecuritySettings />
    </main>
  );
}
