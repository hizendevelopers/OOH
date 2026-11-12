import { beforeAll, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { assignments } from "../apps/web/src/server/service";
import { registerSite } from "../apps/web/src/server/site-registration";
import { recordWorkerAddress } from "../apps/web/src/server/worker-address";
import type { Actor } from "../packages/domain/src";

const admin: Actor = { id: "admin", organizationId: "org", role: "admin", name: "Admin", email: "admin@test.invalid" };
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const other: Actor = { ...admin, id: "other", role: "worker" };
const site = {
  city: "Baghdad" as const,
  area: "Karrada",
  region: "Baghdad Governorate",
  latitude: 33.3152,
  longitude: 44.3661,
  accuracyM: 8,
  observedAt: new Date().toISOString(),
  widthM: 12,
  heightM: 4,
  format: "unipole" as const,
  description: "",
};
let assignmentId = "";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("address-db-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES('org','Test')");
  for (const user of [admin, worker, other]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [user.id, user.name, user.id + "@test.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", ["org", user.id, user.role]);
  }
  await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [worker.id, "org"]);
  await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [other.id, "org"]);
  const created = await registerSite(worker, { ...site, operationId: randomUUID() });
  assignmentId = created.assignmentId;
});

it("saves a worker-entered address and shows it on the visit", async () => {
  await recordWorkerAddress(worker, assignmentId, "  Street 5, near the school  ");
  const [visit] = (await assignments(worker)).filter((v) => v.assignment_id === assignmentId);
  expect(visit.worker_address).toBe("Street 5, near the school");
});

it("uses the latest address when the worker corrects it", async () => {
  await recordWorkerAddress(worker, assignmentId, "Corner of Al-Kindi Street");
  const [visit] = (await assignments(worker)).filter((v) => v.assignment_id === assignmentId);
  expect(visit.worker_address).toBe("Corner of Al-Kindi Street");
});

it("refuses an address that is too short", async () => {
  await expect(recordWorkerAddress(worker, assignmentId, "abc")).rejects.toMatchObject({ status: 422 });
});

it("refuses another worker's visit", async () => {
  await expect(recordWorkerAddress(other, assignmentId, "Some street address")).rejects.toMatchObject({ status: 404 });
});

it("refuses a non-worker", async () => {
  await expect(recordWorkerAddress(admin, assignmentId, "Some street address")).rejects.toMatchObject({ status: 403 });
});

it("refuses to change the address after the visit is closed", async () => {
  const db = await getDb();
  await db.query("UPDATE assignments SET status='server_received' WHERE id=$1", [assignmentId]);
  await expect(recordWorkerAddress(worker, assignmentId, "A late address change")).rejects.toMatchObject({ status: 409 });
});
