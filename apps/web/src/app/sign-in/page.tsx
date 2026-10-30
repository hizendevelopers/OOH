import SignIn from "@/components/sign-in";
import { redirect } from "next/navigation";
import { signInRequired } from "@/server/access";
export const dynamic = "force-dynamic";
export default function Page() {
  if (!signInRequired()) redirect("/");
  return <SignIn />;
}
