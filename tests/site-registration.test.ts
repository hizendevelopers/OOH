import { beforeAll, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { assignments } from "../apps/web/src/server/service";
import { registerSite } from "../apps/web/src/server/site-registration";
import type { Actor } from "../packages/domain/src";

const admin: Actor = { id: "admin", organizationId: "org", role: "admin", name: "Admin", email: "admin@test.invalid" };
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const base = {
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
  description: "Corner of the main road",
};

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("sites-db-");
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

it("creates a site with a city-based ID, its pin, its size and a visit for the worker", async () => {
  const site = await registerSite(worker, { ...base, operationId: randomUUID() });
  expect(site.code).toBe("IQ-BGD-0001");
  expect(site.city).toBe("Baghdad");
  expect(site.aspectRatio).toBe("3.00 : 1");
  expect(site.replayed).toBe(false);
  const db = await getDb();
  const [pin] = await db.query<{ latitude: number; longitude: number; source_name: string }>(
    "SELECT latitude, longitude, source_name FROM source_coordinates WHERE face_id=$1",
    [site.faceId],
  );
  expect(pin).toMatchObject({ latitude: base.latitude, longitude: base.longitude, source_name: "worker_registration" });
  const [dims] = await db.query<{ width_m: string; height_m: string; status: string }>(
    "SELECT width_m::text, height_m::text, status FROM face_dimensions WHERE face_id=$1",
    [site.faceId],
  );
  expect(dims).toMatchObject({ width_m: "12.00", height_m: "4.00", status: "unverified" });
  const visits = await assignments(worker);
  expect(visits.find((v) => v.assignment_id === site.assignmentId)).toBeTruthy();
});

it("numbers sites per city and keeps cities apart", async () => {
  const second = await registerSite(worker, { ...base, operationId: randomUUID(), latitude: 33.4, longitude: 44.5 });
  expect(second.code).toBe("IQ-BGD-0002");
  const erbil = await registerSite(worker, { ...base, operationId: randomUUID(), city: "Erbil", latitude: 36.19, longitude: 44.01 });
  expect(erbil.code).toBe("IQ-ERB-0001");
});

it("returns the same site when the device repeats the same operation", async () => {
  const operationId = randomUUID();
  const first = await registerSite(worker, { ...base, operationId, latitude: 33.6, longitude: 44.2 });
  const again = await registerSite(worker, { ...base, operationId, latitude: 33.6, longitude: 44.2 });
  expect(again.faceId).toBe(first.faceId);
  expect(again.code).toBe(first.code);
  expect(again.replayed).toBe(true);
});

it("refuses a spot that is already an inventory site", async () => {
  await expect(
    registerSite(worker, { ...base, operationId: randomUUID(), latitude: 33.3153, longitude: 44.3662 }),
  ).rejects.toMatchObject({ status: 409 });
});

it("refuses a reading outside Iraq", async () => {
  await expect(
    registerSite(worker, { ...base, operationId: randomUUID(), latitude: 40.0, longitude: 10.0 }),
  ).rejects.toMatchObject({ status: 422 });
});

it("only active field workers can register a site", async () => {
  await expect(registerSite(admin, { ...base, operationId: randomUUID(), latitude: 33.9, longitude: 44.0 })).rejects.toMatchObject({ status: 403 });
});

it("rejects a reading worse than 50 m", async () => {
  await expect(
    registerSite(worker, { ...base, operationId: randomUUID(), accuracyM: 80, latitude: 33.7, longitude: 44.1 }),
  ).rejects.toThrow();
});
