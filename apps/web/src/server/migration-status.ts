import type { Database } from "./db";

// Every migration the running code depends on, in order. A test compares this list
// with db/migrations so a new migration file cannot ship without being listed here.
export const REQUIRED_MIGRATIONS = [
  "001_core.sql",
  "002_inspections.sql",
  "003_human_review.sql",
  "004_analysis_admission.sql",
  "005_review_queue_index.sql",
  "006_location_management.sql",
  "007_face_dimensions.sql",
  "008_advertiser_history.sql",
  "009_angle_photos.sql",
  "010_two_factor.sql",
  "011_location_import.sql",
  "012_security_hardening.sql",
  "013_app_role_grants.sql",
  "014_gallery_verification.sql",
  "015_site_registration.sql",
  "016_worker_addresses.sql",
  "017_evidence_objects.sql",
] as const;

export type MigrationStatus = {
  complete: boolean;
  requiredCount: number;
  appliedCount: number;
  latest: string | null;
  missing: string[];
};

// Reads the recorded history and reports which required migrations are absent.
// Latest is the newest recorded name in the required order, not the newest row.
export async function migrationStatus(db: Pick<Database, "query">): Promise<MigrationStatus> {
  const rows = await db.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const missing = REQUIRED_MIGRATIONS.filter((name) => !applied.has(name));
  const recorded = REQUIRED_MIGRATIONS.filter((name) => applied.has(name));
  return {
    complete: missing.length === 0,
    requiredCount: REQUIRED_MIGRATIONS.length,
    appliedCount: recorded.length,
    latest: recorded.length ? recorded[recorded.length - 1] : null,
    missing: [...missing],
  };
}

// Public response: no database name, migration names or counts.
export function publicHealth(status: MigrationStatus) {
  return status.complete
    ? { httpStatus: 200, body: { status: "ok" } }
    : { httpStatus: 503, body: { status: "unavailable" } };
}
