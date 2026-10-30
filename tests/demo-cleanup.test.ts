import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getDb, closeDb } from "../apps/web/src/server/db";
import { migrate } from "../scripts/migrate";
import { bootstrapWorkspace } from "../scripts/bootstrap-workspace";
import { removeDemoData } from "../scripts/remove-demo-data";
import { testDirectory } from "../scripts/test-directory";

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  process.env.IBVS_LOCAL_DB = await testDirectory("demo-cleanup-");
  await migrate();
});
afterAll(closeDb);

it("creates an empty real workspace with an internal actor and no password account", async () => {
  const db = await getDb();
  await bootstrapWorkspace(db);
  await bootstrapWorkspace(db);
  expect(
    await db.query("SELECT id FROM organizations WHERE is_demo=false"),
  ).toHaveLength(1);
  expect(await db.query("SELECT id FROM billboard_faces")).toHaveLength(0);
  expect(await db.query("SELECT id FROM account")).toHaveLength(0);
});
it("refuses to delete non-fixture records in a demo organization", async () => {
  const db = await getDb();
  await db.query(
    "INSERT INTO organizations(id,name,is_demo) VALUES('demo-iraq','DEMO',true)",
  );
  await db.query(
    "INSERT INTO \"user\"(id,name,email) VALUES('demo-user','DEMO','admin@demo.ibvs.test')",
  );
  await db.query(
    "INSERT INTO organization_members VALUES('demo-iraq','demo-user','admin')",
  );
  await db.query(
    "INSERT INTO billboard_structures(id,organization_id,code,city) VALUES('demo-structure','demo-iraq','DEMO-STR-001','Baghdad')",
  );
  await db.query(
    "INSERT INTO billboard_faces(id,organization_id,structure_id,code) VALUES('nonfixture','demo-iraq','demo-structure','REAL-001')",
  );
  await expect(removeDemoData(db)).rejects.toThrow("outside the verified seed");
  expect(
    await db.query("SELECT id FROM organizations WHERE id='demo-iraq'"),
  ).toHaveLength(1);
  await db.query("DELETE FROM billboard_faces WHERE id='nonfixture'");
});
it("removes only the original seed, preserves the real workspace and restores immutable triggers", async () => {
  const db = await getDb();
  await db.query(
    "INSERT INTO billboard_faces(id,organization_id,structure_id,code) VALUES('demo-face','demo-iraq','demo-structure','DEMO-BGD-001')",
  );
  await db.query(
    "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES('demo-source','demo-face',33.3102,44.4351,50,'DEMO fixture — not verified field data','demo-user')",
  );
  const backup = vi.fn(async () => {});
  await expect(removeDemoData(db, backup)).resolves.toMatchObject({
    removed: true,
    faces: 1,
    users: 1,
  });
  expect(backup).toHaveBeenCalledOnce();
  expect(
    await db.query("SELECT id FROM organizations WHERE is_demo=false"),
  ).toHaveLength(1);
  expect(
    await db.query("SELECT id FROM organizations WHERE is_demo=true"),
  ).toHaveLength(0);
  expect(await db.query("SELECT id FROM billboard_faces")).toHaveLength(0);
  expect(
    await db.query(
      "SELECT tgname FROM pg_trigger WHERE tgname IN ('source_immutable','audit_immutable') AND tgenabled='O'",
    ),
  ).toHaveLength(2);
  await expect(removeDemoData(db)).resolves.toMatchObject({ removed: false });
});
