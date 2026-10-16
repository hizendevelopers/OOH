import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const environment: {
  -readonly [K in keyof NodeJS.ProcessEnv]: NodeJS.ProcessEnv[K];
} = {
  ...process.env,
  IBVS_DEMO_PASSWORD: randomBytes(32).toString("base64url"),
  IBVS_LOCAL_DB: await mkdtemp(path.join(tmpdir(), "ibvs-browser-")),
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  BETTER_AUTH_URL: "http://localhost:3000",
};
delete environment.DATABASE_URL;
async function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      env: environment,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Check failed (${code})`)),
    );
  });
}
await run(["--import", "tsx", "scripts/seed.ts"]);
environment.IBVS_E2E_PRODUCTION = "true";
environment.IBVS_ALLOW_LOCAL_DB = "true";
environment.NODE_ENV = "production";
await run(["node_modules/@playwright/test/cli.js", "test"]);
