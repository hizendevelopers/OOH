import FieldWorkspace from "@/field/workspace";
import "./field.css";
export const metadata = { title: "IBVS · Worker field inspections" };
// This shell is intentionally public/static and contains no actor, tasks or evidence.
export default function Page() {
  return <FieldWorkspace />;
}
