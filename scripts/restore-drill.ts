import { PGlite } from "@electric-sql/pglite";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { testDirectory } from "./test-directory";
import { reconcileEvidence } from "./evidence-integrity";
import type { Database } from "../apps/web/src/server/db";

const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const adapter = (pg: PGlite): Database => ({
  async query<T>(sql: string, params: unknown[] = []) {
    return (await pg.query(sql, params)).rows as T[];
  },
  async transaction() {
    throw new Error("Not used in isolated restore verification");
  },
});
async function fingerprint(pg: PGlite) {
  const tables = (
    await pg.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  const counts: Record<string, number> = {};
  const content: Record<string, string> = {};
  for (const { tablename } of tables) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = (
      await pg.query(`SELECT row_to_json(t)::text value FROM ${quoted} t`)
    ).rows as { value: string }[];
    counts[tablename] = rows.length;
    content[tablename] = hash(
      JSON.stringify(rows.map((row) => row.value).sort()),
    );
  }
  const schema = (
    await pg.query<{
      value: string;
    }>(`SELECT 'column:'||table_name||':'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') value FROM information_schema.columns WHERE table_schema='public'
    UNION ALL SELECT 'index:'||indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'constraint:'||c.relname||':'||pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'trigger:'||pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT 'function:'||pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'`)
  ).rows;
  return {
    counts,
    content,
    schemaHash: hash(JSON.stringify(schema.map((row) => row.value).sort())),
  };
}

/** Generated fixtures only: no caller-supplied source/destination, environment DB, or user evidence. */
export async function restoreDrill() {
  const started = performance.now();
  const directory = await testDirectory("restore-drill-");
  const source = new PGlite(path.join(directory, "fixture-source"));
  let restored: PGlite | undefined;
  const mediaKeys: string[] = [];
  try {
    await source.waitReady;
    await source.exec(
      "CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const name of (await readdir(path.resolve("db/migrations")))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      await source.exec(
        await readFile(path.resolve("db/migrations", name), "utf8"),
      );
      await source.query("INSERT INTO schema_migrations(name) VALUES($1)", [
        name,
      ]);
    }
    await source.exec(
      `INSERT INTO organizations(id,name) VALUES('drill-org','Generated fixture'); INSERT INTO "user"(id,name,email) VALUES('drill-admin','Fixture','fixture@example.invalid'),('drill-worker','Fixture','worker@example.invalid'); INSERT INTO organization_members VALUES('drill-org','drill-admin','admin'),('drill-org','drill-worker','worker'); INSERT INTO worker_profiles(user_id,organization_id) VALUES('drill-worker','drill-org'); INSERT INTO billboard_structures(id,organization_id,code,city) VALUES('drill-structure','drill-org','FIXTURE','Fixture'); INSERT INTO billboard_faces(id,organization_id,structure_id,code) VALUES('drill-face','drill-org','drill-structure','FIXTURE'); INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES('drill-coordinate','drill-face',33,44,50,'Generated fixture','drill-admin'); INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date,status) VALUES('drill-task','drill-org','drill-face','drill-worker','drill-admin','2026-10-17','server_received')`,
    );
    const inspectionId = randomUUID();
    await source.query(
      `INSERT INTO inspections(id,organization_id,assignment_id,face_id,worker_id,operation_id,payload_hash,metadata,status,receipt_id,received_at) VALUES($1,'drill-org','drill-task','drill-face','drill-worker',$2,$3,'{}','server_received',$4,now())`,
      [inspectionId, randomUUID(), hash("fixture"), randomUUID()],
    );
    for (const kind of ["front", "wide"] as const) {
      const bytes = await sharp({
        create: {
          width: 640,
          height: 480,
          channels: 3,
          background: kind === "front" ? "#123456" : "#654321",
        },
      })
        .jpeg()
        .toBuffer();
      const digest = hash(bytes),
        mediaId = randomUUID();
      const original = `${inspectionId}/${kind}/original-${digest}`,
        part = `${inspectionId}/${kind}/0-${digest}`;
      for (const key of [original, part]) {
        const file = path.join(directory, "source-evidence", ...key.split("/"));
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
        mediaKeys.push(key);
      }
      await source.query(
        `INSERT INTO media_evidence(id,inspection_id,kind,expected_bytes,expected_hash,server_hash,object_key,width,height,receipt_id,received_at) VALUES($1,$2,$3,$4,$5,$5,$6,640,480,$7,now())`,
        [
          mediaId,
          inspectionId,
          kind,
          bytes.length,
          digest,
          original,
          randomUUID(),
        ],
      );
      await source.query(
        "INSERT INTO evidence_parts(media_id,part,hash,bytes,object_key) VALUES($1,0,$2,$3,$4)",
        [mediaId, digest, bytes.length, part],
      );
    }
    await source.query(
      `INSERT INTO review_cases(inspection_id,organization_id) VALUES($1,'drill-org')`,
      [inspectionId],
    );
    await source.query(
      `INSERT INTO audit_events(id,organization_id,actor_id,action,entity_id,detail) VALUES($1,'drill-org','drill-admin','restore_fixture',$2,'{"generated":true}')`,
      [randomUUID(), inspectionId],
    );
    const assessmentId = randomUUID(),
      baselineId = randomUUID(),
      assessmentHash = hash("generated-risk-report");
    await source.query(
      `INSERT INTO verification_runs(id,organization_id,inspection_id,rule_version,assessment_hash,report) VALUES($1,'drill-org',$2,'fixture-only',$3,'{"generated":true}')`,
      [assessmentId, inspectionId, assessmentHash],
    );
    await source.query(
      `UPDATE review_cases SET state='approved',assessment_id=$1 WHERE inspection_id=$2`,
      [assessmentId, inspectionId],
    );
    await source.query(
      `INSERT INTO review_decisions(id,inspection_id,organization_id,actor_id,operation_id,payload_hash,version,epoch,action,reason,assessment_hash,identity_confirmed,result) VALUES($1,$2,'drill-org','drill-admin',$3,$4,2,1,'approve','Generated fixture only',$5,true,'{"generated":true}')`,
      [
        randomUUID(),
        inspectionId,
        randomUUID(),
        hash("fixture-decision"),
        assessmentHash,
      ],
    );
    await source.query(
      `INSERT INTO reference_baselines(id,organization_id,face_id,inspection_id,version,structure_details,actor_id,assessment_hash,operation_id,payload_hash) VALUES($1,'drill-org','drill-face',$2,1,'{"generated":true}','drill-admin',$3,$4,$5)`,
      [
        baselineId,
        inspectionId,
        assessmentHash,
        randomUUID(),
        hash("fixture-baseline"),
      ],
    );
    await source.query(
      `INSERT INTO reference_photos(baseline_id,media_id,kind,original_hash) SELECT $1,id,kind,server_hash FROM media_evidence WHERE inspection_id=$2`,
      [baselineId, inspectionId],
    );
    await source.query(
      `INSERT INTO baseline_events(id,baseline_id,organization_id,actor_id,action,reason,operation_id,payload_hash) VALUES($1,$2,'drill-org','drill-admin','withdraw','Generated withdrawal fixture',$3,$4)`,
      [randomUUID(), baselineId, randomUUID(), hash("fixture-withdrawal")],
    );
    const before = await fingerprint(source);
    const snapshot = await source.dumpDataDir("none");
    const snapshotBytes = Buffer.from(await snapshot.arrayBuffer());
    await writeFile(
      path.join(directory, "fixture-snapshot.tar"),
      snapshotBytes,
      { flag: "wx", mode: 0o600 },
    );
    await source.close();
    // Restore persisted snapshot bytes, rather than the original in-memory object.
    const persisted = await readFile(
      path.join(directory, "fixture-snapshot.tar"),
    );
    if (hash(persisted) !== hash(snapshotBytes))
      throw new Error("Snapshot digest mismatch");
    restored = new PGlite({
      dataDir: path.join(directory, "isolated-restore"),
      loadDataDir: new Blob([new Uint8Array(persisted)]),
    });
    await restored.waitReady;
    for (const key of mediaKeys) {
      const target = path.join(
        directory,
        "restored-evidence",
        ...key.split("/"),
      );
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(
        target,
        await readFile(
          path.join(directory, "source-evidence", ...key.split("/")),
        ),
        { flag: "wx", mode: 0o600 },
      );
    }
    const after = await fingerprint(restored);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Restored schema/content mismatch");
    await restored.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const integrity = await reconcileEvidence(adapter(restored), (key) =>
      readFile(path.join(directory, "restored-evidence", ...key.split("/"))),
    );
    await restored.exec("COMMIT");
    if (!integrity.ok)
      throw new Error("Restored evidence failed reconciliation");
    let immutable = false;
    try {
      await restored.query("UPDATE audit_events SET action='changed'");
    } catch {
      immutable = true;
    }
    if (!immutable) throw new Error("Restored audit trigger failed");
    return {
      ok: true,
      scope: "generated-isolated-pglite-fixtures",
      tablesVerified: Object.keys(after.counts).length,
      rowsVerified: Object.values(after.counts).reduce(
        (sum, count) => sum + count,
        0,
      ),
      schemaVerified: true,
      auditMutationDenied: true,
      snapshotHash: hash(persisted),
      integrity,
      elapsedMs: Math.round(performance.now() - started),
    };
  } finally {
    if (!source.closed) await source.close();
    if (restored && !restored.closed) await restored.close();
  }
}

if (process.argv[1]?.endsWith("restore-drill.ts")) {
  try {
    console.log(JSON.stringify(await restoreDrill()));
  } catch {
    console.error(
      "Isolated fixture restore drill failed; user database/evidence were not opened or modified.",
    );
    process.exitCode = 1;
  }
}
