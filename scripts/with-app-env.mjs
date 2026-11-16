import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../apps/web/", import.meta.url));
nextEnv.loadEnvConfig(appDirectory, process.env.NODE_ENV !== "production");

// Supabase signs its database certificates with a private root that Node does not bundle, so an
// operator script otherwise fails with "self-signed certificate in certificate chain" on a machine
// that has not been wired up by hand. The same CA the Docker image uses is committed in this
// repository, so certificate and hostname verification stay on everywhere instead of each operator
// arranging it, or turning verification off to get past it. The child process reads this at startup.
const supabaseCa = fileURLToPath(new URL("../db/certs/supabase-ca.crt", import.meta.url));
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(supabaseCa))
  process.env.NODE_EXTRA_CA_CERTS = supabaseCa;
const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error("A database script is required");
const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
  stdio: "inherit",
  env: process.env,
});
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
