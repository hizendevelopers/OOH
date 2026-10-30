import FieldWorkspace from "@/field/workspace";
import { redirect } from "next/navigation";
import { signInRequired } from "@/server/access";
import "./field.css";
export const metadata = { title: "IBVS · Worker field inspections" };
// This shell contains no actor, tasks or evidence.
export const dynamic = "force-dynamic";
export default function Page() {
  if (!signInRequired()) redirect("/");
  return <FieldWorkspace />;
}
