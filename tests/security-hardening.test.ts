import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb, closeDb } from "../apps/web/src/server/db";
import { admitAnalysis } from "../apps/web/src/server/analysis-admission";
import * as storage from "../apps/web/src/server/evidence-storage";
import {
  assign,
  assignments,
  importCsv,
  inventory,
} from "../apps/web/src/server/service";
import {
  beginInspection,
  completePhoto,
  submitInspection,
  uploadPart,
} from "../apps/web/src/server/inspections";
import { sha256 } from "../apps/web/src/server/image-analysis";
import { assessInspection } from "../apps/web/src/server/risk-analysis";
import * as spatial from "../apps/web/src/server/spatial";
import type { Actor } from "../packages/domain/src";
import type { InspectionInput } from "../packages/domain/src/inspection";
import config from "../apps/web/next.config";

const admin: Actor = {
  id: "security-admin",
  organizationId: "security-org",
  role: "admin",
  name: "Security admin",
  email: "admin@security.invalid",
};
const worker: Actor = { ...admin, id: "security-worker", role: "worker" };
const foreign: Actor = {
  ...admin,
  id: "security-foreign",
  organizationId: "foreign-org",
};
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("security-db-");
  process.env.IBVS_EVIDENCE_DIR = await testDirectory("security-files-");
  await migrate();
  const db = await getDb();
  for (const actor of [admin, worker, foreign]) {
    await db.query(
      "INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING",
      [actor.organizationId],
    );
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [
      actor.id,
      actor.name,
      actor.email + actor.id,
    ]);
    await db.query(
      "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",
      [actor.organizationId, actor.id, actor.role],
    );
  }
  await db.query(
    "INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)",
    [worker.id, worker.organizationId],
  );
});
beforeEach(async () => {
  await (await getDb()).query("DELETE FROM analysis_admissions");
});
afterAll(async () => {
  vi.restoreAllMocks();
  await closeDb();
});

it("serializes concurrent database admission, releases slots and isolates organizations", async () => {
  const db = await getDb();
  const attempts = await Promise.allSettled([
    admitAnalysis(db, admin),
    admitAnalysis(db, worker),
    admitAnalysis(db, admin),
  ]);
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(2);
  const denied = attempts.find(
    (a) => a.status === "rejected",
  ) as PromiseRejectedResult;
  expect(denied.reason.status).toBe(429);
  const otherRelease = await admitAnalysis(db, foreign);
  await otherRelease();
  for (const a of attempts) if (a.status === "fulfilled") await a.value();
  await (
    await admitAnalysis(db, admin)
  )();
});

it("limits start rates across released leases, expires crashed leases and cleans old rows", async () => {
  const db = await getDb();
  await db.query(
    "INSERT INTO analysis_admissions(id,organization_id,actor_id,lease_until) SELECT 'rate-'||n,$1,$2,now() FROM generate_series(1,60) n",
    [admin.organizationId, admin.id],
  );
  await expect(admitAnalysis(db, admin)).rejects.toMatchObject({ status: 429 });
  await (
    await admitAnalysis(db, worker)
  )();
  await db.query(
    "UPDATE analysis_admissions SET started_at=now()-interval '6 minutes',lease_until=now()-interval '1 minute'",
  );
  await (
    await admitAnalysis(db, admin)
  )();
  expect((await db.query("SELECT id FROM analysis_admissions")).length).toBe(1);
  await db.query(
    "INSERT INTO analysis_admissions(id,organization_id,actor_id,lease_until) SELECT 'org-rate-'||n,$1,$2,now() FROM generate_series(1,179) n",
    [admin.organizationId, worker.id],
  );
  await expect(admitAnalysis(db, admin)).rejects.toMatchObject({ status: 429 });
});

it("preserves receipt after analysis admission failure and replays without private image reads", async () => {
  const db = await getDb();
  await importCsv(
    admin,
    "code,structure_code,city,latitude,longitude\nSEC-001,SEC-STR,Baghdad,33,44",
    "security.csv",
  );
  const [face] = await inventory(admin);
  await assign(admin, {
    faceIds: [face.id],
    workerId: worker.id,
    dueDate: "2026-12-01",
  });
  const [task] = await assignments(worker);
  const blobs = await Promise.all(
    ["#335588", "#558833"].map((background) =>
      sharp({ create: { width: 640, height: 480, channels: 3, background } })
        .jpeg()
        .toBuffer(),
    ),
  );
  const now = new Date().toISOString();
  const input: InspectionInput = {
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId: face.id,
    faceCode: face.code,
    assignmentVersion: task.version,
    challengeId: null,
    photos: blobs.map((b, i) => ({
      kind: i === 0 ? "front" : "wide",
      bytes: b.length,
      sha256: sha256(b),
      capturedAt: now,
      captureMode: "offline",
      gps: { status: "denied", observedAt: now },
    })),
  };
  const session = await beginInspection(worker, input);
  for (let i = 0; i < 2; i++) {
    const kind = i === 0 ? "front" : "wide";
    await uploadPart(worker, session.inspectionId, kind, 0, blobs[i]);
    await completePhoto(worker, session.inspectionId, kind);
  }
  const release1 = await admitAnalysis(db, admin),
    release2 = await admitAnalysis(db, worker);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const received = await submitInspection(worker, session.inspectionId);
  expect(received.status).toBe("server_received");
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining("risk_analysis_pending"),
  );
  await release1();
  await release2();
  const reads = vi.spyOn(storage, "readPrivate");
  expect(await submitInspection(worker, session.inspectionId)).toEqual(
    received,
  );
  expect(reads).not.toHaveBeenCalled();
  await expect(
    assessInspection(foreign, session.inspectionId),
  ).rejects.toMatchObject({ status: 404 });
  expect(reads).not.toHaveBeenCalled();
  reads.mockRestore();
  log.mockRestore();
  const report = await assessInspection(admin, session.inspectionId);
  expect(report.photos).toHaveLength(2);
  const [usage] = await db.query<{ active: number }>(
    "SELECT count(*)::int active FROM analysis_admissions WHERE lease_until>now()",
  );
  expect(usage.active).toBe(0);
  const failedSpatial = vi
    .spyOn(spatial, "spatialEngine")
    .mockRejectedValueOnce(new Error("Spatial service unavailable"));
  try {
    await expect(assessInspection(admin, session.inspectionId)).rejects.toThrow(
      "Spatial service unavailable",
    );
    const [afterFailure] = await db.query<{ active: number }>(
      "SELECT count(*)::int active FROM analysis_admissions WHERE lease_until>now()",
    );
    expect(afterFailure.active).toBe(0);
  } finally {
    failedSpatial.mockRestore();
  }
});

it("omits eval from production CSP while allowing development tooling", async () => {
  const original = process.env.NODE_ENV;
  try {
    for (const mode of ["production", "development"]) {
      vi.stubEnv("NODE_ENV", mode);
      const headers = await config.headers!();
      const csp = headers
        .flatMap((h) => h.headers)
        .find((h) => h.key === "Content-Security-Policy")!.value;
      expect(csp.includes("'unsafe-eval'")).toBe(mode === "development");
      expect(csp).toContain("frame-ancestors 'none'");
    }
  } finally {
    vi.stubEnv("NODE_ENV", original);
  }
});
