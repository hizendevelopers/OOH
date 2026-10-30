import { redirect } from "next/navigation";
import { currentActor, signInRequired } from "@/server/access";
import { ApiError } from "@/server/service";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  let actor;
  try {
    actor = await currentActor();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      redirect("/sign-in");
  }
  if (actor)
    return <Workspace actor={actor} signInRequired={signInRequired()} />;
  return (
    <main className="service-error">
      <h1>IBVS needs database setup</h1>
      <p>
        Run the migration and provision an administrator. Check server
        configuration.
      </p>
      {signInRequired() && <a href="/sign-in">Open sign in</a>}
    </main>
  );
}
