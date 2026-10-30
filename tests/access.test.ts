import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { query, getSession } = vi.hoisted(() => ({
  query: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../apps/web/src/server/auth", () => ({
  getAuth: async () => ({ api: { getSession } }),
}));
vi.mock("../apps/web/src/server/db", () => ({
  getDb: async () => ({ query }),
}));
import { currentActor } from "../apps/web/src/server/access";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("IBVS_REQUIRE_SIGN_IN", "false");
  query.mockReset();
  getSession.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

it("opens as an existing administrator without a session when login is disabled", async () => {
  const admin = {
    id: "admin",
    organizationId: "org",
    role: "admin",
    name: "Admin",
    email: "admin@example.test",
  };
  query.mockResolvedValue([admin]);
  expect(await currentActor()).toEqual(admin);
  expect(getSession).not.toHaveBeenCalled();
});

it("requires setup instead of inventing an administrator when none exists", async () => {
  query.mockResolvedValue([]);
  await expect(currentActor()).rejects.toMatchObject({ status: 503 });
});

it("restores the session requirement when login is enabled", async () => {
  vi.stubEnv("IBVS_REQUIRE_SIGN_IN", "true");
  getSession.mockResolvedValue(null);
  await expect(currentActor()).rejects.toMatchObject({ status: 401 });
  expect(query).not.toHaveBeenCalled();
});

it("preserves the signed-in user's role and organization when login is enabled", async () => {
  vi.stubEnv("IBVS_REQUIRE_SIGN_IN", "true");
  getSession.mockResolvedValue({
    user: { id: "worker", name: "Worker", email: "worker@example.test" },
  });
  query.mockResolvedValue([{ organization_id: "worker-org", role: "worker" }]);
  await expect(currentActor()).resolves.toMatchObject({
    id: "worker",
    organizationId: "worker-org",
    role: "worker",
  });
});
