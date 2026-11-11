import { beforeAll, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb } from "../apps/web/src/server/db";
import { importCsv, assign, assignments, inventory } from "../apps/web/src/server/service";
import { beginInspection, completePhoto, submitInspection, uploadPart } from "../apps/web/src/server/inspections";
import type { InspectionInput } from "../packages/domain/src/inspection";
import type { Actor } from "../packages/domain/src";
import { baghdadExifText, jpegWithExif } from "./helpers/exif-jpeg";

const admin: Actor = { id: "admin", organizationId: "org", role: "admin", name: "Admin", email: "admin@test.invalid" };
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");

type Kind = "front" | "wide" | "angle_1";
type Task = { faceId: string; faceCode: string; assignmentId: string; version: number };
// Four faces at the same coordinates, one visit each. Assignments are backdated and due far in the future,
// so a capture from a few minutes ago falls inside the visit window.
let tasks: Task[] = [];
let when = "";
let receivedFront: Buffer | null = null;
// Every image is distinct; the server rejects a visit whose photos repeat bytes.
let counter = 0;
async function original(overrides: { lat?: number | null; lon?: number | null } = {}) {
  counter++;
  return jpegWithExif({
    lat: overrides.lat === undefined ? 33 : overrides.lat,
    lon: overrides.lon === undefined ? 44 : overrides.lon,
    dateTime: when,
    width: 320 + counter,
    height: 240,
  });
}

function meta(kind: Kind, bytes: Buffer) {
  const now = new Date().toISOString();
  return {
    kind,
    bytes: bytes.length,
    sha256: digest(bytes),
    capturedAt: now,
    captureMode: "gallery_original" as const,
    gps: { status: "unavailable" as const, observedAt: now },
    source: "gallery" as const,
  };
}
function visit(index: number, photos: ReturnType<typeof meta>[], operationId?: string): InspectionInput {
  const t = tasks[index];
  return {
    operationId: operationId ?? crypto.randomUUID(),
    assignmentId: t.assignmentId,
    faceId: t.faceId,
    faceCode: t.faceCode,
    assignmentVersion: t.version,
    challengeId: null,
    photos,
  };
}
async function send(inspectionId: string, kind: Kind, bytes: Buffer) {
  await uploadPart(worker, inspectionId, kind, 0, bytes);
  return completePhoto(worker, inspectionId, kind);
}
async function operationOf(inspectionId: string) {
  const [row] = await (await getDb()).query<{ operation_id: string }>("SELECT operation_id FROM inspections WHERE id=$1", [inspectionId]);
  return row.operation_id;
}

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("gallery-db-");
  process.env.IBVS_EVIDENCE_DIR = await testDirectory("gallery-files-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES('org','Test')");
  for (const user of [admin, worker]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [user.id, user.name, user.id + "@test.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", ["org", user.id, user.role]);
  }
  await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [worker.id, "org"]);
  await importCsv(
    admin,
    [
      "code,structure_code,city,latitude,longitude",
      "GAL-001,STR-001,Baghdad,33,44",
      "GAL-002,STR-002,Baghdad,33,44",
      "GAL-003,STR-003,Baghdad,33,44",
      "GAL-004,STR-004,Baghdad,33,44",
    ].join("\n"),
    "gallery.csv",
  );
  const faces = await inventory(admin);
  for (const face of faces) await assign(admin, { faceIds: [face.id], workerId: worker.id, dueDate: "2099-12-31" });
  await db.query("UPDATE assignments SET created_at = now() - interval '2 days'");
  const rows = await assignments(worker);
  tasks = faces
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((face) => {
      const row = rows.find((r) => r.id === face.id)!;
      return { faceId: face.id, faceCode: face.code, assignmentId: row.assignment_id, version: row.version };
    });
  when = baghdadExifText(Date.now() - 10 * 60 * 1000);
});

it("approves gallery originals whose EXIF passes, then submits the visit", async () => {
  const [front, wide, angle] = [await original(), await original(), await original()];
  receivedFront = front;
  const session = await beginInspection(worker, visit(0, [meta("front", front), meta("wide", wide), meta("angle_1", angle)]));
  expect((await send(session.inspectionId, "front", front)).verification?.status).toBe("approved");
  expect((await send(session.inspectionId, "wide", wide)).verification?.status).toBe("approved");
  expect((await send(session.inspectionId, "angle_1", angle)).verification?.status).toBe("approved");
  const receipt = await submitInspection(worker, session.inspectionId);
  expect(receipt.status).toBe("server_received");
  expect(receipt.flags).toContain("gallery_exif_checked_by_server");
});

it("rejects a gallery photo with no EXIF GPS, refuses submission, then accepts a gallery replacement", async () => {
  const [front, wide] = [await original(), await original()];
  const noGps = await jpegWithExif({ lat: null, lon: null, dateTime: when, width: 400, height: 300 });
  const first = visit(1, [meta("front", front), meta("wide", wide), meta("angle_1", noGps)]);
  const session = await beginInspection(worker, first);
  await send(session.inspectionId, "front", front);
  await send(session.inspectionId, "wide", wide);
  const rejected = await send(session.inspectionId, "angle_1", noGps);
  expect(rejected.verification?.status).toBe("rejected");
  expect(rejected.verification?.reasons.map((r) => r.code)).toContain("exif_missing:GPSLatitude");

  await expect(submitInspection(worker, session.inspectionId)).rejects.toMatchObject({
    status: 422,
    details: { verification: [expect.objectContaining({ kind: "angle_1", status: "rejected" })] },
  });

  // The worker picks another original; the same visit (same operation key) takes the replacement in place.
  const angle = await original();
  const operationId = await operationOf(session.inspectionId);
  const reopened = await beginInspection(worker, visit(1, [meta("front", front), meta("wide", wide), meta("angle_1", angle)], operationId));
  expect(reopened.inspectionId).toBe(session.inspectionId);
  expect(reopened.photos.find((p) => p.kind === "angle_1")!.receiptId).toBeNull();
  expect((await send(session.inspectionId, "angle_1", angle)).verification?.status).toBe("approved");
  expect((await submitInspection(worker, session.inspectionId)).status).toBe("server_received");
});

it("refuses to replace a photo the server has already approved", async () => {
  const [front, wide, angle] = [await original(), await original(), await original()];
  const base = visit(2, [meta("front", front), meta("wide", wide), meta("angle_1", angle)]);
  const session = await beginInspection(worker, base);
  await send(session.inspectionId, "front", front);
  await send(session.inspectionId, "wide", wide);
  await send(session.inspectionId, "angle_1", angle);
  const changedFront = await original();
  await expect(
    beginInspection(worker, { ...base, photos: [meta("front", changedFront), meta("wide", wide), meta("angle_1", angle)] }),
  ).rejects.toMatchObject({ status: 409 });
});

it("flags an original the server already received on another visit as an exact duplicate", async () => {
  const [wide, angle] = [await original(), await original()];
  const session = await beginInspection(worker, visit(3, [meta("front", receivedFront!), meta("wide", wide), meta("angle_1", angle)]));
  const result = await send(session.inspectionId, "front", receivedFront!);
  expect(result.verification?.status).toBe("rejected");
  expect(result.verification?.reasons.map((r) => r.code)).toContain("duplicate_exact");
});
