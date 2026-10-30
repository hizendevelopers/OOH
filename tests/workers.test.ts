import { beforeAll, afterAll, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { testDirectory } from "../scripts/test-directory";
import { getDb, closeDb } from "../apps/web/src/server/db";
import { migrate } from "../scripts/migrate";
import { provision } from "../scripts/provision";
import { createWorker } from "../apps/web/src/server/worker-management";
import { createAuth } from "../apps/web/src/server/auth";
import {
  workers,
  importCsv,
  inventory,
  assign,
  assignments,
} from "../apps/web/src/server/service";
import type { Actor } from "../packages/domain/src";

const password = randomBytes(24).toString("base64url");
let admin: Actor;
let worker: Actor;
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("workers-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query(
    "INSERT INTO organizations(id,name) VALUES('workers-org','Workers'),('foreign-org','Foreign')",
  );
  const user = await provision({
    name: "Admin",
    email: "admin@workers.test",
    password,
    role: "admin",
    organizationId: "workers-org",
  });
  admin = { ...user, role: "admin", organizationId: "workers-org" };
});
afterAll(closeDb);

it("creates a worker with a password account, organization membership, profile and admin audit attribution", async () => {
  const result = await createWorker(admin, {
    name: " Field Worker ",
    email: "FIELD@workers.test",
    password,
  });
  expect(result).toEqual({
    id: expect.any(String),
    name: "Field Worker",
    email: "field@workers.test",
  });
  worker = { ...result, role: "worker", organizationId: admin.organizationId };
  const db = await getDb();
  expect(await workers(admin)).toEqual([result]);
  expect(
    await db.query(
      "SELECT organization_id,active FROM worker_profiles WHERE user_id=$1",
      [result.id],
    ),
  ).toEqual([{ organization_id: admin.organizationId, active: true }]);
  expect(
    await db.query(
      "SELECT actor_id FROM audit_events WHERE entity_id=$1 AND action='user.provisioned'",
      [result.id],
    ),
  ).toEqual([{ actor_id: admin.id }]);
  expect(
    await db.query('SELECT id FROM session WHERE "userId"=$1', [result.id]),
  ).toHaveLength(0);
  await expect(
    (await createAuth()).api.signInEmail({
      body: { email: result.email, password },
    }),
  ).resolves.toMatchObject({ user: { id: result.id } });
});

it("rejects worker access, role escalation, cross-organization input, invalid fields and duplicate email", async () => {
  const input = { name: "Another", email: "another@workers.test", password };
  await expect(createWorker(worker, input)).rejects.toMatchObject({
    status: 403,
  });
  for (const extra of [{ role: "admin" }, { organizationId: "foreign-org" }])
    await expect(createWorker(admin, { ...input, ...extra })).rejects.toThrow();
  for (const invalid of [
    { password: "short" },
    { name: " " },
    { email: "invalid" },
  ])
    await expect(
      createWorker(admin, { ...input, ...invalid }),
    ).rejects.toThrow();
  await expect(
    createWorker(admin, { ...input, email: "FIELD@workers.test" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await workers(admin)).toHaveLength(1);
  expect(
    await workers({ ...admin, organizationId: "foreign-org" }),
  ).toHaveLength(0);
});

it("allows assignments to the created worker and scopes the worker's visits", async () => {
  await importCsv(
    admin,
    "code,structure_code,city,latitude,longitude\nWORK-1,WORK-STRUCT,Baghdad,33.3,44.4",
    "workers.csv",
  );
  const [face] = await inventory(admin);
  await assign(admin, {
    faceIds: [face.id],
    workerId: worker.id,
    dueDate: "2026-12-01",
  });
  expect(await assignments(worker)).toMatchObject([
    { code: "WORK-1", worker_id: worker.id },
  ]);
  expect(
    await assignments({ ...worker, id: "unassigned-worker" }),
  ).toHaveLength(0);
});
