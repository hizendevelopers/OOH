import { getDb, closeDb } from "../apps/web/src/server/db";
import { migrate } from "./migrate";
import { provision } from "./provision";
import { importCsv, assign, inventory } from "../apps/web/src/server/service";
import type { Actor } from "../packages/domain/src";
async function seed() {
  if (process.env.NODE_ENV === "production")
    throw new Error("DEMO seeding is prohibited in production");
  const password = process.env.IBVS_DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set IBVS_DEMO_PASSWORD (12+ characters). No default passwords.",
    );
  await migrate();
  const db = await getDb();
  if (
    (await db.query("SELECT id FROM organizations WHERE id=$1", ["demo-iraq"]))
      .length
  )
    throw new Error(
      "DEMO organization already exists; seed will not overwrite data",
    );
  await db.query(
    "INSERT INTO organizations(id,name,is_demo) VALUES($1,$2,true)",
    ["demo-iraq", "DEMO • Iraq Operations"],
  );
  const admin = await provision({
    email: "admin@demo.ibvs.test",
    name: "DEMO Administrator",
    password,
    role: "admin",
    organizationId: "demo-iraq",
  });
  await provision({
    email: "reviewer2@demo.ibvs.test",
    name: "DEMO Second Supervisor",
    password,
    role: "admin",
    organizationId: "demo-iraq",
  });
  const worker = await provision({
    email: "worker@demo.ibvs.test",
    name: "DEMO Ali Hassan",
    password,
    role: "worker",
    organizationId: "demo-iraq",
  });
  await provision({
    email: "worker2@demo.ibvs.test",
    name: "DEMO Zainab Ahmed",
    password,
    role: "worker",
    organizationId: "demo-iraq",
  });
  const actor: Actor = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: "admin",
    organizationId: "demo-iraq",
  };
  await importCsv(
    actor,
    "code,structure_code,city,zone,latitude,longitude,uncertainty_m,orientation\nDEMO-BGD-001,DEMO-STR-001,Baghdad,Karrada,33.3102,44.4351,50,N\nDEMO-BGD-002,DEMO-STR-001,Baghdad,Karrada,33.3102,44.4351,50,S\nDEMO-BGD-003,DEMO-STR-002,Baghdad,Mansour,33.3204,44.3481,80,E\nDEMO-BSR-001,DEMO-STR-003,Basra,City center,30.5085,47.7804,50,unknown\nDEMO-EBL-001,DEMO-STR-004,Erbil,Ankawa,36.2311,44.0092,70,W\nDEMO-NJF-001,DEMO-STR-005,Najaf,City center,32.0045,44.3396,50,N",
    "DEMO fixture — not verified field data",
  );
  const faces = await inventory(actor);
  await assign(actor, {
    faceIds: faces.slice(0, 3).map((f) => f.id),
    workerId: worker.id,
    dueDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
  });
  console.log(
    "DEMO organization seeded. Admin: admin@demo.ibvs.test; workers: worker@demo.ibvs.test / worker2@demo.ibvs.test. Use the password you supplied. No evidence or verified baselines were created.",
  );
}
seed()
  .then(closeDb)
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
