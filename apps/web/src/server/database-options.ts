import type { PoolConfig } from "pg";
import type { environment } from "./env";

export function databaseOptions(
  env: ReturnType<typeof environment>,
): PoolConfig {
  const url = new URL(env.DATABASE_URL!);
  const supabase =
    url.hostname.endsWith(".supabase.co") ||
    url.hostname.endsWith(".pooler.supabase.com");
  // TLS parameters in a connection string override node-postgres's ssl option.
  // Require certificate validation on Supabase, including when a URL was copied
  // with sslmode=require (which otherwise disables validation in pg).
  if (supabase) {
    if (
      url.searchParams.has("sslmode") &&
      url.searchParams.get("sslmode") !== "verify-full"
    )
      throw new Error(
        "Supabase DATABASE_URL must use sslmode=verify-full or omit sslmode",
      );
    if (url.searchParams.has("ssl") && url.searchParams.get("ssl") !== "true")
      throw new Error("Supabase database connections require TLS");
  }
  return {
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    application_name: "ibvs-web",
    options: `-c search_path=${env.DATABASE_SCHEMA},extensions,public`,
    ...(supabase ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}
