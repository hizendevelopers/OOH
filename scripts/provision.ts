import { provision } from "../apps/web/src/server/provision";
import { closeDb } from "../apps/web/src/server/db";
export { provision };
if (process.argv[1]?.endsWith("provision.ts")) {
  const run = async () => {
    const password = process.env.IBVS_USER_PASSWORD;
    if (!password)
      throw new Error(
        "Set IBVS_USER_PASSWORD in the environment (minimum 12 characters); never pass it on the command line",
      );
    const [email, name, role, organizationId] = process.argv.slice(2);
    if (role !== "admin" && role !== "worker")
      throw new Error(
        "Usage: npm run user:create -- email name admin|worker organizationId",
      );
    await provision({ email, name, password, role, organizationId });
    console.log("User provisioned. Password was not printed.");
  };
  run()
    .then(closeDb)
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
