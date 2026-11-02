import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dimensionInput, previewCsv, type Actor } from "../packages/domain/src";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { createLocation } from "../apps/web/src/server/location-management";
import { dimensionHistory, recordDimensions } from "../apps/web/src/server/face-dimensions";

const admin: Actor = { id: "dimension-admin", organizationId: "dimensions-org", role: "admin", name: "Admin", email: "admin@dimensions.invalid" };
const worker: Actor = { ...admin, id: "dimension-worker", role: "worker" };
const foreign: Actor = { ...admin, id: "dimension-foreign", organizationId: "foreign-dimensions" };
const location = { code: "TEST-DIM-001", structure_code: "TEST-DIM-STRUCT", city: "Baghdad", zone: "", orientation: "N" as const, description: "QA dimensions", is_test: true, latitude: 33.31, longitude: 44.36, uncertainty_m: 5 };
let faceId: string;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("dimension-qa-");
  await migrate();
  const db = await getDb();
  for (const actor of [admin, worker, foreign]) {
    await db.query("INSERT INTO organizations(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", [actor.organizationId]);
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [actor.id, actor.name, actor.id + "@qa.invalid"]);
    await db.query("INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)", [actor.organizationId, actor.id, actor.role]);
  }
  faceId = (await createLocation(admin, location)).id;
});
afterAll(closeDb);

describe("dimension input validation", () => {
  const valid = { faceId: "face", widthM: 12.5, heightM: 3, status: "unverified" };
  it("accepts unverified sizes without a source", () => {
    expect(dimensionInput.parse(valid)).toMatchObject({ widthM: 12.5, heightM: 3, sourceNote: "" });
  });
  it("requires a source note for owner-supplied and surveyed sizes", () => {
    expect(() => dimensionInput.parse({ ...valid, status: "owner_supplied" })).toThrow();
    expect(() => dimensionInput.parse({ ...valid, status: "surveyed", sourceNote: "abc" })).toThrow();
    expect(dimensionInput.parse({ ...valid, status: "surveyed", sourceNote: "Site survey, March 2026" }).status).toBe("surveyed");
  });
  it("rejects non-positive, oversized, over-precise and unknown fields", () => {
    for (const bad of [{ widthM: 0 }, { heightM: -1 }, { widthM: 101 }, { widthM: 1.234 }, { status: "verified" }, { extra: true }])
      expect(() => dimensionInput.parse({ ...valid, ...bad })).toThrow();
  });
});

describe("face dimensions", () => {
  it("reports Not recorded until a size is entered", async () => {
    expect(await dimensionHistory(admin, faceId)).toEqual([]);
  });
  it("records append-only history with the newest entry first", async () => {
    await recordDimensions(admin, { faceId, widthM: 12, heightM: 4, status: "unverified" });
    await recordDimensions(admin, { faceId, widthM: 12.5, heightM: 4, status: "owner_supplied", sourceNote: "Owner drawing rev B" });
    const history = await dimensionHistory(admin, faceId);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ width_m: 12.5, status: "owner_supplied", source_note: "Owner drawing rev B" });
    expect(history[1]).toMatchObject({ width_m: 12, height_m: 4, status: "unverified" });
    expect(typeof history[0].width_m).toBe("number");
  });
  it("keeps administrator and organization boundaries", async () => {
    const input = { faceId, widthM: 9, heightM: 2, status: "unverified" };
    await expect(recordDimensions(worker, input)).rejects.toMatchObject({ status: 403 });
    await expect(dimensionHistory(worker, faceId)).rejects.toMatchObject({ status: 403 });
    await expect(recordDimensions(foreign, input)).rejects.toMatchObject({ status: 404 });
    await expect(dimensionHistory(foreign, faceId)).rejects.toMatchObject({ status: 404 });
  });
  it("rejects invalid input without writing a row", async () => {
    const count = async () => (await (await getDb()).query<{ n: number }>("SELECT count(*)::int AS n FROM face_dimensions WHERE face_id=$1", [faceId]))[0].n;
    const before = await count();
    await expect(recordDimensions(admin, { faceId, widthM: -3, heightM: 2, status: "unverified" })).rejects.toThrow();
    expect(await count()).toBe(before);
  });
  it("denies updates and deletes at the database level and audits each record", async () => {
    const db = await getDb();
    await expect(db.query("UPDATE face_dimensions SET width_m=1 WHERE face_id=$1", [faceId])).rejects.toThrow("Immutable");
    await expect(db.query("DELETE FROM face_dimensions WHERE face_id=$1", [faceId])).rejects.toThrow("Immutable");
    const audits = await db.query("SELECT id FROM audit_events WHERE action='face.dimensions.record' AND entity_id=$1", [faceId]);
    expect(audits).toHaveLength(2);
  });
});

describe("optional dimensions on CSV import and location creation", () => {
  const header = "code,structure_code,city,zone,orientation,latitude,longitude,uncertainty_m,width_m,height_m,dimension_status,dimension_source";
  it("previews optional size columns and rejects half-recorded or unsourced sizes", () => {
    const csv = [
      header,
      "CSV-DIM-001,CSV-S1,Baghdad,,N,33.31,44.36,5,12.5,4,unverified,",
      "CSV-DIM-002,CSV-S2,Baghdad,,N,33.32,44.37,5,12.5,,unverified,",
      "CSV-DIM-003,CSV-S3,Baghdad,,N,33.33,44.38,5,12,4,owner_supplied,",
      "CSV-DIM-004,CSV-S4,Baghdad,,N,33.34,44.39,5,,,,",
    ].join("\n");
    const preview = previewCsv(csv);
    expect(preview.rows.map((r) => r.code)).toEqual(["CSV-DIM-001", "CSV-DIM-004"]);
    expect(preview.rows[0]).toMatchObject({ width_m: 12.5, height_m: 4, dimension_status: "unverified" });
    expect(preview.rows[1].width_m).toBeUndefined();
    expect(preview.errors.map((e) => e.row).sort()).toEqual([3, 4]);
  });
  it("stores a recorded size with the new face and leaves blank sizes unrecorded", async () => {
    const withSize = await createLocation(admin, { ...location, code: "TEST-DIM-002", structure_code: "TEST-DIM-S2", width_m: 8, height_m: 3, dimension_status: "unverified" });
    const without = await createLocation(admin, { ...location, code: "TEST-DIM-003", structure_code: "TEST-DIM-S3" });
    expect(await dimensionHistory(admin, withSize.id)).toMatchObject([{ width_m: 8, height_m: 3, status: "unverified" }]);
    expect(await dimensionHistory(admin, without.id)).toEqual([]);
  });
  it("rejects a location with only one side of the size", async () => {
    await expect(createLocation(admin, { ...location, code: "TEST-DIM-004", structure_code: "TEST-DIM-S4", width_m: 8 })).rejects.toThrow();
  });
});
