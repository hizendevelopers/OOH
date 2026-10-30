import { expect, it } from "vitest";
import { databaseOptions } from "../apps/web/src/server/database-options";
import { environment } from "../apps/web/src/server/env";

const base = () => ({
  ...environment(),
  DATABASE_SCHEMA: "ibvs",
  DATABASE_POOL_MAX: 3,
});
it("requires verified TLS for Supabase and keeps credentials on the server", () => {
  const options = databaseOptions({
    ...base(),
    DATABASE_URL:
      "postgresql://ibvs_app:private@db.project.supabase.co/postgres",
  });
  expect(options.ssl).toEqual({ rejectUnauthorized: true });
  expect(options.options).toBe("-c search_path=ibvs,extensions,public");
  expect(options.max).toBe(3);
  expect(options.connectionTimeoutMillis).toBe(10000);
});
it.each(["disable", "require", "verify-ca"])(
  "refuses Supabase sslmode=%s instead of weakening certificate checks",
  (sslmode) => {
    expect(() =>
      databaseOptions({
        ...base(),
        DATABASE_URL: `postgresql://ibvs_app:private@db.project.supabase.co/postgres?sslmode=${sslmode}`,
      }),
    ).toThrow("sslmode=verify-full");
  },
);
it("supports local PostgreSQL without requiring Supabase TLS", () => {
  expect(
    databaseOptions({ ...base(), DATABASE_URL: "postgresql://localhost/ibvs" })
      .ssl,
  ).toBeUndefined();
});
