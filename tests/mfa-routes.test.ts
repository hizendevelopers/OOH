import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { ApiError } from "../apps/web/src/server/service";
import type { ServerActor } from "../apps/web/src/server/mfa-gate";

// The session is replaced by a test double. Everything after it (the gate, the services, the database) is real.
const session = vi.hoisted(() => ({ actor: undefined as ServerActor | undefined, error: undefined as Error | undefined }));
vi.mock("@/server/access", () => ({
  currentActor: async () => {
    if (session.error) throw session.error;
    return session.actor!;
  },
  signInRequired: () => true,
}));

const { GET, POST } = await import("../apps/web/src/app/api/[...path]/route");

const org = "route-org";
const origin = "http://localhost:3000";
const now = Date.now();
const fresh = { enrolled: true, verifiedAt: now - 3600000, sessionCreatedAt: now - 60000 };
const adminBase = { id: "route-admin", organizationId: org, role: "admin" as const, name: "Route Admin", email: "route-admin@qa.invalid" };
const workerBase = { id: "route-worker", organizationId: org, role: "worker" as const, name: "Route Worker", email: "route-worker@qa.invalid" };

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const url = `${origin}/api/${path}`;
  const request =
    method === "GET"
      ? new Request(url, { method: "GET" })
      : new Request(url, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body ?? {}),
        });
  const response = method === "GET" ? await GET(request) : await POST(request);
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

const assignBody = { workerId: workerBase.id, expectedEmail: workerBase.email, dueDate: "2027-01-31", apply: true };

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("mfa-routes-qa-");
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES($1,$1)", [org]);
  for (const actor of [adminBase, workerBase]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.email]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [org, actor.id, actor.role]);
  }
  await db.query("INSERT INTO worker_profiles(user_id,organization_id,active) VALUES($1,$2,true)", [workerBase.id, org]);
});
afterAll(closeDb);
beforeEach(() => {
  session.error = undefined;
  session.actor = undefined;
});

it("refuses an unenrolled administrator on every read and change, and allows only /me", async () => {
  const unenrolled: ServerActor = { ...adminBase, secondFactor: { enrolled: false, verifiedAt: null, sessionCreatedAt: now - 60000 } };
  session.actor = unenrolled;
  expect(await call("GET", "inventory")).toMatchObject({ status: 403, body: { code: "MFA_SETUP_REQUIRED" } });
  expect(await call("GET", "assignments")).toMatchObject({ status: 403, body: { code: "MFA_SETUP_REQUIRED" } });
  const me = await call("GET", "me");
  expect(me).toMatchObject({ status: 200, body: { id: adminBase.id, mfa: { enrolled: false } } });
  // Not even a direct import or assignment request gets through.
  expect(await call("POST", "locations/import/assign", assignBody)).toMatchObject({ status: 403, body: { code: "MFA_SETUP_REQUIRED" } });
  expect(await call("POST", "locations/import", { csv: "fizzion_site_id\nIQ-X-0001", apply: true })).toMatchObject({ status: 403, body: { code: "MFA_SETUP_REQUIRED" } });
  const db = await getDb();
  const [{ n }] = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM assignments WHERE organization_id=$1", [org]);
  expect(n).toBe("0");
});

it("requires a recent second-factor sign-in for a change, and refuses a session that predates enrollment", async () => {
  session.actor = { ...adminBase, secondFactor: { enrolled: true, verifiedAt: now - 3600000, sessionCreatedAt: now - 30 * 60000 } };
  expect(await call("POST", "locations/import/assign", assignBody)).toMatchObject({ status: 403, body: { code: "MFA_REAUTH_REQUIRED" } });
  // Reads are still allowed within the session.
  expect(await call("GET", "inventory")).toMatchObject({ status: 200 });

  session.actor = { ...adminBase, secondFactor: { enrolled: true, verifiedAt: now - 60000, sessionCreatedAt: now - 5 * 60000 } };
  expect(await call("POST", "locations/gps/verify", { captureId: "x", reason: "Confirmed on site" })).toMatchObject({ status: 403, body: { code: "MFA_REAUTH_REQUIRED" } });
  expect(await call("GET", "inventory")).toMatchObject({ status: 403, body: { code: "MFA_REAUTH_REQUIRED" } });
});

it("fails closed when the server has no second-factor state for an administrator", async () => {
  session.actor = { ...adminBase };
  expect(await call("GET", "inventory")).toMatchObject({ status: 403, body: { code: "MFA_STATE_MISSING" } });
  expect(await call("POST", "locations/import/assign", assignBody)).toMatchObject({ status: 403, body: { code: "MFA_STATE_MISSING" } });
});

it("refuses a worker from the administrator routes without relying on any MFA claim", async () => {
  session.actor = { ...workerBase, secondFactor: { enrolled: true, verifiedAt: now - 3600000, sessionCreatedAt: now - 60000 } };
  expect(await call("GET", "inventory")).toMatchObject({ status: 403, body: { error: "Administrator access required" } });
  expect(await call("POST", "locations/import/assign", assignBody)).toMatchObject({ status: 403, body: { error: "Administrator access required" } });
  const db = await getDb();
  const [{ n }] = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM assignments WHERE organization_id=$1", [org]);
  expect(n).toBe("0");
});

it("refuses an account with no organization membership, and an expired or invalid session", async () => {
  session.error = new ApiError(403, "No active organization membership");
  expect(await call("GET", "inventory")).toMatchObject({ status: 403 });
  session.error = new ApiError(401, "Sign in required");
  expect(await call("GET", "inventory")).toMatchObject({ status: 401 });
  expect(await call("POST", "locations/import/assign", assignBody)).toMatchObject({ status: 401 });
});

it("lets an enrolled, freshly signed-in administrator through, scoped to that organization", async () => {
  session.actor = { ...adminBase, secondFactor: fresh };
  expect(await call("GET", "inventory")).toMatchObject({ status: 200 });
  // An administrator whose organization differs from the data sees none of it.
  session.actor = { ...adminBase, organizationId: "some-other-org", secondFactor: fresh };
  const other = await call("GET", "inventory");
  expect(other.status).toBe(200);
  expect(other.body).toEqual([]);
});

it("keeps the expected-email check against the database, inside the organization", async () => {
  session.actor = { ...adminBase, secondFactor: fresh };
  expect(await call("POST", "locations/import/assign", { ...assignBody, expectedEmail: "someone.else@example.invalid" })).toMatchObject({
    status: 422,
    body: { error: expect.stringContaining("does not match") },
  });
  expect(await call("POST", "locations/import/assign", { ...assignBody, workerId: "no-such-worker" })).toMatchObject({ status: 404 });
});
