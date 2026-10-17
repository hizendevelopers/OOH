import { z } from "zod";
import path from "node:path";

const schema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "PostgreSQL URL required",
    )
    .optional(),
  BETTER_AUTH_URL: z
    .url()
    .refine(
      (value) => new URL(value).origin === value,
      "Use an origin without path or trailing slash",
    )
    .default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  IBVS_ALLOW_LOCAL_DB: z.enum(["true", "false"]).default("false"),
  IBVS_EVIDENCE_DIR: z.string().min(1).optional(),
});
export function environment() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Invalid environment fields: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  const env = result.data;
  if (env.NODE_ENV === "production" && env.IBVS_ALLOW_LOCAL_DB !== "true") {
    if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET)
      throw new Error(
        "Production requires DATABASE_URL and BETTER_AUTH_SECRET",
      );
    if (!env.BETTER_AUTH_URL.startsWith("https://"))
      throw new Error("Production requires an HTTPS BETTER_AUTH_URL");
    if (!env.IBVS_EVIDENCE_DIR)
      throw new Error(
        "Production requires IBVS_EVIDENCE_DIR for private persistent evidence",
      );
    if (!path.isAbsolute(env.IBVS_EVIDENCE_DIR))
      throw new Error("Production requires an absolute IBVS_EVIDENCE_DIR");
  }
  return env;
}
