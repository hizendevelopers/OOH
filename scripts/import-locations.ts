// Imports the Fizzion location spreadsheet and optionally assigns the imported locations to one worker.
// Dry run unless --apply is given. Safe to repeat: existing site IDs are skipped, never duplicated or overwritten.
//
// Usage (the administrator's database user ID and organization ID are required):
//   npx tsx scripts/import-locations.ts --file <csv> --org <organizationId> --admin <adminUserId>
//   npx tsx scripts/import-locations.ts ... --apply
//   npx tsx scripts/import-locations.ts ... --worker-id <workerUserId> --due-date 2026-12-31 [--apply]
//   Add --report <path.json> to save the full result.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { closeDb, getDb } from "../apps/web/src/server/db";
import { assignImportedLocations, importLocations, toCsv, unverifiedGpsReport } from "../apps/web/src/server/location-import";
import type { Actor } from "../packages/domain/src";

const option = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
  const file = option("--file");
  const organizationId = option("--org");
  const adminId = option("--admin");
  const workerId = option("--worker-id");
  const dueDate = option("--due-date");
  const expectEmail = option("--expect-email");
  const reportPath = option("--report");
  const gpsReportPath = option("--gps-report");
  const apply = process.argv.includes("--apply");
  if (!file || !organizationId || !adminId) throw new Error("Required: --file, --org and --admin");

  const db = await getDb();
  console.log(`Database: ${process.env.DATABASE_URL ? "configured PostgreSQL" : "local embedded database"}`);
  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  const [admin] = await db.query<{ id: string; name: string; email: string }>(
    `SELECT u.id,u.name,u.email FROM "user" u JOIN organization_members m ON m.user_id=u.id WHERE u.id=$1 AND m.organization_id=$2 AND m.role='admin'`,
    [adminId, organizationId],
  );
  if (!admin) throw new Error("Administrator not found in this organization");
  // Operator command line: direct database access, audited under the administrator account it acts for.
  const actor: Actor & { operatorCli: true } = { id: admin.id, organizationId, role: "admin", name: admin.name, email: admin.email, operatorCli: true };

  const text = await readFile(file, "utf8");
  const imported = await importLocations(actor, text, { apply, sourceFile: path.basename(file) });
  const counts = (outcome: string) => imported.report.filter((r) => r.outcome === outcome).length;
  console.log(`\nRows: ${imported.report.length}`);
  console.log(`Imported: ${counts("imported")}  Skipped (already imported): ${counts("skipped_existing")}  Conflicts (left unchanged): ${counts("conflict")}  Failed: ${counts("failed")}`);
  console.log("\nCity-wise counts");
  console.log("City | Total | Imported | Skipped | Conflicts | Failed | Verified GPS | Pending GPS");
  for (const [city, c] of Object.entries(imported.byCity).sort(([a], [b]) => a.localeCompare(b)))
    console.log(`${city} | ${c.total} | ${c.imported} | ${c.skipped_existing} | ${c.conflict} | ${c.failed} | ${c.verified_gps} | ${c.pending_gps}`);
  const failures = imported.report.filter((r) => r.outcome === "failed");
  if (failures.length) {
    console.log("\nFailed rows");
    for (const r of failures) console.log(`- row ${r.sourceRow} (${r.sourceSiteId || "no ID"}): ${r.reason}`);
  }

  if (gpsReportPath) {
    const rows = unverifiedGpsReport(text);
    await writeFile(gpsReportPath, toCsv(rows), "utf8");
    console.log(`
Unverified GPS report: ${rows.length} rows written to ${gpsReportPath}`);
  }

  let assignment: unknown = null;
  if (workerId) {
    if (!dueDate) throw new Error("--due-date is required with --worker-id");
    if (!expectEmail) throw new Error("--expect-email is required with --worker-id");
    assignment = await assignImportedLocations(actor, { workerId, expectedEmail: expectEmail, dueDate, apply });
    const a = assignment as { worker: { name: string; email: string; id: string }; wouldAssign: number; alreadyAssigned: number; assigned: number };
    console.log(`\nAssignment to ${a.worker.name} (${a.worker.id}): ${apply ? `assigned ${a.assigned}` : `would assign ${a.wouldAssign}`}; already assigned ${a.alreadyAssigned}`);
  }
  if (reportPath) {
    await writeFile(reportPath, JSON.stringify({ apply, imported, assignment }, null, 2), "utf8");
    console.log(`\nReport written to ${reportPath}`);
  }
}

if (process.argv[1]?.endsWith("import-locations.ts")) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
