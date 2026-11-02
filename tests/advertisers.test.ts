import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { brandEntry, normalizeBrandKey, type Actor } from "../packages/domain/src";
import { inspectionInput, type InspectionInput } from "../packages/domain/src/inspection";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { assign, assignments } from "../apps/web/src/server/service";
import { createLocation } from "../apps/web/src/server/location-management";
import { beginInspection } from "../apps/web/src/server/inspections";
import { brandForInspection, confirmBrand } from "../apps/web/src/server/advertisers";

const admin: Actor = { id: "brand-admin", organizationId: "brand-org", role: "admin", name: "Admin", email: "admin@brand.invalid" };
const worker: Actor = { ...admin, id: "brand-worker", role: "worker" };
const foreign: Actor = { ...admin, id: "brand-foreign", organizationId: "foreign-brand" };
const base = { city: "Basra", zone: "", orientation: "N" as const, description: "QA brand", is_test: true, latitude: 30.5, longitude: 47.8, uncertainty_m: 5 };
const now = () => new Date().toISOString();
const photo = (kind: "front" | "wide" | "angle_1") => ({
  kind,
  bytes: 1000,
  sha256: "a".repeat(64),
  capturedAt: now(),
  captureMode: "offline" as const,
  gps: { status: "ok" as const, latitude: 30.5, longitude: 47.8, accuracy: 10, observedAt: now() },
});
let advertisedFace: string;
let blankFace: string;
let advertisedInspection: string;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("brand-qa-");
  await migrate();
  const db = await getDb();
  for (const actor of [admin, worker, foreign]) {
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", [actor.organizationId]);
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.id + "@qa.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [actor.organizationId, actor.id, actor.role]);
    if (actor.role === "worker") await db.query("INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)", [actor.id, actor.organizationId]);
  }
  advertisedFace = (await createLocation(admin, { ...base, code: "TEST-BRAND-001", structure_code: "TEST-BRAND-S1" })).id;
  blankFace = (await createLocation(admin, { ...base, code: "TEST-BRAND-002", structure_code: "TEST-BRAND-S2" })).id;
  await assign(admin, { faceIds: [advertisedFace, blankFace], workerId: worker.id, dueDate: "2026-12-01" });
});
afterAll(closeDb);

function submission(faceId: string, code: string, task: { assignment_id: string; version: number }, brand?: InspectionInput["brand"]): InspectionInput {
  return {
    operationId: randomUUID(),
    assignmentId: task.assignment_id,
    faceId,
    faceCode: code,
    assignmentVersion: task.version,
    challengeId: null,
    photos: [photo("front"), photo("wide"), photo("angle_1")],
    ...(brand === undefined ? {} : { brand }),
  };
}

describe("brand normalisation and entry rules", () => {
  it("matches spelling variants to one key", () => {
    expect(normalizeBrandKey("Coca-Cola")).toBe(normalizeBrandKey("coca cola"));
    expect(normalizeBrandKey("  ZAIN  ")).toBe("zain");
    expect(normalizeBrandKey("أحمد")).toBe(normalizeBrandKey("احمد"));
    expect(normalizeBrandKey("زَيْن")).toBe(normalizeBrandKey("زين"));
    expect(normalizeBrandKey("مدرسة")).toBe(normalizeBrandKey("مدرسه"));
  });
  it("requires brand text only for an advertiser", () => {
    expect(brandEntry.parse({ kind: "advertiser", text: "Zain" })).toMatchObject({ kind: "advertiser", text: "Zain" });
    expect(() => brandEntry.parse({ kind: "advertiser", text: "Z" })).toThrow();
    expect(() => brandEntry.parse({ kind: "blank", text: "Zain" })).toThrow();
    expect(brandEntry.parse({ kind: "unreadable" })).toMatchObject({ text: "" });
  });
  it("keeps brand optional so drafts queued before this change still parse", () => {
    const legacy = submission(randomUUID(), "TEST-LEGACY-01", { assignment_id: randomUUID(), version: 1 });
    expect(() => inspectionInput.parse(legacy)).not.toThrow();
  });
});

describe("worker brand observations and supervisor confirmation", () => {
  it("stores the worker's brand with the inspection and not as identity", async () => {
    const [task] = (await assignments(worker)).filter((t) => t.id === advertisedFace);
    const result = await beginInspection(worker, submission(advertisedFace, "TEST-BRAND-001", task, { kind: "advertiser", text: "Zain" }));
    advertisedInspection = result.inspectionId;
    const summary = await brandForInspection(await getDb(), admin.organizationId, advertisedInspection);
    expect(summary.observation).toMatchObject({ kind: "advertiser", observed_text: "Zain" });
    expect(summary.current).toBeNull();
  });
  it("records blank faces without any brand text", async () => {
    const [task] = (await assignments(worker)).filter((t) => t.id === blankFace);
    const result = await beginInspection(worker, submission(blankFace, "TEST-BRAND-002", task, { kind: "blank", text: "" }));
    const summary = await brandForInspection(await getDb(), admin.organizationId, result.inspectionId);
    expect(summary.observation).toMatchObject({ kind: "blank", observed_text: "" });
  });
  it("confirms a new advertiser once and reuses it for later spellings", async () => {
    const first = await confirmBrand(admin, advertisedInspection, { outcome: "advertiser", newName: "زين", reason: "Read on the face" });
    const second = await confirmBrand(admin, advertisedInspection, { outcome: "advertiser", newName: "زَيْن" });
    expect(second.advertiserId).toBe(first.advertiserId);
    const summary = await brandForInspection(await getDb(), admin.organizationId, advertisedInspection);
    expect(summary.current).toMatchObject({ outcome: "advertiser", advertiser_id: first.advertiserId, advertiser_name: "زين" });
    expect(summary.advertisers).toHaveLength(1);
  });
  it("keeps every confirmation and denies edits to history", async () => {
    await confirmBrand(admin, advertisedInspection, { outcome: "blank" });
    const db = await getDb();
    const rows = await db.query<{ outcome: string }>("SELECT outcome FROM advertiser_confirmations WHERE face_id=$1 ORDER BY confirmed_at, id", [advertisedFace]);
    expect(rows.map((r) => r.outcome).sort()).toEqual(["advertiser", "advertiser", "blank"]);
    expect((await brandForInspection(db, admin.organizationId, advertisedInspection)).current).toMatchObject({ outcome: "blank", advertiser_name: "" });
    await expect(db.query("UPDATE advertiser_confirmations SET outcome='blank' WHERE face_id=$1", [advertisedFace])).rejects.toThrow("Immutable");
    await expect(db.query("DELETE FROM brand_observations WHERE face_id=$1", [advertisedFace])).rejects.toThrow("Immutable");
  });
  it("rejects invalid confirmations and cross-role or cross-organization access", async () => {
    await expect(confirmBrand(worker, advertisedInspection, { outcome: "blank" })).rejects.toMatchObject({ status: 403 });
    await expect(confirmBrand(foreign, advertisedInspection, { outcome: "blank" })).rejects.toMatchObject({ status: 404 });
    await expect(confirmBrand(admin, advertisedInspection, { outcome: "advertiser" })).rejects.toThrow();
    await expect(confirmBrand(admin, advertisedInspection, { outcome: "blank", newName: "Zain" })).rejects.toThrow();
    await expect(confirmBrand(admin, advertisedInspection, { outcome: "advertiser", advertiserId: randomUUID() })).rejects.toMatchObject({ status: 404 });
  });
});
