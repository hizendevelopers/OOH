import { beforeAll, afterAll, it, expect, vi } from "vitest";
import * as storage from "../apps/web/src/server/evidence-storage";
import { testDirectory } from "../scripts/test-directory";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import { migrate } from "../scripts/migrate";
import { getDb, closeDb } from "../apps/web/src/server/db";
import {
  importCsv,
  assign,
  inventory,
  assignments,
} from "../apps/web/src/server/service";
import {
  beginInspection,
  uploadPart,
  completePhoto,
  submitInspection,
  inspectionStatus,
  evidenceAccess,
  issueChallenge,
} from "../apps/web/src/server/inspections";
import {
  CHUNK_SIZE,
  type InspectionInput,
} from "../packages/domain/src/inspection";
import type { Actor } from "../packages/domain/src";

const admin: Actor = {
  id: "admin",
  organizationId: "org",
  role: "admin",
  name: "Admin",
  email: "admin@test.invalid",
};
const worker: Actor = { ...admin, id: "worker", role: "worker" };
const other: Actor = { ...worker, id: "other" };
let input: InspectionInput;
let front: Buffer, wide: Buffer;
let id: string;
const digest = (buffer: Buffer) =>
  createHash("sha256").update(buffer).digest("hex");
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("evidence-db-");
  process.env.IBVS_EVIDENCE_DIR = await testDirectory("evidence-files-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  await migrate();
  const db = await getDb();
  await db.query("INSERT INTO organizations(id,name) VALUES('org','Test')");
  for (const user of [admin, worker, other]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [
      user.id,
      user.name,
      user.id + "@test.invalid",
    ]);
    await db.query(
      "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",
      ["org", user.id, user.role],
    );
    if (user.role === "worker")
      await db.query(
        "INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)",
        [user.id, "org"],
      );
  }
  await importCsv(
    admin,
    "code,structure_code,city,latitude,longitude\nTST-001,STR-001,Baghdad,33,44",
    "test.csv",
  );
  const [face] = await inventory(admin);
  await assign(admin, {
    faceIds: [face.id],
    workerId: worker.id,
    dueDate: "2026-11-01",
  });
  const [task] = await assignments(worker);
  front = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#225599" },
  })
    .jpeg()
    .toBuffer();
  wide = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#119955" },
  })
    .jpeg()
    .toBuffer();
  input = {
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: face.id,
    faceCode: face.code,
    assignmentVersion: 1,
    challengeId: null,
    photos: [
      {
        kind: "front",
        sha256: digest(front),
        bytes: front.length,
        capturedAt: new Date().toISOString(),
        captureMode: "offline",
        gps: { status: "denied", observedAt: new Date().toISOString() },
      },
      {
        kind: "wide",
        sha256: digest(wide),
        bytes: wide.length,
        capturedAt: new Date().toISOString(),
        captureMode: "online_unchallenged",
        gps: {
          status: "ok",
          latitude: 33,
          longitude: 44,
          accuracy: 70,
          observedAt: new Date().toISOString(),
        },
      },
    ],
  };
});
afterAll(closeDb);
it("denies billboard ID and task/version tampering, other workers and admin uploads", async () => {
  await expect(
    beginInspection(worker, { ...input, faceId: randomUUID() }),
  ).rejects.toThrow("identity");
  await expect(
    beginInspection(worker, { ...input, assignmentVersion: 8 }),
  ).rejects.toThrow("changed");
  await expect(beginInspection(other, input)).rejects.toThrow("not found");
  await expect(beginInspection(admin, input)).rejects.toThrow("Worker");
});
it("issues scoped challenges and flags expiry instead of attesting capture", async () => {
  await expect(issueChallenge(other, input.assignmentId)).rejects.toThrow(
    "not found",
  );
  const challenge = await issueChallenge(worker, input.assignmentId);
  input.challengeId = challenge.id;
  input.photos[1].captureMode = "online_challenged";
  await (
    await getDb()
  ).query(
    "UPDATE challenges SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [challenge.id],
  );
});
it("creates a stable session and rejects idempotency payload changes", async () => {
  const result = await beginInspection(worker, input);
  id = result.inspectionId;
  expect((await beginInspection(worker, input)).inspectionId).toBe(id);
  await expect(
    beginInspection(worker, { ...input, faceCode: "FORGED" }),
  ).rejects.toThrow("payload conflict");
  expect(
    await (await getDb()).query("SELECT id FROM inspections"),
  ).toHaveLength(1);
});
it("retains interrupted uploads without issuing receipts and denies foreign access", async () => {
  const exhausted = vi
    .spyOn(storage, "putPrivate")
    .mockRejectedValueOnce(
      Object.assign(new Error("No space"), { code: "ENOSPC" }),
    );
  await expect(
    uploadPart(worker, id, "front", 0, front.subarray(0, CHUNK_SIZE)),
  ).rejects.toThrow("No space");
  exhausted.mockRestore();
  expect(
    (await inspectionStatus(worker, id)).photos.find((p) => p.kind === "front")!
      .receivedParts,
  ).toEqual([]);
  await uploadPart(worker, id, "front", 0, front.subarray(0, CHUNK_SIZE));
  await closeDb(); // Simulate process restart; neither metadata nor private parts are in memory.
  expect(
    (await inspectionStatus(worker, id)).photos.find((p) => p.kind === "front")!
      .receivedParts,
  ).toEqual([0]);
  await expect(submitInspection(worker, id)).rejects.toThrow("both");
  await expect(inspectionStatus(other, id)).rejects.toThrow("not found");
  await expect(evidenceAccess(other, id, "front")).rejects.toThrow("not found");
  await expect(uploadPart(other, id, "wide", 0, wide)).rejects.toThrow(
    "not found",
  );
});
it("refuses unsafe storage configuration", () => {
  const original = process.env.IBVS_EVIDENCE_DIR;
  try {
    process.env.IBVS_EVIDENCE_DIR = "relative/path";
    expect(() => storage.evidenceRoot()).toThrow("absolute");
    process.env.IBVS_EVIDENCE_DIR = process.cwd() + "/apps/web/public/evidence";
    expect(() => storage.evidenceRoot()).toThrow("web application");
  } finally {
    process.env.IBVS_EVIDENCE_DIR = original;
  }
});
it("resumes inside a multi-part JPEG after reopening the database", async () => {
  await importCsv(
    admin,
    "code,structure_code,city,latitude,longitude\nTST-MULTI,STR-MULTI,Baghdad,33,44",
    "multipart-test.csv",
  );
  const face = (await inventory(admin)).find((f) => f.code === "TST-MULTI")!;
  await assign(admin, {
    faceIds: [face.id],
    workerId: worker.id,
    dueDate: "2026-11-01",
  });
  const task = (await assignments(worker)).find((t) => t.id === face.id)!;
  const image = await sharp(randomBytes(640 * 480 * 3), {
    raw: { width: 640, height: 480, channels: 3 },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  expect(image.length).toBeGreaterThan(CHUNK_SIZE);
  const payload: InspectionInput = {
    ...input,
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: face.id,
    faceCode: face.code,
    challengeId: null,
    photos: input.photos.map((p) =>
      p.kind === "front"
        ? { ...p, bytes: image.length, sha256: digest(image) }
        : { ...p },
    ),
  };
  const session = await beginInspection(worker, payload);
  await uploadPart(
    worker,
    session.inspectionId,
    "front",
    0,
    image.subarray(0, CHUNK_SIZE),
  );
  await expect(
    completePhoto(worker, session.inspectionId, "front"),
  ).rejects.toThrow("incomplete");
  await closeDb();
  expect(
    (await inspectionStatus(worker, session.inspectionId)).photos.find(
      (p) => p.kind === "front",
    )!.receivedParts,
  ).toEqual([0]);
  for (let part = 0; part < Math.ceil(image.length / CHUNK_SIZE); part++)
    await uploadPart(
      worker,
      session.inspectionId,
      "front",
      part,
      image.subarray(part * CHUNK_SIZE, (part + 1) * CHUNK_SIZE),
    );
  const receipt = await completePhoto(worker, session.inspectionId, "front");
  expect(
    (await completePhoto(worker, session.inspectionId, "front")).receiptId,
  ).toBe(receipt.receiptId);
  expect(await evidenceAccess(worker, session.inspectionId, "front")).toEqual(
    image,
  );
});
it("replays identical chunks and rejects altered bytes", async () => {
  expect(await uploadPart(worker, id, "front", 0, front)).toMatchObject({
    received: true,
  });
  const changed = Buffer.from(front);
  changed[10] ^= 1;
  await expect(uploadPart(worker, id, "front", 0, changed)).rejects.toThrow(
    "different bytes",
  );
  await expect(
    uploadPart(worker, id, "wide", 0, Buffer.alloc(1)),
  ).rejects.toThrow("byte length");
});
it("validates JPEGs and returns stable photo and inspection receipts on replay", async () => {
  const a = await completePhoto(worker, id, "front");
  expect(await completePhoto(worker, id, "front")).toEqual(a);
  await uploadPart(worker, id, "wide", 0, wide);
  await completePhoto(worker, id, "wide");
  const received = await submitInspection(worker, id);
  expect(received.flags).toEqual(
    expect.arrayContaining([
      "gps_denied",
      "offline_capture_device_claim",
      "challenge_expired_at_receipt",
      "human_review_required",
    ]),
  );
  expect(await submitInspection(worker, id)).toEqual(received);
  expect((await beginInspection(worker, input)).receipt).toEqual(received);
  expect(
    (await assignments(worker)).find(
      (task) => task.assignment_id === input.assignmentId,
    )?.status,
  ).toBe("server_received");
  expect(await evidenceAccess(admin, id, "front")).toEqual(front);
  expect(await evidenceAccess(worker, id, "wide")).toEqual(wide);
  expect(
    await (
      await getDb()
    ).query(
      "SELECT id FROM audit_events WHERE action='inspection.server_received'",
    ),
  ).toHaveLength(1);
});
it("received submissions cannot be overwritten", async () => {
  await expect(
    (await getDb()).query(
      "UPDATE inspections SET status='uploading' WHERE id=$1",
      [id],
    ),
  ).rejects.toThrow("immutable");
});
it("rejects malformed media without issuing a receipt", async () => {
  await importCsv(
    admin,
    "code,structure_code,city,latitude,longitude\nTST-BAD,STR-BAD,Baghdad,33,44",
    "bad-image-test.csv",
  );
  const face = (await inventory(admin)).find((f) => f.code === "TST-BAD")!;
  await assign(admin, {
    faceIds: [face.id],
    workerId: worker.id,
    dueDate: "2026-11-01",
  });
  const task = (await assignments(worker)).find((t) => t.id === face.id)!;
  const invalid = Buffer.from("This is not a JPEG");
  const request: InspectionInput = {
    ...input,
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: face.id,
    faceCode: face.code,
    challengeId: null,
    photos: input.photos.map((p) => ({
      ...p,
      bytes: invalid.length,
      sha256: digest(invalid),
    })),
  };
  const upload = await beginInspection(worker, request);
  await uploadPart(worker, upload.inspectionId, "front", 0, invalid);
  await expect(
    completePhoto(worker, upload.inspectionId, "front"),
  ).rejects.toThrow("Invalid JPEG");
  expect(
    (await inspectionStatus(worker, upload.inspectionId)).photos[0].receiptId,
  ).toBeNull();
});
