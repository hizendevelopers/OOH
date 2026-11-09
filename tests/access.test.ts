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
  // Local open workspace only: the actor carries an explicit local marker, never an enrolled second factor.
  expect(await currentActor()).toEqual({ ...admin, secondFactor: { localOpen: true } });
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

it("requires sign-in on a hosted installation even when the old bypass setting is false", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/postgres");
  vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(48));
  vi.stubEnv("BETTER_AUTH_URL", "https://ooh.example.com");
  vi.stubEnv("IBVS_EVIDENCE_DIR", process.cwd());
  vi.stubEnv("IBVS_ALLOW_LOCAL_DB", "false");
  getSession.mockResolvedValue(null);
  await expect(currentActor()).rejects.toMatchObject({ status: 401 });
  expect(query).not.toHaveBeenCalled();
});

it("preserves the signed-in user's role and organization when login is enabled", async () => {
  vi.stubEnv("IBVS_REQUIRE_SIGN_IN", "true");
  getSession.mockResolvedValue({
    session: { createdAt: new Date(Date.now() - 60000) },
    user: { id: "worker", name: "Worker", email: "worker@example.test" },
  });
  query.mockResolvedValueOnce([{ organization_id: "worker-org", role: "worker" }]);
  query.mockResolvedValueOnce([{ enabled: false, verified_at: null }]);
  await expect(currentActor()).resolves.toMatchObject({
    id: "worker",
    organizationId: "worker-org",
    role: "worker",
    secondFactor: { enrolled: false, verifiedAt: null },
  });
});

it("derives second-factor state from the database and the session, never from the client", async () => {
  vi.stubEnv("IBVS_REQUIRE_SIGN_IN", "true");
  const verifiedAt = new Date(Date.now() - 3600000);
  const createdAt = new Date(Date.now() - 60000);
  getSession.mockResolvedValue({ session: { createdAt }, user: { id: "admin", name: "Admin", email: "admin@example.test" } });
  query.mockResolvedValueOnce([{ organization_id: "org", role: "admin" }]);
  query.mockResolvedValueOnce([{ enabled: true, verified_at: verifiedAt }]);
  const actor = await currentActor();
  expect(actor.secondFactor).toEqual({ enrolled: true, verifiedAt: verifiedAt.getTime(), sessionCreatedAt: createdAt.getTime() });
  // A session with no creation time gives no session age, so sensitive actions are refused later.
  getSession.mockResolvedValue({ session: {}, user: { id: "admin", name: "Admin", email: "admin@example.test" } });
  query.mockResolvedValueOnce([{ organization_id: "org", role: "admin" }]);
  query.mockResolvedValueOnce([{ enabled: true, verified_at: verifiedAt }]);
  expect((await currentActor()).secondFactor).toMatchObject({ enrolled: true, sessionCreatedAt: null });
});
