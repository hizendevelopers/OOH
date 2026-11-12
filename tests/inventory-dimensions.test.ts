import { beforeAll, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { assignments, inventory } from "../apps/web/src/server/service";
import { registerSite } from "../apps/web/src/server/site-registration";
import type { Actor } from "../packages/domain/src";

const admin: Actor = { id: "admin", organizationId: "org", role: "admin", name: "Admin", email: "admin@test.invalid" };
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const other: Actor = { ...admin, id: "other", role: "worker" };
let code = "";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("inventory-dims-");
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
  const site = await registerSite(worker, {
    operationId: randomUUID(), city: "Baghdad", area: "Karrada", region: "Baghdad Governorate",
    latitude: 33.3152, longitude: 44.3661, accuracyM: 8, observedAt: new Date().toISOString(),
    widthM: 12, heightM: 4, format: "unipole", description: "Karrada main road",
  });
  code = site.code;
});

it("returns saved dimensions on the admin inventory", async () => {
  const row = (await inventory(admin)).find((f) => f.code === code)!;
  expect(row).toMatchObject({ width_m: 12, height_m: 4, city: "Baghdad", zone: "Karrada", description: "Karrada main road" });
});

it("returns saved dimensions on the worker's own assignments, and only theirs", async () => {
  expect((await assignments(worker)).find((f) => f.code === code)).toMatchObject({ width_m: 12, height_m: 4 });
  expect((await assignments(other)).find((f) => f.code === code)).toBeUndefined();
});
