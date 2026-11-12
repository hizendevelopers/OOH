import { beforeAll, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { overview } from "../apps/web/src/server/service";
import { registerSite } from "../apps/web/src/server/site-registration";
import type { Actor } from "../packages/domain/src";

const admin: Actor = { id: "admin", organizationId: "org", role: "admin", name: "Admin", email: "admin@test.invalid" };
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const site = {
  city: "Baghdad" as const,
  area: "Karrada",
  region: "Baghdad Governorate",
  accuracyM: 8,
  observedAt: new Date().toISOString(),
  widthM: 12,
  heightM: 4,
  format: "unipole" as const,
  description: "",
};

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("overview-db-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES('org','Test')");
  for (const user of [admin, worker]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [user.id, user.name, user.id + "@test.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", ["org", user.id, user.role]);
  }
  await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [worker.id, "org"]);
});

it("reports, per city, how many sites are submitted and how many are pinned", async () => {
  const first = await registerSite(worker, { ...site, operationId: randomUUID(), latitude: 33.3152, longitude: 44.3661 });
  await registerSite(worker, { ...site, operationId: randomUUID(), latitude: 33.4, longitude: 44.5 });
  const db = await getDb();
  await db.query("UPDATE assignments SET status='server_received' WHERE id=$1", [first.assignmentId]);
  const summary = await overview(admin);
  const baghdad = summary.cities.find((c) => c.city === "Baghdad");
  expect(baghdad).toMatchObject({ faces: 2, submitted: 1, pinned: 2 });
});

it("does not let a worker read the overview", async () => {
  await expect(overview(worker)).rejects.toMatchObject({ status: 403 });
});
