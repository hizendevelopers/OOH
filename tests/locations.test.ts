import { afterAll, beforeAll, expect, it } from "vitest";
import type { Actor } from "../packages/domain/src";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { assign, assignments, inventory, overview } from "../apps/web/src/server/service";
import { createLocation, correctLocation, locationHistory } from "../apps/web/src/server/location-management";
import { activeLocationException, authorizeLocationException } from "../apps/web/src/server/location-exceptions";
import { nearbyLocations } from "../apps/web/src/server/nearby-locations";
import { beginInspection } from "../apps/web/src/server/inspections";
import type { InspectionInput } from "../packages/domain/src/inspection";
import { randomUUID } from "node:crypto";

const admin: Actor = { id: "location-admin", organizationId: "locations-org", role: "admin", name: "Admin", email: "admin@locations.invalid" };
const worker: Actor = { ...admin, id: "location-worker", role: "worker" };
const other: Actor = { ...worker, id: "location-other" };
const foreign: Actor = { ...admin, id: "location-foreign", organizationId: "foreign-locations" };
const input = { code: "TEST-LOC-001", structure_code: "TEST-STRUCT-001", city: "Karachi", zone: "Central", orientation: "N" as const, description: "QA test billboard", is_test: true, latitude: 24.86, longitude: 67.01, uncertainty_m: 5 };
let faceId: string;
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("location-qa-");
  await migrate();
  await migrate();
  const db = await getDb();
  for (const actor of [admin, worker, other, foreign]) {
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", [actor.organizationId]);
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.id + "@qa.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [actor.organizationId, actor.id, actor.role]);
    if (actor.role === "worker") await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [actor.id, actor.organizationId]);
  }
});
afterAll(closeDb);

it("creates a test location with immutable source and organization-scoped inventory", async () => {
  const result = await createLocation(admin, input);
  faceId = result.id;
  expect((await inventory(admin))[0]).toMatchObject({ id: faceId, code: input.code, latitude: input.latitude, longitude: input.longitude, is_test: true, description: input.description });
  expect(await inventory(foreign)).toEqual([]);
  expect(await overview(admin)).toMatchObject({ faces: 0, structures: 0, assigned: 0, cities: [] });
  const [source] = await (await getDb()).query("SELECT * FROM source_coordinates WHERE face_id=$1", [faceId]);
  expect(source).toMatchObject({ latitude: input.latitude, longitude: input.longitude, source_name: "Manual location entry", imported_by: admin.id });
});
it("rejects worker creation, invalid coordinates and duplicate faces without partial records", async () => {
  await expect(createLocation(worker, { ...input, code: "WORKER" })).rejects.toMatchObject({ status: 403 });
  for (const bad of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { uncertainty_m: -1 }]) {
    await expect(createLocation(admin, { ...input, code: "INVALID", ...bad })).rejects.toThrow();
  }
  await expect(createLocation(admin, { ...input, structure_code: "ROLLBACK-STRUCT" })).rejects.toMatchObject({ status: 409 });
  expect(await (await getDb()).query("SELECT id FROM billboard_structures WHERE code='ROLLBACK-STRUCT'")).toEqual([]);
  expect(await inventory(admin)).toHaveLength(1);
});
it("records corrections and audit while preserving the original coordinates", async () => {
  const correction = { faceId, latitude: 24.861, longitude: 67.012, uncertainty_m: 8, reason: "Confirmed the correct roadside position" };
  await expect(correctLocation(worker, correction)).rejects.toMatchObject({ status: 403 });
  await expect(correctLocation(foreign, correction)).rejects.toMatchObject({ status: 404 });
  await expect(correctLocation(admin, { ...correction, reason: "short" })).rejects.toThrow();
  await correctLocation(admin, correction);
  expect((await inventory(admin))[0]).toMatchObject({ latitude: correction.latitude, longitude: correction.longitude, original_latitude: input.latitude, original_longitude: input.longitude });
  const db = await getDb();
  expect((await db.query("SELECT latitude,longitude FROM source_coordinates WHERE face_id=$1", [faceId]))[0]).toEqual({ latitude: input.latitude, longitude: input.longitude });
  expect(await locationHistory(admin, faceId)).toHaveLength(1);
  expect(await locationHistory(foreign, faceId)).toEqual([]);
  await expect(db.query("UPDATE location_coordinate_corrections SET latitude=0 WHERE face_id=$1", [faceId])).rejects.toThrow("Immutable");
  expect(await db.query("SELECT id FROM audit_events WHERE action='location.coordinates.correct' AND entity_id=$1", [faceId])).toHaveLength(1);
});
it("binds supervisor exceptions to organization, assignment owner and exact version", async () => {
  await assign(admin, { faceIds: [faceId], workerId: worker.id, dueDate: "2026-11-01" });
  const [task] = await assignments(worker);
  const request = { assignmentId: task.assignment_id, assignmentVersion: task.version, reason: "Approved exception because GPS reception is obstructed" };
  await expect(authorizeLocationException(worker, request)).rejects.toMatchObject({ status: 403 });
  await expect(authorizeLocationException(foreign, request)).rejects.toMatchObject({ status: 404 });
  await expect(authorizeLocationException(admin, { ...request, assignmentVersion: task.version + 1 })).rejects.toMatchObject({ status: 409 });
  const exception = await authorizeLocationException(admin, request);
  const db = await getDb();
  expect(await activeLocationException(db, worker, task.assignment_id, task.version)).toMatchObject({ id: exception.id, reason: request.reason });
  expect(await activeLocationException(db, other, task.assignment_id, task.version)).toBeNull();
  expect(await activeLocationException(db, foreign, task.assignment_id, task.version)).toBeNull();
  expect(await activeLocationException(db, worker, task.assignment_id, task.version + 1)).toBeNull();
  await expect(db.query("DELETE FROM location_exceptions WHERE id=$1", [exception.id])).rejects.toThrow("Immutable");
});

it("orders nearby assigned locations by distance and enforces radius, test filters and worker scope", async () => {
  for (const [code, latitude, assignedWorker] of [["NEAR", 24.8601, worker], ["FAR", 24.87, worker], ["OTHER-WORKER", 24.86, other]] as const) {
    const face = await createLocation(admin, { ...input, code, structure_code: code, latitude, is_test: false });
    await assign(admin, { faceIds: [face.id], workerId: assignedWorker.id, dueDate: "2026-11-01" });
  }
  const query = { latitude: 24.86, longitude: 67.01, radiusM: 5000 };
  const result = await nearbyLocations(worker, query);
  expect(result.locations.map(row => row.code)).toEqual(["NEAR", "FAR"]);
  expect(result.locations[0].distance_m).toBeLessThan(result.locations[1].distance_m);
  expect((await nearbyLocations(worker, { ...query, radiusM: 100 })).locations.map(row => row.code)).toEqual(["NEAR"]);
  expect((await nearbyLocations(worker, { ...query, includeTest: "true" })).locations.map(row => row.code)).toContain(input.code);
  await expect(nearbyLocations(admin, query)).rejects.toMatchObject({ status: 403 });
  expect((await nearbyLocations({ ...worker, organizationId: foreign.organizationId }, query)).locations).toEqual([]);
  await expect(nearbyLocations(worker, { ...query, latitude: 100 })).rejects.toThrow();
  for (const latitude of [null, "", "   "]) await expect(nearbyLocations(worker, { ...query, latitude })).rejects.toThrow();
});

it("enforces photo GPS before persistence and accepts original offline capture coordinates", async () => {
  const task = (await assignments(worker)).find(row => row.code === "NEAR")!;
  const capturedAt = new Date(Date.now() - 3600000).toISOString();
  const make = (): InspectionInput => ({
    operationId: randomUUID(), assignmentId: task.assignment_id, assignmentVersion: task.version, faceId: task.id, faceCode: task.code, challengeId: null,
    photos: (["front", "wide"] as const).map(kind => ({ kind, bytes: 10, sha256: (kind === "front" ? "a" : "b").repeat(64), capturedAt, captureMode: "offline", gps: { status: "ok", latitude: task.latitude, longitude: task.longitude, accuracy: 10, observedAt: capturedAt } })),
  });
  for (const gps of [
    { status: "denied", observedAt: capturedAt },
    { status: "ok", latitude: task.latitude, longitude: task.longitude, accuracy: 1000, observedAt: capturedAt },
    { status: "ok", latitude: task.latitude + 1, longitude: task.longitude, accuracy: 10, observedAt: capturedAt },
    { status: "ok", latitude: task.latitude, longitude: task.longitude, accuracy: 10, observedAt: new Date(Date.parse(capturedAt) - 60000).toISOString() },
  ] as const) {
    const payload = make();
    payload.photos[0].gps = gps;
    await expect(beginInspection(worker, payload)).rejects.toMatchObject({ status: 422 });
  }
  expect(await (await getDb()).query("SELECT id FROM inspections WHERE assignment_id=$1", [task.assignment_id])).toEqual([]);
  const accepted = await beginInspection(worker, make());
  expect(accepted.inspectionId).toBeTruthy();
});

it("invalidates downloaded assignment versions and old exceptions after coordinate correction", async () => {
  const task = (await assignments(worker)).find(row => row.id === faceId)!;
  expect(await activeLocationException(await getDb(), worker, task.assignment_id, task.version)).toBeTruthy();
  await correctLocation(admin, { faceId, latitude: 24.862, longitude: 67.012, uncertainty_m: 5, reason: "Reconfirmed final coordinates after site inspection" });
  const refreshed = (await assignments(worker)).find(row => row.id === faceId)!;
  expect(refreshed.version).toBe(task.version + 1);
  expect(refreshed.latitude).toBe(24.862);
  expect(await activeLocationException(await getDb(), worker, task.assignment_id, task.version)).toBeNull();
  expect(await activeLocationException(await getDb(), worker, task.assignment_id, refreshed.version)).toBeNull();
});
