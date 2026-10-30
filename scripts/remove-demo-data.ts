import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb, root, type Database } from "../apps/web/src/server/db";

const demoEmails = [
  "admin@demo.ibvs.test",
  "reviewer2@demo.ibvs.test",
  "worker@demo.ibvs.test",
  "worker2@demo.ibvs.test",
];
const demoCodes = [
  "DEMO-BGD-001",
  "DEMO-BGD-002",
  "DEMO-BGD-003",
  "DEMO-BSR-001",
  "DEMO-EBL-001",
  "DEMO-NJF-001",
];
type Snapshot = Record<string, Record<string, unknown>[]>;

// Deliberately limited to the repository's original seed. Refuse mixed real/demo
// data and any captured evidence rather than relaxing retention protections.
export async function removeDemoData(
  db: Database,
  save?: (data: Snapshot) => Promise<void>,
) {
  return db.transaction(async (tx) => {
    const organizations = await tx.query<{ id: string; is_demo: boolean }>(
      "SELECT * FROM organizations WHERE id='demo-iraq' FOR UPDATE",
    );
    if (!organizations.length)
      return { removed: false, faces: 0, assignments: 0, users: 0 };
    if (!organizations[0].is_demo)
      throw new Error("Cleanup refused: organization is not marked as demo");
    const snapshot: Snapshot = { organizations };
    for (const table of [
      "billboard_structures",
      "billboard_faces",
      "organization_members",
      "worker_profiles",
      "assignments",
      "audit_events",
      "activity_logs",
      "inspections",
      "challenges",
      "analysis_admissions",
    ]) {
      snapshot[table] = await tx.query(
        `SELECT * FROM ${table} WHERE organization_id=$1`,
        ["demo-iraq"],
      );
    }
    snapshot.user = await tx.query(
      'SELECT id,name,email,"emailVerified","createdAt","updatedAt",image FROM "user" WHERE id IN (SELECT user_id FROM organization_members WHERE organization_id=$1)',
      ["demo-iraq"],
    );
    snapshot.source_coordinates = await tx.query(
      "SELECT * FROM source_coordinates WHERE face_id IN (SELECT id FROM billboard_faces WHERE organization_id=$1)",
      ["demo-iraq"],
    );
    if (
      snapshot.inspections.length ||
      snapshot.challenges.length ||
      snapshot.activity_logs.length ||
      snapshot.analysis_admissions.length
    )
      throw new Error(
        "Cleanup refused: demo workspace contains activity beyond the original seed",
      );
    if (
      snapshot.user.some((user) => !demoEmails.includes(String(user.email))) ||
      snapshot.billboard_faces.some(
        (face) => !demoCodes.includes(String(face.code)),
      ) ||
      snapshot.billboard_structures.some(
        (structure) => !/^DEMO-STR-00[1-5]$/.test(String(structure.code)),
      ) ||
      snapshot.source_coordinates.some(
        (source) =>
          source.source_name !== "DEMO fixture — not verified field data",
      ) ||
      snapshot.assignments.some(
        (assignment) =>
          assignment.status !== "assigned" ||
          assignment.parent_inspection_id !== null,
      ) ||
      snapshot.audit_events.some(
        (event) =>
          ![
            "user.provisioned",
            "inventory.import",
            "assignment.create",
          ].includes(String(event.action)),
      )
    )
      throw new Error(
        "Cleanup refused: demo workspace contains records outside the verified seed",
      );
    if (save) await save(snapshot);
    await tx.query(
      "ALTER TABLE source_coordinates DISABLE TRIGGER source_immutable",
    );
    await tx.query("ALTER TABLE audit_events DISABLE TRIGGER audit_immutable");
    await tx.query("DELETE FROM assignments WHERE organization_id=$1", [
      "demo-iraq",
    ]);
    await tx.query(
      "DELETE FROM source_coordinates WHERE face_id IN (SELECT id FROM billboard_faces WHERE organization_id=$1)",
      ["demo-iraq"],
    );
    await tx.query("DELETE FROM billboard_faces WHERE organization_id=$1", [
      "demo-iraq",
    ]);
    await tx.query(
      "DELETE FROM billboard_structures WHERE organization_id=$1",
      ["demo-iraq"],
    );
    await tx.query("DELETE FROM audit_events WHERE organization_id=$1", [
      "demo-iraq",
    ]);
    await tx.query("DELETE FROM worker_profiles WHERE organization_id=$1", [
      "demo-iraq",
    ]);
    await tx.query(
      "DELETE FROM organization_members WHERE organization_id=$1",
      ["demo-iraq"],
    );
    for (const user of snapshot.user)
      await tx.query('DELETE FROM "user" WHERE id=$1', [user.id]);
    await tx.query("DELETE FROM organizations WHERE id=$1", ["demo-iraq"]);
    await tx.query(
      "ALTER TABLE source_coordinates ENABLE TRIGGER source_immutable",
    );
    await tx.query("ALTER TABLE audit_events ENABLE TRIGGER audit_immutable");
    return {
      removed: true,
      faces: snapshot.billboard_faces.length,
      assignments: snapshot.assignments.length,
      users: snapshot.user.length,
    };
  });
}

if (process.argv[1]?.endsWith("remove-demo-data.ts")) {
  if (process.argv.includes("--local")) {
    delete process.env.DATABASE_URL;
    process.env.DATABASE_SCHEMA = "public";
    process.env.IBVS_LOCAL_DB = path.join(root(), ".local", "postgres");
  }
  try {
    const result = await removeDemoData(await getDb(), async (snapshot) => {
      const directory = path.join(root(), ".local", "backups");
      await mkdir(directory, { recursive: true });
      const backup = path.join(directory, `removed-demo-${Date.now()}.json`);
      await writeFile(backup, JSON.stringify(snapshot, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
      console.log(
        "Saved a private seed-data snapshot (no passwords or session tokens).",
      );
    });
    console.log(JSON.stringify(result));
  } finally {
    await closeDb();
  }
}
