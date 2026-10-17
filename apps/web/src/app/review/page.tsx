import { redirect } from "next/navigation";
import { currentActor } from "@/server/access";
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
  return <ReviewWorkspace actor={actor} />;
}
