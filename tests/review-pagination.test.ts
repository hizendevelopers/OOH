import { beforeAll, afterAll, it, expect } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { testDirectory } from "../scripts/test-directory";
import { migrate } from "../scripts/migrate";
import { getDb, closeDb } from "../apps/web/src/server/db";
import { reviewPage, reviewQueue } from "../apps/web/src/server/review";
import type { Actor } from "../packages/domain/src";

const admin: Actor = {
  id: "pagination-admin",
  organizationId: "pagination-org",
  role: "admin",
  name: "Test supervisor",
  email: "pagination@test.invalid",
};
const worker: Actor = { ...admin, id: "pagination-worker", role: "worker" };
const faces = Array.from({ length: 100 }, (_, n) => ({
  id: randomUUID(),
  structure: randomUUID(),
  code: `TEST-OFFLINE-CODE-${n}`,
  n,
}));
const rows = Array.from({ length: 525 }, (_, n) => ({
  id: randomUUID(),
  assignment: randomUUID(),
  operation: randomUUID(),
  receipt: randomUUID(),
  face: faces[n % faces.length].id,
  face_code: faces[n % faces.length].code,
  n,
}));
beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("review-pagination-");
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  await migrate();
  const db = await getDb();
  await db.query(
    "INSERT INTO organizations(id,name) VALUES('pagination-org','Test queue'),('pagination-foreign','Foreign')",
  );
  for (const user of [admin, worker]) {
    await db.query('INSERT INTO "user"(id,name,email) VALUES($1,$2,$3)', [
      user.id,
      user.name,
      user.email + user.id,
    ]);
    await db.query(
      "INSERT INTO organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",
      [admin.organizationId, user.id, user.role],
    );
  }
  await db.query(
    "INSERT INTO worker_profiles(user_id,organization_id) VALUES($1,$2)",
    [worker.id, admin.organizationId],
  );
  await db.query(
    `INSERT INTO billboard_structures(id,organization_id,code,city) SELECT structure,$2,'TEST-PILOT-'||n,'Baghdad' FROM jsonb_to_recordset($1::jsonb) AS x(structure text,n integer)`,
    [JSON.stringify(faces), admin.organizationId],
  );
  await db.query(
    `INSERT INTO billboard_faces(id,organization_id,structure_id,code) SELECT id,$2,structure,code FROM jsonb_to_recordset($1::jsonb) AS x(id text,structure text,code text)`,
    [JSON.stringify(faces), admin.organizationId],
  );
  // Historical tasks are approved so the fixture respects the one-active-face index.
  // Identical sub-millisecond receipt times exercise exact cursor boundaries.
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date,status) SELECT assignment,$2,face,$3,$4,'2026-12-01','approved' FROM jsonb_to_recordset($1::jsonb) AS x(assignment text,face text)`,
      [JSON.stringify(rows), admin.organizationId, worker.id, admin.id],
    );
    await tx.query(
      `INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata,status,receipt_id,received_at) SELECT id,$2,assignment,face,$3,operation,repeat('a',64),jsonb_build_object('faceCode',face_code,'note','offline is unrelated text','photos',jsonb_build_array(jsonb_build_object('kind','front','captureMode',CASE WHEN n%2=0 THEN 'offline' ELSE 'online_unchallenged' END),jsonb_build_object('kind','wide','captureMode','online_unchallenged'))),'server_received',receipt,'2026-10-17T00:00:00.123456Z'::timestamptz FROM jsonb_to_recordset($1::jsonb) AS x(id text,assignment text,operation text,receipt text,n integer,face text,face_code text)`,
      [JSON.stringify(rows), admin.organizationId, worker.id],
    );
    await tx.query(
      "INSERT INTO review_cases(inspection_id,organization_id,risk_level) SELECT id,$1,'medium' FROM inspections WHERE organization_id=$1",
      [admin.organizationId],
    );
  });
}, 60000);
afterAll(closeDb);

it("reaches cases beyond the legacy 500 limit without gaps or duplicates at equal microsecond timestamps", async () => {
  expect(await reviewQueue(admin)).toHaveLength(500);
  const seen: string[] = [];
  let cursor: string | null = null,
    pages = 0;
  do {
    const params = new URLSearchParams({ state: "pending", pageSize: "50" });
    if (cursor) params.set("cursor", cursor);
    const page = await reviewPage(admin, params);
    seen.push(...page.items.map((i) => i.id));
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 20);
  expect(pages).toBe(11);
  expect(new Set(seen).size).toBe(525);
  expect([...seen].sort()).toEqual(rows.map((r) => r.id).sort());
});
it("uses photo observations for mixed/offline classification rather than unrelated metadata and supports all filters", async () => {
  const online = await reviewQueue(
    admin,
    new URLSearchParams({ evidence: "online" }),
  );
  expect(online).toHaveLength(262);
  expect(online.every((i) => i.evidence_type === "online")).toBe(true);
  const offline = await reviewQueue(
    admin,
    new URLSearchParams({
      evidence: "offline",
      worker: worker.id,
      city: "Baghdad",
      date: "2026-10-17",
      billboard: "TEST-OFFLINE-CODE",
      risk: "medium",
      state: "pending",
    }),
  );
  expect(offline).toHaveLength(263);
  expect(offline.every((i) => i.evidence_type === "offline")).toBe(true);
  expect(
    await reviewQueue(admin, new URLSearchParams({ date: "2026-10-16" })),
  ).toHaveLength(0);
});
it("binds pagination to role, organization and filters and rejects malformed inputs", async () => {
  await expect(reviewPage(worker)).rejects.toThrow("Administrator");
  const first = await reviewPage(
    admin,
    new URLSearchParams({ state: "pending", pageSize: "10" }),
  );
  expect(first.nextCursor).toBeTruthy();
  await expect(
    reviewPage(
      { ...admin, organizationId: "pagination-foreign" },
      new URLSearchParams({ state: "pending", cursor: first.nextCursor! }),
    ),
  ).rejects.toThrow("organization or filters");
  await expect(
    reviewPage(
      admin,
      new URLSearchParams({ state: "approved", cursor: first.nextCursor! }),
    ),
  ).rejects.toThrow("organization or filters");
  const invalidFilters: Record<string, string>[] = [
    { cursor: "not-json" },
    { pageSize: "1000" },
    { date: "yesterday" },
    { evidence: "invented" },
    { risk: "invented" },
  ];
  for (const params of invalidFilters)
    await expect(
      reviewPage(admin, new URLSearchParams(params)),
    ).rejects.toThrow();
  expect(
    (await reviewPage({ ...admin, organizationId: "pagination-foreign" }))
      .items,
  ).toHaveLength(0);
});
it("keeps existing pages stable when a newer receipt is inserted", async () => {
  const first = await reviewPage(
    admin,
    new URLSearchParams({ pageSize: "100" }),
  );
  const newer = {
    id: randomUUID(),
    assignment: randomUUID(),
    operation: randomUUID(),
    receipt: randomUUID(),
  };
  const db = await getDb();
  const [source] = await db.query<{ face_id: string }>(
    "SELECT face_id FROM inspections WHERE id=$1",
    [rows[0].id],
  );
  await db.query(
    "INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date,status) VALUES($1,$2,$3,$4,$5,'2026-12-01','approved')",
    [
      newer.assignment,
      admin.organizationId,
      source.face_id,
      worker.id,
      admin.id,
    ],
  );
  await db.query(
    "INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata,status,receipt_id,received_at) VALUES($1,$2,$3,$4,$5,$6,repeat('b',64),'{}','server_received',$7,'2026-10-18T00:00:00Z')",
    [
      newer.id,
      admin.organizationId,
      newer.assignment,
      source.face_id,
      worker.id,
      newer.operation,
      newer.receipt,
    ],
  );
  await db.query(
    "INSERT INTO review_cases(inspection_id,organization_id) VALUES($1,$2)",
    [newer.id, admin.organizationId],
  );
  const next = await reviewPage(
    admin,
    new URLSearchParams({ pageSize: "100", cursor: first.nextCursor! }),
  );
  expect(next.items.some((i) => i.id === newer.id)).toBe(false);
  expect(
    next.items.some((i) => first.items.some((old) => old.id === i.id)),
  ).toBe(false);
});
it("records an aggregate local queue performance observation without claiming field latency", async () => {
  const timings: number[] = [];
  for (let n = 0; n < 15; n++) {
    const start = performance.now();
    expect(
      (await reviewPage(admin, new URLSearchParams({ pageSize: "100" }))).items,
    ).toHaveLength(100);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  const measurement = {
    measurement: "embedded_queue_100_synthetic_faces_526_cases_100_row_page",
    samples: timings.length,
    p50Ms: Math.round(timings[7] * 100) / 100,
    p95Ms: Math.round(timings[14] * 100) / 100,
    scope:
      "local embedded database; excludes network, photographs and real field workers",
    recordedAt: new Date().toISOString(),
  };
  await mkdir(path.resolve(".local/measurements"), { recursive: true });
  await writeFile(
    path.resolve(".local/measurements/review-queue.json"),
    JSON.stringify(measurement, null, 2),
  );
});
