import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Actor } from "../packages/domain/src";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { assign, assignments, reassign } from "../apps/web/src/server/service";
import { createLocation } from "../apps/web/src/server/location-management";
import {
  activeLocationException,
  authorizeLocationException,
} from "../apps/web/src/server/location-exceptions";
import { beginInspection } from "../apps/web/src/server/inspections";
import type { InspectionInput } from "../packages/domain/src/inspection";
import { generatePassword, readChosenPasswords, weakness } from "../scripts/set-worker-passwords";

const admin: Actor = { id: "move-admin", organizationId: "move-org", role: "admin", name: "Admin", email: "admin@move.invalid" };
const worker: Actor = { ...admin, id: "move-worker", role: "worker", name: "First Worker" };
const other: Actor = { ...worker, id: "move-other", name: "Second Worker" };
const inactive: Actor = { ...worker, id: "move-inactive", name: "Retired Worker" };
const foreign: Actor = { ...admin, id: "move-foreign", organizationId: "foreign-move" };
const site = { structure_code: "MOVE-STRUCT", city: "Karbala", zone: "Central", orientation: "N" as const, description: "Reassignment test billboard", is_test: true, latitude: 32.61, longitude: 44.02, uncertainty_m: 5 };

async function openTask(code: string, owner: Actor = worker) {
  const face = await createLocation(admin, { ...site, code, structure_code: code });
  await assign(admin, { faceIds: [face.id], workerId: owner.id, dueDate: "2026-12-31" });
  return (await assignments(owner)).find((row) => row.code === code)!;
}

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("reassign-");
  await migrate();
  const db = await getDb();
  for (const actor of [admin, worker, other, inactive, foreign]) {
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", [actor.organizationId]);
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.id + "@move.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [actor.organizationId, actor.id, actor.role]);
    if (actor.role === "worker") await db.query("INSERT INTO worker_profiles(user_id,organization_id,active) VALUES($1,$2,$3)", [actor.id, actor.organizationId, actor.id !== inactive.id]);
  }
});
afterAll(closeDb);

it("moves an open visit to another worker, keeping the site and due date and advancing the version", async () => {
  const task = await openTask("MOVE-1");
  const result = await reassign(admin, { assignmentId: task.assignment_id, workerId: other.id });
  expect(result).toEqual({ assignmentId: task.assignment_id, workerId: other.id, version: task.version + 1 });
  // The visit is now the other worker's, and the first worker can no longer see it.
  const moved = (await assignments(other)).find((row) => row.code === "MOVE-1")!;
  expect(moved).toMatchObject({ assignment_id: task.assignment_id, worker_id: other.id, due_date: task.due_date, version: task.version + 1, status: "assigned" });
  expect((await assignments(worker)).some((row) => row.code === "MOVE-1")).toBe(false);
  expect(await (await getDb()).query("SELECT detail FROM audit_events WHERE action='assignment.reassign' AND entity_id=$1", [task.assignment_id])).toEqual([
    { detail: { faceId: task.id, fromWorkerId: worker.id, toWorkerId: other.id } },
  ]);
});

it("retires a location exception granted to the previous worker", async () => {
  const task = await openTask("MOVE-2");
  await authorizeLocationException(admin, { assignmentId: task.assignment_id, assignmentVersion: task.version, reason: "Approved exception because GPS reception is obstructed" });
  const db = await getDb();
  expect(await activeLocationException(db, worker, task.assignment_id, task.version)).toBeTruthy();
  const { version } = await reassign(admin, { assignmentId: task.assignment_id, workerId: other.id });
  // Neither worker inherits the permission: it was granted for one person at one version.
  expect(await activeLocationException(db, worker, task.assignment_id, task.version)).toBeNull();
  expect(await activeLocationException(db, other, task.assignment_id, version)).toBeNull();
});

it("refuses a visit the worker has already started", async () => {
  const task = await openTask("MOVE-3");
  const capturedAt = new Date(Date.now() - 3600000).toISOString();
  const payload: InspectionInput = {
    operationId: randomUUID(), assignmentId: task.assignment_id, assignmentVersion: task.version, faceId: task.id, faceCode: task.code, challengeId: null,
    photos: (["front", "wide", "angle_1"] as const).map((kind) => ({ kind, bytes: 10, sha256: (kind === "front" ? "a" : kind === "wide" ? "b" : "c").repeat(64), capturedAt, captureMode: "offline", gps: { status: "ok", latitude: site.latitude, longitude: site.longitude, accuracy: 10, observedAt: capturedAt } })),
  };
  expect((await beginInspection(worker, payload)).inspectionId).toBeTruthy();
  await expect(reassign(admin, { assignmentId: task.assignment_id, workerId: other.id })).rejects.toMatchObject({ status: 409 });
  // The visit stays exactly where it was.
  expect((await assignments(worker)).find((row) => row.code === "MOVE-3")).toMatchObject({ worker_id: worker.id, version: task.version });
});

it("refuses workers, other organizations, unknown assignments, the same worker and inactive workers", async () => {
  const task = await openTask("MOVE-4");
  const request = { assignmentId: task.assignment_id, workerId: other.id };
  await expect(reassign(worker, request)).rejects.toMatchObject({ status: 403 });
  await expect(reassign(foreign, request)).rejects.toMatchObject({ status: 404 });
  await expect(reassign(admin, { ...request, assignmentId: randomUUID() })).rejects.toMatchObject({ status: 404 });
  await expect(reassign(admin, { ...request, workerId: worker.id })).rejects.toMatchObject({ status: 422 });
  await expect(reassign(admin, { ...request, workerId: inactive.id })).rejects.toMatchObject({ status: 422 });
  await expect(reassign(admin, { ...request, workerId: admin.id })).rejects.toMatchObject({ status: 422 });
  await expect(reassign(admin, { ...request, dueDate: "2027-01-01" } as never)).rejects.toThrow();
  // Nothing moved and the version never advanced.
  expect((await assignments(worker)).find((row) => row.code === "MOVE-4")).toMatchObject({ worker_id: worker.id, version: task.version });
});

it("generates distinct passwords of the stated length, with no symbols that are read wrongly", async () => {
  const passwords = Array.from({ length: 200 }, () => generatePassword());
  expect(new Set(passwords).size).toBe(passwords.length);
  for (const password of passwords) {
    expect(password).toHaveLength(16);
    expect(password).toMatch(/^[a-zA-Z2-9]+$/);
    expect(password).not.toMatch(/[ilIO01]/);
  }
  expect(generatePassword(40)).toHaveLength(40);
});

it("reads chosen passwords, ignoring comments and a header, and keeping a quoted comma", () => {
  const chosen = readChosenPasswords(
    [
      "# a comment",
      "email,password",
      "Erbil01@OOH.com,Erbil123",
      "",
      '  mosul01@ooh.com , "has,a comma" ',
      'quoted01@ooh.com,"say ""hello"""',
    ].join("\n"),
  );
  // The address is the key, so its case cannot decide whether an account is found.
  expect(chosen.get("erbil01@ooh.com")).toBe("Erbil123");
  expect(chosen.get("mosul01@ooh.com")).toBe("has,a comma");
  expect(chosen.get("quoted01@ooh.com")).toBe('say "hello"');
  expect(chosen.size).toBe(3);
  for (const broken of ["no-comma-here", "missing@ooh.com,", ",password"])
    expect(() => readChosenPasswords(broken)).toThrow();
});

it("names a chosen password as weak when it is short or derived from its own address", () => {
  expect(weakness("erbil01@ooh.com", "Erbil123")).toBe("under 12 characters");
  expect(weakness("erbil01@ooh.com", "Erbil01-and-more")).toBe("derived from its own email address");
  expect(weakness("najafkufa@ooh.com", "NajafKufa123")).toBe("derived from its own email address");
  // Long, and not a restatement of the address.
  expect(weakness("erbil01@ooh.com", "Marsh-Harrier-Quay-8")).toBeNull();
  expect(weakness("erbil01@ooh.com", generatePassword())).toBeNull();
});
