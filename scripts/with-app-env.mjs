import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../apps/web/", import.meta.url));
nextEnv.loadEnvConfig(appDirectory, process.env.NODE_ENV !== "production");
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
