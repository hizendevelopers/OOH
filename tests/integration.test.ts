import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { testDirectory } from "../scripts/test-directory";
import { randomBytes, randomUUID } from "node:crypto";
import { getDb, closeDb } from "../apps/web/src/server/db";
import { migrate } from "../scripts/migrate";
import { provision } from "../scripts/provision";
import { createAuth } from "../apps/web/src/server/auth";
import {
  importCsv,
  inventory,
  assign,
  assignments,
  overview,
  auditLog,
} from "../apps/web/src/server/service";
import type { Actor } from "../packages/domain/src";
let admin: Actor, worker: Actor, other: Actor, foreign: Actor;
let faceId: string;
const password = randomBytes(24).toString("base64url");
const csv =
  "code,structure_code,city,zone,latitude,longitude\nTST-001,STR-001,Baghdad,Karrada,33.3,44.4\nTST-002,STR-001,Baghdad,Karrada,33.3,44.4";
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("integration-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  await migrate();
  const db = await getDb();
  await db.query(
    "INSERT INTO organizations(id,name) VALUES ('test','Test'),('other','Other')",
  );
  const make = async (
    email: string,
    role: "admin" | "worker",
    org = "test",
  ): Promise<Actor> => {
    const u = await provision({
      email,
      name: email,
      password,
      role,
      organizationId: org,
    });
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      organizationId: org,
      role,
    };
  };
  admin = await make("admin@test.invalid", "admin");
  worker = await make("worker@test.invalid", "worker");
  other = await make("other@test.invalid", "worker");
  foreign = await make("foreign@test.invalid", "admin", "other");
});
afterAll(closeDb);
describe("database migrations, constraints and transactions", () => {
  it("imports atomically and persists true counts", async () => {
    expect(await importCsv(admin, csv, "test.csv")).toEqual({ imported: 2 });
    const faces = await inventory(admin);
    faceId = faces[0].id;
    expect(faces).toHaveLength(2);
    expect(await overview(admin)).toMatchObject({
      faces: 2,
      structures: 1,
      verified: 0,
    });
  });
  it("rejects duplicate replay without changing data", async () => {
    await expect(importCsv(admin, csv, "replay.csv")).rejects.toThrow(
      "validation",
    );
    expect(await inventory(admin)).toHaveLength(2);
  });
  it("rolls back earlier rows on conflicting structure metadata", async () => {
    await expect(
      importCsv(
        admin,
        "code,structure_code,city,latitude,longitude\nNEW-001,STR-NEW,Erbil,36,44\nNEW-002,STR-001,Basra,30,47",
        "bad.csv",
      ),
    ).rejects.toThrow("different city");
    expect(await inventory(admin)).toHaveLength(2);
    expect(
      await (
        await getDb()
      ).query("SELECT id FROM billboard_structures WHERE code='STR-NEW'"),
    ).toHaveLength(0);
  });
  it("denies coordinate, face code and audit mutation", async () => {
    const db = await getDb();
    await expect(
      db.query("UPDATE source_coordinates SET latitude=0 WHERE face_id=$1", [
        faceId,
      ]),
    ).rejects.toThrow("Immutable");
    await expect(
      db.query("UPDATE billboard_faces SET code='FORGED-001' WHERE id=$1", [
        faceId,
      ]),
    ).rejects.toThrow("Immutable");
    await expect(
      db.query("DELETE FROM audit_events WHERE organization_id='test'"),
    ).rejects.toThrow("Immutable");
  });
  it("assigns with audit and prevents duplicate active visits", async () => {
    await assign(admin, {
      faceIds: [faceId],
      workerId: worker.id,
      dueDate: "2026-11-01",
    });
    expect(await assignments(worker)).toHaveLength(1);
    await expect(
      assign(admin, {
        faceIds: [faceId],
        workerId: other.id,
        dueDate: "2026-11-01",
      }),
    ).rejects.toThrow("active assignment");
    const events = await auditLog(admin);
    expect(events.filter((e) => e.action === "assignment.create")).toHaveLength(
      1,
    );
  });
  it("rolls back batch assignment after a missing face", async () => {
    const available = (await inventory(admin)).find((f) => !f.status)!;
    await expect(
      assign(admin, {
        faceIds: [available.id, randomUUID()],
        workerId: worker.id,
        dueDate: "2026-11-01",
      }),
    ).rejects.toThrow("not found");
    expect(await assignments(admin)).toHaveLength(1);
  });
});
describe("authorization and auth library", () => {
  it("denies worker import and inventory access", async () => {
    await expect(importCsv(worker, csv, "evil.csv")).rejects.toThrow(
      "Administrator",
    );
    await expect(inventory(worker)).rejects.toThrow("Administrator");
  });
  it("hides other worker and organization tasks including guessed IDs", async () => {
    const [task] = await assignments(worker);
    expect(await assignments(other, task.assignment_id)).toEqual([]);
    expect(await assignments(foreign, task.assignment_id)).toEqual([]);
    expect(await inventory(foreign)).toEqual([]);
  });
  it("rejects cross-organization face and worker assignment", async () => {
    await expect(
      assign(foreign, {
        faceIds: [faceId],
        workerId: worker.id,
        dueDate: "2026-11-01",
      }),
    ).rejects.toThrow("active worker");
  });
  it("disables public signup and supports database session login", async () => {
    const auth = await createAuth();
    await expect(
      auth.api.signUpEmail({
        body: { email: "evil@test.invalid", password, name: "Evil" },
      }),
    ).rejects.toThrow();
    const result = await auth.api.signInEmail({
      body: { email: worker.email, password },
    });
    expect(result.user.id).toBe(worker.id);
    expect(result.token).toBeTruthy();
  });
});
