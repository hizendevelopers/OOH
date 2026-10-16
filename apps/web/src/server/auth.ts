import { betterAuth } from "better-auth";
import { authDatabase } from "./db";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { root } from "./db";
import { environment } from './env';

async function secret() {
  if (process.env.BETTER_AUTH_SECRET) {
    if (process.env.BETTER_AUTH_SECRET.length < 32)
      throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
    return process.env.BETTER_AUTH_SECRET;
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.IBVS_ALLOW_LOCAL_DB !== "true"
  )
    throw new Error("Production requires BETTER_AUTH_SECRET");
  const file = path.join(root(), ".local", "auth-secret");
  await mkdir(path.dirname(file), { recursive: true });
  try {
    return await readFile(file, "utf8");
  } catch {
    const value = randomBytes(48).toString("base64url");
    try {
      await writeFile(file, value, { flag: "wx", mode: 0o600 });
      return value;
    } catch {
      return readFile(file, "utf8");
    }
  }
}
export async function createAuth(provision = false) {
  const env=environment();
  return betterAuth({
    database: await authDatabase(),
    secret: await secret(),
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !provision,
      minPasswordLength: 12,
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 50,
      customRules: { "/sign-in/email": { window: 60, max: 8 } },
    },
    advanced: {
      useSecureCookies:
        process.env.NODE_ENV === "production" &&
        process.env.IBVS_ALLOW_LOCAL_DB !== "true",
    },
    logger: { level: "error" },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export const getAuth = () => (instance ??= createAuth());
