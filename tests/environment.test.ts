import { afterEach, it, expect, vi } from "vitest";
import { environment } from "../apps/web/src/server/env";
import path from "node:path";
const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});
it("fails closed in production without prerequisites", () => {
  vi.stubEnv("NODE_ENV", "production");
  delete process.env.DATABASE_URL;
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.IBVS_ALLOW_LOCAL_DB;
  expect(() => environment()).toThrow("Production requires");
});
it("validates origins and never reflects secret values in errors", () => {
  vi.stubEnv("NODE_ENV", "test");
  process.env.BETTER_AUTH_URL = "https://example.com/path";
  process.env.BETTER_AUTH_SECRET = "short-test-value";
  expect(() => environment()).toThrow("Invalid environment fields");
  try {
    environment();
  } catch (e) {
    expect((e as Error).message).not.toContain("short-test-value");
  }
});
it("requires HTTPS in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgresql://localhost/ibvs";
  process.env.BETTER_AUTH_SECRET = "test-only-value-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://example.com";
  delete process.env.IBVS_ALLOW_LOCAL_DB;
  expect(() => environment()).toThrow("HTTPS");
});
it("requires private evidence configuration in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgresql://localhost/ibvs";
  process.env.BETTER_AUTH_SECRET = "test-only-value-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "https://example.com";
  delete process.env.IBVS_ALLOW_LOCAL_DB;
  delete process.env.IBVS_EVIDENCE_DIR;
  expect(() => environment()).toThrow("IBVS_EVIDENCE_DIR");
});
it("rejects relative production evidence configuration before database or file access without exposing its value", () => {
  vi.stubEnv("NODE_ENV", "production");
  process.env.DATABASE_URL = "postgresql://localhost/ibvs";
  process.env.BETTER_AUTH_SECRET = "test-only-value-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "https://example.com";
  delete process.env.IBVS_ALLOW_LOCAL_DB;
  process.env.IBVS_EVIDENCE_DIR = "private-relative-test-path";
  expect(() => environment()).toThrow("absolute IBVS_EVIDENCE_DIR");
  try {
    environment();
  } catch (e) {
    expect((e as Error).message).not.toContain("private-relative-test-path");
  }
  process.env.IBVS_EVIDENCE_DIR = path.resolve(".local/private-fixture");
  expect(environment().IBVS_EVIDENCE_DIR).toBe(process.env.IBVS_EVIDENCE_DIR);
});
