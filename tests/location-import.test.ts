import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Actor } from "../packages/domain/src";
import type { ServerActor } from "../apps/web/src/server/mfa-gate";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { assignments, inventory } from "../apps/web/src/server/service";
import { randomUUID } from "node:crypto";
import {
  assignImportedLocations,
  classifyLocationCsv,
  correctImportedCity,
  importLocations,
} from "../apps/web/src/server/location-import";
import { assessFieldCapture, type CapturePhoto } from "../apps/web/src/server/location-capture";

const fixture = readFileSync(path.join(__dirname, "fixtures", "fizzion-sample.csv"), "utf8");
const freshFactor = (): ServerActor["secondFactor"] => ({ enrolled: true, verifiedAt: Date.now() - 3600000, sessionCreatedAt: Date.now() - 60000 });
const admin: ServerActor = {
  secondFactor: freshFactor(), id: "import-admin", organizationId: "import-org", role: "admin", name: "Admin", email: "admin@import.invalid" };
const worker: Actor = { id: "import-worker", organizationId: "import-org", role: "worker", name: "Field Worker", email: "worker@import.invalid" };
const inactive: Actor = { ...worker, id: "import-inactive" };
const otherOrg: Actor = { ...admin, id: "import-foreign-admin", organizationId: "import-foreign" };

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("import-qa-");
  await migrate();
  const db = await getDb();
  for (const org of ["import-org", "import-foreign"])
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", [org]);
  for (const [actor, active] of [
    [admin, true],
    [worker, true],
    [inactive, false],
    [otherOrg, true],
  ] as const) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.id + "@qa.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [actor.organizationId, actor.id, actor.role]);
    if (actor.role === "worker") await db.query("INSERT INTO worker_profiles(user_id,organization_id,active) VALUES($1,$2,$3)", [actor.id, actor.organizationId, active]);
  }
});
afterAll(closeDb);

async function receivedVisit(db: Awaited<ReturnType<typeof getDb>>, inspectionId: string, organizationId: string, assignmentId: string, faceId: string, workerId: string) {
  await db.query("INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata,status,receipt_id,received_at) VALUES($1,$2,$3,$4,$5,$6,'x','{}','server_received',$7,now())", [inspectionId, organizationId, assignmentId, faceId, workerId, randomUUID(), randomUUID()]);
  await db.query("INSERT INTO media_evidence(id,inspection_id,kind,expected_bytes,expected_hash,receipt_id,received_at) VALUES($1,$2,'front',10,'a',$3,now()),($4,$2,'wide',10,'b',$5,now())", [randomUUID(), inspectionId, randomUUID(), randomUUID(), randomUUID()]);
}
const byCode = <T extends { code: string }>(rows: T[], code: string) => rows.find((r) => r.code === code)!;

it("classifies each row without inventing coordinates, dimensions or city names", () => {
  const rows = classifyLocationCsv(fixture);
  const ok = rows.filter((r) => r.outcome === "ready") as Array<Extract<(typeof rows)[number], { outcome: "ready" }>>;
  const failed = rows.filter((r) => r.outcome === "failed");
  expect(ok.map((r) => r.sourceSiteId)).toEqual(["IQ-TST-0001", "IQ-TST-0002", "IQ-TST-0003", "IQ-TST-0004", "IQ-TST-0005", "IQ-TST-0006", "IQ-TST-0008", "IQ-TST-0009"]);
  expect(failed.map((r) => r.reason)).toEqual([
    expect.stringContaining("Duplicate site ID"),
    expect.stringContaining("not in the expected format"),
  ]);

  const verified = ok.find((r) => r.sourceSiteId === "IQ-TST-0001")!;
  expect(verified).toMatchObject({ gpsStatus: "verified", referenceLatitude: 33.308528, dimensionStatus: "recorded", width_m: 20, height_m: 9, needsReview: false });

  const approximate = ok.find((r) => r.sourceSiteId === "IQ-TST-0002")!;
  expect(approximate).toMatchObject({ gpsStatus: "approximate", dimensionStatus: "pending_measurement" });
  expect(approximate.referenceLatitude).toBe(33.3);

  const pending = ok.find((r) => r.sourceSiteId === "IQ-TST-0003")!;
  expect(pending).toMatchObject({ gpsStatus: "pending_gps", referenceLatitude: null, referenceLongitude: null, needsReview: true, dimensionStatus: "pending_measurement" });
  expect(pending.openIssues).toContain("GPS not provided");

  const unspecified = ok.find((r) => r.sourceSiteId === "IQ-TST-0004")!;
  expect(unspecified).toMatchObject({ city: "Unspecified City, Anbar", cityLabel: "Anbar (city not stated)", cityStatus: "unspecified", gpsStatus: "verified" });

  const kura = ok.find((r) => r.sourceSiteId === "IQ-TST-0005")!;
  expect(kura).toMatchObject({ city: "Kura (as listed)", cityStatus: "pending_verification", gpsStatus: "pending_gps" });

  // A Supplied pin outside Iraq is not verified; it is kept as a reference that needs correction.
  const outside = ok.find((r) => r.sourceSiteId === "IQ-TST-0006")!;
  expect(outside).toMatchObject({ gpsStatus: "to_correct", referenceLatitude: 12.26442 });

  // Quoted commas and a blank review flag are read correctly.
  const quoted = ok.find((r) => r.sourceSiteId === "IQ-TST-0008")!;
  expect(quoted.description).toBe("Kufa, Market Street, near Al Askari");
  expect(quoted.needsReview).toBe(false);

  // Missing dimensions stay pending; a dimension is not created from the latitude or longitude columns.
  const measurement = ok.find((r) => r.sourceSiteId === "IQ-TST-0009")!;
  expect(measurement).toMatchObject({ dimensionStatus: "pending_measurement", gpsStatus: "pending_gps" });
});

it("dry run writes nothing; apply imports once and a repeat creates no duplicates", async () => {
  const dry = await importLocations(admin, fixture, { apply: false });
  expect(dry.report.filter((r) => r.outcome === "imported")).toHaveLength(8);
  expect(await inventory(admin)).toHaveLength(0);

  const first = await importLocations(admin, fixture, { apply: true });
  expect(first.report.filter((r) => r.outcome === "imported")).toHaveLength(8);
  expect(first.report.filter((r) => r.outcome === "failed")).toHaveLength(2);

  const repeat = await importLocations(admin, fixture, { apply: true });
  expect(repeat.report.filter((r) => r.outcome === "imported")).toHaveLength(0);
  expect(repeat.report.filter((r) => r.outcome === "skipped_existing")).toHaveLength(8);
  expect(await inventory(admin)).toHaveLength(8);
});

it("keeps verified and pending locations distinct and never stores fake coordinates", async () => {
  const db = await getDb();
  const rows = await inventory(admin);
  const pending = byCode(rows, "IQ-TST-0003");
  expect(pending).toMatchObject({ gps_status: "pending_gps", latitude: null, longitude: null, needs_review: true, dimension_status: "pending_measurement" });
  const verified = byCode(rows, "IQ-TST-0001");
  expect(verified).toMatchObject({ gps_status: "verified", latitude: 33.308528, longitude: 44.126111, uncertainty_m: 50 });
  const [{ count }] = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM source_coordinates s JOIN billboard_faces f ON f.id=s.face_id WHERE f.id=$1",
    [pending.id],
  );
  expect(count).toBe("0");
  const approximate = byCode(rows, "IQ-TST-0002");
  expect(approximate).toMatchObject({ gps_status: "approximate", latitude: null, reference_latitude: 33.3 });
  expect(byCode(rows, "IQ-TST-0004").city).toBe("Unspecified City, Anbar");
  expect(byCode(rows, "IQ-TST-0005").city).toBe("Kura (as listed)");
});

it("never changes an existing imported row when the file now says something different", async () => {
  const changed = fixture.replace("33.308528,44.126111", "33.5,44.5");
  const result = await importLocations(admin, changed, { apply: true });
  const row = result.report.find((r) => r.sourceSiteId === "IQ-TST-0001")!;
  expect(row.outcome).toBe("conflict");
  expect(byCode(await inventory(admin), "IQ-TST-0001").latitude).toBe(33.308528);
});

it("isolates organizations: another organization's administrator sees none of these locations", async () => {
  expect(await inventory(otherOrg)).toEqual([]);
});

it("assigns imported locations only to an active worker identified by database ID", async () => {
  await expect(assignImportedLocations(admin, { workerId: "no-such-user", expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: true })).rejects.toThrow("No active worker");
  await expect(assignImportedLocations(admin, { workerId: inactive.id, expectedEmail: inactive.id + "@qa.invalid", dueDate: "2027-01-31", apply: true })).rejects.toThrow("No active worker");
  await expect(assignImportedLocations(admin, { workerId: admin.id, expectedEmail: admin.id + "@qa.invalid", dueDate: "2027-01-31", apply: true })).rejects.toThrow("No active worker");
  await expect(assignImportedLocations(worker, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: true })).rejects.toThrow("Administrator access required");

  // A wrong expected email refuses the assignment, even when the ID is a real active worker.
  await expect(assignImportedLocations(admin, { workerId: worker.id, expectedEmail: "someone.else@example.invalid", dueDate: "2027-01-31", apply: true })).rejects.toThrow("does not match");
  const preview = await assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: false });
  expect(preview).toMatchObject({ wouldAssign: 8, assigned: 0 });

  const applied = await assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: true });
  expect(applied).toMatchObject({ assigned: 8, alreadyAssigned: 0 });
  // The deadline the administrator set is the one the worker sees, for every assigned location.
  const mine = (await assignments(worker)).filter((row) => row.worker_id === worker.id);
  expect(mine.length).toBeGreaterThanOrEqual(8);
  for (const row of mine) expect(row.due_date).toBe("2027-01-31");
  expect(byCode(await inventory(admin), "IQ-TST-0005")).toMatchObject({ gps_status: "pending_gps", dimension_status: "pending_measurement" });
  const again = await assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: true });
  expect(again).toMatchObject({ assigned: 0, alreadyAssigned: 8 });
  const db = await getDb();
  const [{ n }] = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM assignments WHERE organization_id=$1 AND worker_id=$2 AND status='assigned'",
    [admin.organizationId, worker.id],
  );
  expect(n).toBe("8");
});

it("corrects an unclear city while keeping the original label and history", async () => {
  const rows = await inventory(admin);
  const kura = byCode(rows, "IQ-TST-0005");
  await expect(correctImportedCity(worker, { faceId: kura.id, city: "Kura", reason: "Confirmed with the supplier list" })).rejects.toThrow();
  const result = await correctImportedCity(admin, { faceId: kura.id, city: "Kura", reason: "Confirmed with the supplier list" });
  expect(result).toMatchObject({ previousCity: "Kura (as listed)", city: "Kura" });
  const db = await getDb();
  const [record] = await db.query<{ city_label: string; city_status: string }>(
    "SELECT city_label,city_status FROM location_import_records WHERE face_id=$1",
    [kura.id],
  );
  expect(record).toEqual({ city_label: "Kura (as listed)", city_status: "confirmed" });
  const history = await db.query("SELECT previous_city,new_city FROM location_city_history WHERE face_id=$1", [kura.id]);
  expect(history).toEqual([{ previous_city: "Kura (as listed)", new_city: "Kura" }]);
  await expect(db.query("UPDATE location_city_history SET new_city='x' WHERE face_id=$1", [kura.id])).rejects.toThrow("Immutable record");
});

it("database rules refuse a pending location that also has reference coordinates", async () => {
  const db = await getDb();
  const [face] = await db.query<{ id: string }>("SELECT id FROM billboard_faces WHERE organization_id=$1 AND code='IQ-TST-0003'", [admin.organizationId]);
  await expect(db.query("UPDATE location_import_records SET reference_latitude=33, reference_longitude=44 WHERE face_id=$1", [face.id])).rejects.toThrow();
});

const good = (lat: number, lon: number, accuracy = 8, observedAt = "2026-11-09T10:00:00.000Z") => ({ status: "ok" as const, latitude: lat, longitude: lon, accuracy, observedAt });
const photo = (kind: string, gps: CapturePhoto["gps"], capturedAt = "2026-11-09T10:00:05.000Z"): CapturePhoto => ({ kind, gps, capturedAt });

it("requires fresh, accurate GPS on every photo before a pending location can be completed", () => {
  const front = photo("front", good(33.3, 44.1));
  const wide = photo("wide", good(33.30005, 44.10005));
  expect(assessFieldCapture([front, wide])).toMatchObject({ ok: true, capture: { latitude: 33.3, longitude: 44.1, accuracy_m: 8 } });
  expect(assessFieldCapture([])).toMatchObject({ ok: false });
  expect(assessFieldCapture([front, photo("wide", { status: "unavailable" } as never)])).toMatchObject({ ok: false, failures: [{ kind: "wide", status: "missing" }] });
  expect(assessFieldCapture([front, photo("wide", good(33.3, 44.1, 300))])).toMatchObject({ ok: false, failures: [{ kind: "wide", status: "low_accuracy" }] });
  expect(assessFieldCapture([front, photo("wide", good(33.3, 44.1, 8, "2026-11-09T09:00:00.000Z"))])).toMatchObject({ ok: false, failures: [{ kind: "wide", status: "stale" }] });
  // Photos taken kilometres apart do not describe one billboard.
  expect(assessFieldCapture([front, photo("wide", good(33.35, 44.1))])).toMatchObject({ ok: false, failures: [{ kind: "wide", status: "outside_area" }] });
});

it("blocks a visit to a pending or approximate location unless every photo carries valid GPS", async () => {
  const { beginInspection } = await import("../apps/web/src/server/inspections");
  const all = await assignments(worker);
  const sample = (code: string) => all.find((row) => row.code === code)!;
  const now = new Date().toISOString();
  const payloadFor = (task: ReturnType<typeof sample>, gps: unknown) => ({
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    assignmentVersion: task.version,
    faceId: task.id,
    faceCode: task.code,
    challengeId: null,
    photos: [
      { kind: "front", bytes: 10, sha256: "a".repeat(64), capturedAt: now, captureMode: "offline", gps },
      { kind: "wide", bytes: 10, sha256: "b".repeat(64), capturedAt: now, captureMode: "offline", gps },
      { kind: "angle_1", bytes: 10, sha256: "e".repeat(64), capturedAt: now, captureMode: "offline", gps },
    ],
  });
  for (const code of ["IQ-TST-0003", "IQ-TST-0002"]) {
    const task = sample(code);
    await expect(beginInspection(worker, payloadFor(task, { status: "denied", observedAt: now }) as never)).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("no verified GPS"),
    });
    // A supervisor exception cannot waive this check for an unverified location.
    await expect(beginInspection(worker, payloadFor(task, { status: "unavailable", observedAt: now }) as never)).rejects.toMatchObject({ status: 422 });
  }
});

it("rejects a pending-GPS visit whose photos carry a poor GPS reading", async () => {
  const { beginInspection } = await import("../apps/web/src/server/inspections");
  const task = (await assignments(worker)).find((row) => row.code === "IQ-TST-0009")!;
  const now = new Date().toISOString();
  const poor = { status: "ok", latitude: 33.3, longitude: 44.1, accuracy: 900, observedAt: now };
  await expect(
    beginInspection(worker, {
      operationId: randomUUID(),
      assignmentId: task.assignment_id,
      assignmentVersion: task.version,
      faceId: task.id,
      faceCode: task.code,
      challengeId: null,
      photos: [
        { kind: "front", bytes: 10, sha256: "c".repeat(64), capturedAt: now, captureMode: "offline", gps: poor },
        { kind: "wide", bytes: 10, sha256: "d".repeat(64), capturedAt: now, captureMode: "offline", gps: poor },
        { kind: "angle_1", bytes: 10, sha256: "f".repeat(64), capturedAt: now, captureMode: "offline", gps: poor },
      ],
    } as never),
  ).rejects.toMatchObject({ status: 422, message: expect.stringContaining("weak") });
});

it("reports every unverified coordinate with its original values and reason", async () => {
  const { unverifiedGpsReport } = await import("../apps/web/src/server/location-import");
  const rows = unverifiedGpsReport(fixture);
  const byId = Object.fromEntries(rows.map((r) => [r.site_id, r]));
  expect(Object.keys(byId).sort()).toEqual(["IQ-TST-0002", "IQ-TST-0003", "IQ-TST-0005", "IQ-TST-0006", "IQ-TST-0009"].sort());
  expect(byId["IQ-TST-0002"]).toMatchObject({ gps_status: "approximate", source_latitude: "33.3", source_longitude: "44.1" });
  expect(byId["IQ-TST-0006"]).toMatchObject({ gps_status: "to_correct", source_latitude: "12.26442" });
  expect(byId["IQ-TST-0006"].reason).toContain("outside Iraq");
  expect(byId["IQ-TST-0005"].reason).toContain("No coordinates");
  expect(byId["IQ-TST-0002"].reason).toContain("Approximate");
});

it("never promotes a field capture automatically; a supervisor must verify it with a reason", async () => {
  const { promoteFieldCapture, pendingFieldCaptures } = await import("../apps/web/src/server/location-import");
  const db = await getDb();
  const rows = await inventory(admin);
  const kura = byCode(rows, "IQ-TST-0005");
  const [assignment] = await db.query<{ id: string }>("SELECT id FROM assignments WHERE face_id=$1", [kura.id]);
  // Capture recorded during a visit (inspection row created directly, since the visit pipeline needs uploaded evidence).
  const inspectionId = randomUUID();
  await receivedVisit(db, inspectionId, admin.organizationId, assignment.id, kura.id, worker.id);
  const captureId = randomUUID();
  await db.query(
    "INSERT INTO location_field_captures(id,organization_id,face_id,inspection_id,worker_id,latitude,longitude,accuracy_m,captured_at) VALUES($1,$2,$3,$4,$5,33.31,44.13,6,now())",
    [captureId, admin.organizationId, kura.id, inspectionId, worker.id],
  );
  // Still no source coordinate: the capture is evidence only.
  expect(byCode(await inventory(admin), "IQ-TST-0005").latitude).toBeNull();
  expect((await pendingFieldCaptures(admin)).map((c) => c.id)).toContain(captureId);
  await expect(promoteFieldCapture(worker, { captureId, reason: "Inspector verified the pin here" })).rejects.toThrow("Administrator access required");
  await expect(promoteFieldCapture(admin, { captureId, reason: "short" })).rejects.toThrow();
  const done = await promoteFieldCapture(admin, { captureId, reason: "Confirmed by supervisor on site visit" });
  expect(done).toMatchObject({ gpsStatus: "verified", previousStatus: "pending_gps" });
  expect(byCode(await inventory(admin), "IQ-TST-0005")).toMatchObject({ gps_status: "verified", latitude: 33.31, longitude: 44.13 });
  await expect(promoteFieldCapture(admin, { captureId, reason: "Confirmed by supervisor on site visit" })).rejects.toThrow("already has a verified");
});

it("promoting an approximate location keeps its original supplied coordinates as the reference", async () => {
  const { promoteFieldCapture } = await import("../apps/web/src/server/location-import");
  const db = await getDb();
  const rows = await inventory(admin);
  const approx = byCode(rows, "IQ-TST-0002");
  const [assignment] = await db.query<{ id: string }>("SELECT id FROM assignments WHERE face_id=$1", [approx.id]);
  const inspectionId = randomUUID();
  await receivedVisit(db, inspectionId, admin.organizationId, assignment.id, approx.id, worker.id);
  const captureId = randomUUID();
  await db.query(
    "INSERT INTO location_field_captures(id,organization_id,face_id,inspection_id,worker_id,latitude,longitude,accuracy_m,captured_at) VALUES($1,$2,$3,$4,$5,33.2999,44.1001,5,now())",
    [captureId, admin.organizationId, approx.id, inspectionId, worker.id],
  );
  await promoteFieldCapture(admin, { captureId, reason: "Supervisor confirmed the approximate pin on site" });
  const [record] = await db.query<{ reference_latitude: number; reference_longitude: number; gps_status: string }>(
    "SELECT reference_latitude,reference_longitude,gps_status FROM location_import_records WHERE face_id=$1",
    [approx.id],
  );
  expect(record).toEqual({ reference_latitude: 33.3, reference_longitude: 44.1, gps_status: "verified" });
  expect(byCode(await inventory(admin), "IQ-TST-0002").latitude).toBe(33.2999);
});

async function capturedVisit(faceCode: string, capture: { latitude: number; longitude: number; accuracy: number | null; received: boolean }) {
  const db = await getDb();
  const face = byCode(await inventory(admin), faceCode);
  const [assignment] = await db.query<{ id: string }>("SELECT id FROM assignments WHERE face_id=$1", [face.id]);
  const inspectionId = randomUUID();
  if (capture.received) await receivedVisit(db, inspectionId, admin.organizationId, assignment.id, face.id, worker.id);
  else await db.query("INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata) VALUES($1,$2,$3,$4,$5,$6,'x','{}')", [inspectionId, admin.organizationId, assignment.id, face.id, worker.id, randomUUID()]);
  const captureId = randomUUID();
  await db.query(
    "INSERT INTO location_field_captures(id,organization_id,face_id,inspection_id,worker_id,latitude,longitude,accuracy_m,captured_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())",
    [captureId, admin.organizationId, face.id, inspectionId, worker.id, capture.latitude, capture.longitude, capture.accuracy],
  );
  return { captureId, faceId: face.id };
}

it("refuses a capture above the accuracy limit and a visit without server-received evidence", async () => {
  const { promoteFieldCapture } = await import("../apps/web/src/server/location-import");
  const weak = await capturedVisit("IQ-TST-0003", { latitude: 33.31, longitude: 44.13, accuracy: 60, received: true });
  await expect(promoteFieldCapture(admin, { captureId: weak.captureId, reason: "Supervisor reviewed the photos" })).rejects.toThrow("above the 50 m limit");
  const unreceived = await capturedVisit("IQ-TST-0006", { latitude: 33.31, longitude: 44.13, accuracy: 10, received: false });
  await expect(promoteFieldCapture(admin, { captureId: unreceived.captureId, reason: "Supervisor reviewed the photos" })).rejects.toThrow("evidence");
  const db = await getDb();
  const [{ n }] = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM source_coordinates WHERE face_id=(SELECT id FROM billboard_faces WHERE organization_id=$1 AND code='IQ-TST-0003')", [admin.organizationId]);
  expect(n).toBe("0");
});

it("keeps an outside-Iraq capture out of verification unless a documented boundary exception is recorded", async () => {
  const { promoteFieldCapture } = await import("../apps/web/src/server/location-import");
  const db = await getDb();
  const outside = await capturedVisit("IQ-TST-0009", { latitude: 33.5138, longitude: 36.2765, accuracy: 10, received: true });
  await expect(promoteFieldCapture(admin, { captureId: outside.captureId, reason: "Supervisor reviewed the photos" })).rejects.toThrow("outside the Iraq boundary");
  await expect(promoteFieldCapture(admin, { captureId: outside.captureId, reason: "Supervisor reviewed the photos", boundaryException: "short" })).rejects.toThrow("boundary exception");
  const done = await promoteFieldCapture(admin, {
    captureId: outside.captureId,
    reason: "Supervisor reviewed the photos",
    boundaryException: "Border-area pin confirmed by supervisor on site visit",
  });
  expect(done).toMatchObject({ gpsStatus: "verified", previousStatus: "pending_gps", boundaryException: true });
  const [history] = await db.query<{ previous_gps_status: string; previous_reference_latitude: number | null; promoted_latitude: number; accuracy_m: number; inside_iraq: boolean; boundary_exception: boolean; reviewer_id: string; reason: string }>(
    "SELECT previous_gps_status,previous_reference_latitude,promoted_latitude,accuracy_m,inside_iraq,boundary_exception,reviewer_id,reason FROM location_gps_promotions WHERE capture_id=$1",
    [outside.captureId],
  );
  expect(history).toMatchObject({ previous_gps_status: "pending_gps", previous_reference_latitude: null, promoted_latitude: 33.5138, accuracy_m: 10, inside_iraq: false, boundary_exception: true, reviewer_id: admin.id });
  await expect(db.query("UPDATE location_gps_promotions SET reason='changed' WHERE capture_id=$1", [outside.captureId])).rejects.toThrow("Immutable record");
});

it("does not let an account from another organization be assigned locations", async () => {
  const db = await getDb();
  await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', ["import-foreign-worker", "Foreign Worker", "import-foreign-worker@qa.invalid"]);
  await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,'worker')", ["import-foreign", "import-foreign-worker"]);
  await db.query("INSERT INTO worker_profiles(user_id,organization_id,active) VALUES($1,$2,true)", ["import-foreign-worker", "import-foreign"]);
  await expect(
    assignImportedLocations(admin, { workerId: "import-foreign-worker", expectedEmail: "import-foreign-worker@qa.invalid", dueDate: "2027-01-31", apply: true }),
  ).rejects.toThrow("No active worker");
});

it("does not reassign a location whose assignment is already approved, on an ordinary rerun", async () => {
  const db = await getDb();
  const face = byCode(await inventory(admin), "IQ-TST-0002");
  await db.query("UPDATE assignments SET status='approved' WHERE face_id=$1", [face.id]);
  const dry = await assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: false });
  expect(dry.wouldAssign).toBe(0);
  const applied = await assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: true });
  expect(applied.assigned).toBe(0);
  const [{ n }] = await db.query<{ n: string }>("SELECT count(*)::text AS n FROM assignments WHERE face_id=$1", [face.id]);
  expect(n).toBe("1");
});

it("refuses an impossible due date such as 31 February", async () => {
  await expect(assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2026-02-31", apply: false })).rejects.toThrow();
  await expect(assignImportedLocations(admin, { workerId: worker.id, expectedEmail: worker.id + "@qa.invalid", dueDate: "2027-01-31", apply: false })).resolves.toMatchObject({ worker: { id: worker.id } });
});
