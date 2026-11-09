import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { code, dimensionFields, type Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { insertRecordedDimension } from "./dimension-storage";
import { ApiError, audit, requireAdmin } from "./service";
import { requireAccess, type ServerActor } from "./mfa-gate";
import { decidePromotion, promotionMaxAccuracyM } from "./gps-promotion";

// Import of the Fizzion site spreadsheet. Rules:
// - Idempotent: the unique site ID per organization decides what already exists. Existing rows are never changed.
// - Missing or invalid coordinates are never invented. Such rows become pending_gps.
// - Coordinates are verified only when the file says Supplied, they fall inside Iraq, and no coordinate issue is noted.
// - Missing dimensions become pending_measurement. Nothing is fabricated.
// - Original city labels are kept. Two unclear labels get explicit categories, as agreed by the administrator.

// A real calendar date: 2026-02-31 is refused.
export const isoCalendarDate = z
  .string()
  .refine(
    (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
    "Enter a real date in YYYY-MM-DD form",
  );

export const IMPORT_SOURCE_FILE ="Fizzion_Sites_Upload.csv";
// Same default uncertainty the existing CSV import uses (faceInput). It is a system default, not a measurement.
export const IMPORTED_UNCERTAINTY_M = 50;
export const IMPORT_DIMENSION_NOTE = "Supplied in Fizzion_Sites_Upload.csv; not independently measured";
const IRAQ = { minLat: 29, maxLat: 37.5, minLon: 38.5, maxLon: 48.8 };

export const CITY_RULES: Record<string, { city: string; status: "unspecified" | "pending_verification" }> = {
  "Anbar (city not stated)": { city: "Unspecified City, Anbar", status: "unspecified" },
  "Kura (as listed)": { city: "Kura (as listed)", status: "pending_verification" },
};

export type GpsStatus = "verified" | "approximate" | "to_correct" | "pending_gps";
export type ClassifiedRow =
  | { outcome: "failed"; sourceSiteId: string; sourceRow: number; reason: string }
  | {
      outcome: "ready";
      sourceSiteId: string;
      sourceRow: number;
      cityLabel: string;
      city: string;
      cityStatus: "confirmed" | "unspecified" | "pending_verification";
      description: string;
      gpsStatus: GpsStatus;
      gpsReason: string;
      referenceLatitude: number | null;
      referenceLongitude: number | null;
      needsReview: boolean;
      openIssues: string;
      dimensionStatus: "recorded" | "pending_measurement";
      width_m?: number;
      height_m?: number;
      sourceFields: Record<string, string>;
    };

export type ImportOutcome = "imported" | "skipped_existing" | "conflict" | "failed";
export type ImportReportRow = {
  sourceSiteId: string;
  sourceRow: number;
  city: string;
  outcome: ImportOutcome;
  gpsStatus?: GpsStatus;
  gpsReason?: string;
  reason?: string;
};

// Blank returns null; a non-numeric value returns NaN so it can be reported as invalid.
const number = (value: string | undefined) => {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
};
const inIraq = (lat: number, lon: number) =>
  lat >= IRAQ.minLat && lat <= IRAQ.maxLat && lon >= IRAQ.minLon && lon <= IRAQ.maxLon;

export function parseLocationCsv(text: string) {
  const records = parse(text, {
    columns: (headers: string[]) => {
      if (new Set(headers).size !== headers.length) throw new ApiError(422, "Duplicate CSV headers");
      return headers;
    },
    bom: true,
    skip_empty_lines: true,
    trim: true,
    max_record_size: 65536,
  }) as Record<string, string>[];
  if (!records.length) throw new ApiError(422, "The CSV has no data rows");
  return records;
}

// Pure classification with no database access, so it can be tested directly.
export function classifyLocationRow(record: Record<string, string>, index: number): ClassifiedRow {
  const sourceSiteId = (record.fizzion_site_id ?? "").trim();
  const sourceRow = Number(record.source_row) > 0 ? Number(record.source_row) : index + 2;
  const fail = (reason: string): ClassifiedRow => ({ outcome: "failed", sourceSiteId, sourceRow, reason });
  if (!code.safeParse(sourceSiteId).success) return fail("Site ID is missing or not in the expected format");
  const cityLabel = (record.city ?? "").trim();
  if (!cityLabel) return fail("City is missing");
  const rule = CITY_RULES[cityLabel];
  const city = rule ? rule.city : cityLabel;
  const cityStatus = rule ? rule.status : "confirmed";
  const issues: string[] = [];
  const openIssues = (record.open_issues ?? "").trim();
  if (openIssues) issues.push(openIssues);

  const latRaw = number(record.latitude);
  const lonRaw = number(record.longitude);
  let gpsStatus: GpsStatus;
  let referenceLatitude: number | null = null;
  let referenceLongitude: number | null = null;
  // Plain-language reason for every coordinate that is not verified. Written to the GPS report.
  let gpsReason = "";
  if (latRaw === null && lonRaw === null) {
    gpsStatus = "pending_gps";
    gpsReason = "No coordinates in the source file (pin to be taken on the first visit)";
  } else if (latRaw === null || lonRaw === null || Number.isNaN(latRaw) || Number.isNaN(lonRaw)) {
    gpsStatus = "pending_gps";
    gpsReason = "Source coordinates were incomplete or not numbers; not used";
    issues.push("Source coordinates were incomplete or invalid and were not used.");
  } else {
    referenceLatitude = latRaw;
    referenceLongitude = lonRaw;
    const fileStatus = (record.gps_status ?? "").trim();
    // Any note about coordinates means the supplied pin is not verified, even when the status says Supplied.
    const coordinateIssue = /coordinat|copied|shared|gps not provided|far from|outside iraq/i.test(openIssues);
    if (fileStatus === "Supplied" && inIraq(latRaw, lonRaw) && !coordinateIssue) {
      gpsStatus = "verified";
    } else if (fileStatus.startsWith("Approximate")) {
      gpsStatus = "approximate";
      gpsReason = "Source status is Approximate; not verified until supervisor review";
    } else {
      gpsStatus = "to_correct";
      if (fileStatus === "Supplied") {
        gpsReason = !inIraq(latRaw, lonRaw)
          ? "Source status is Supplied, but the coordinates fall outside Iraq"
          : "Source status is Supplied, but the source note questions the coordinates: " + openIssues;
        issues.push("Supplied coordinates conflict with the location and need correction.");
      } else {
        gpsReason = "Source status is " + (fileStatus || "blank") + "; coordinates need correction";
      }
    }
  }
  if (gpsStatus === "pending_gps") {
    referenceLatitude = null;
    referenceLongitude = null;
  }

  const reviewValue = (record.needs_review ?? "").trim();
  if (reviewValue !== "Yes" && reviewValue !== "No" && reviewValue !== "")
    issues.push(`needs_review value not recognised: ${reviewValue}`);
  // Blank and "No" mean no review. "Yes" and any unrecognised value mean review, so nothing is dropped silently.
  const needsReview = reviewValue !== "" && reviewValue !== "No";

  const width = number(record.width_m);
  const height = number(record.height_m);
  let dimensionStatus: "recorded" | "pending_measurement" = "pending_measurement";
  let width_m: number | undefined;
  let height_m: number | undefined;
  if (width !== null && height !== null && !Number.isNaN(width) && !Number.isNaN(height)) {
    const parsed = dimensionFields.safeParse({
      width_m: String(width),
      height_m: String(height),
      dimension_status: "unverified",
      dimension_source: IMPORT_DIMENSION_NOTE,
    });
    if (parsed.success) {
      dimensionStatus = "recorded";
      width_m = width;
      height_m = height;
    }
  }

  return {
    outcome: "ready",
    sourceSiteId,
    sourceRow,
    cityLabel,
    city,
    cityStatus,
    description: (record.location_en ?? "").trim().slice(0, 1000),
    gpsStatus,
    gpsReason,
    referenceLatitude,
    referenceLongitude,
    needsReview,
    openIssues: issues.join(" ").slice(0, 2000),
    dimensionStatus,
    width_m,
    height_m,
    sourceFields: { ...record },
  };
}

export function classifyLocationCsv(text: string): ClassifiedRow[] {
  const seen = new Map<string, number>();
  return parseLocationCsv(text).map((record, index) => {
    const row = classifyLocationRow(record, index);
    if (row.outcome === "failed") return row;
    const first = seen.get(row.sourceSiteId);
    if (first !== undefined)
      return {
        outcome: "failed" as const,
        sourceSiteId: row.sourceSiteId,
        sourceRow: row.sourceRow,
        reason: `Duplicate site ID in this file (first at row ${first})`,
      };
    seen.set(row.sourceSiteId, row.sourceRow);
    return row;
  });
}

export function summarize(rows: ImportReportRow[]) {
  const byCity: Record<string, { total: number; imported: number; skipped_existing: number; conflict: number; failed: number; pending_gps: number; verified_gps: number }> = {};
  for (const row of rows) {
    const city = (byCity[row.city || "(no city)"] ??= { total: 0, imported: 0, skipped_existing: 0, conflict: 0, failed: 0, pending_gps: 0, verified_gps: 0 });
    city.total++;
    city[row.outcome]++;
    if (row.gpsStatus === "pending_gps") city.pending_gps++;
    if (row.gpsStatus === "verified") city.verified_gps++;
  }
  return byCity;
}

type ExistingRecord = {
  city_label: string;
  gps_status: string;
  dimension_status: string;
  reference_latitude: number | null;
  reference_longitude: number | null;
  needs_review: boolean;
};

// Dry run by default: apply=false classifies and checks existing rows but writes nothing.
// Each new row runs in its own transaction, so one failing row never blocks the others.
export async function importLocations(actor: Actor, text: string, options: { apply: boolean; sourceFile?: string }) {
  requireAdmin(actor);
  requireAccess(actor, options.apply ? "sensitive" : "ordinary");
  const sourceFile = options.sourceFile ?? IMPORT_SOURCE_FILE;
  const rows = classifyLocationCsv(text);
  const db = await getDb();
  const report: ImportReportRow[] = [];
  for (const row of rows) {
    if (row.outcome === "failed") {
      report.push({ sourceSiteId: row.sourceSiteId, sourceRow: row.sourceRow, city: "", outcome: "failed", reason: row.reason });
      continue;
    }
    const base = { sourceSiteId: row.sourceSiteId, sourceRow: row.sourceRow, city: row.city, gpsStatus: row.gpsStatus, gpsReason: row.gpsReason };
    const [existing] = await db.query<ExistingRecord>(
      "SELECT city_label,gps_status,dimension_status,reference_latitude,reference_longitude,needs_review FROM location_import_records WHERE organization_id=$1 AND source_site_id=$2",
      [actor.organizationId, row.sourceSiteId],
    );
    if (existing) {
      const same =
        existing.city_label === row.cityLabel &&
        existing.gps_status === row.gpsStatus &&
        existing.dimension_status === row.dimensionStatus &&
        existing.reference_latitude === row.referenceLatitude &&
        existing.reference_longitude === row.referenceLongitude &&
        existing.needs_review === row.needsReview;
      report.push({
        ...base,
        outcome: same ? "skipped_existing" : "conflict",
        reason: same ? "Already imported" : "Already imported with different source values; left unchanged",
      });
      continue;
    }
    if (!options.apply) {
      report.push({ ...base, outcome: "imported", reason: "Dry run: would import" });
      continue;
    }
    try {
      await db.transaction(async (tx) => {
        await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [actor.organizationId]);
        const [clash] = await tx.query<{ id: string }>(
          "SELECT id FROM billboard_structures WHERE organization_id=$1 AND code=$2",
          [actor.organizationId, row.sourceSiteId],
        );
        const [faceClash] = await tx.query<{ id: string }>(
          "SELECT id FROM billboard_faces WHERE organization_id=$1 AND code=$2",
          [actor.organizationId, row.sourceSiteId],
        );
        if (clash || faceClash) throw new ApiError(409, "A location with this site ID already exists outside the import");
        const structureId = randomUUID();
        await tx.query(
          "INSERT INTO billboard_structures(id,organization_id,code,city,zone) VALUES($1,$2,$3,$4,$5)",
          [structureId, actor.organizationId, row.sourceSiteId, row.city, ""],
        );
        const faceId = randomUUID();
        await tx.query(
          "INSERT INTO billboard_faces(id,organization_id,structure_id,code,orientation,description,is_test) VALUES($1,$2,$3,$4,'unknown',$5,false)",
          [faceId, actor.organizationId, structureId, row.sourceSiteId, row.description],
        );
        if (row.gpsStatus === "verified")
          await tx.query(
            "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [randomUUID(), faceId, row.referenceLatitude, row.referenceLongitude, IMPORTED_UNCERTAINTY_M, sourceFile, actor.id],
          );
        if (row.dimensionStatus === "recorded")
          await insertRecordedDimension(tx, {
            organizationId: actor.organizationId,
            faceId,
            recordedBy: actor.id,
            dimensions: { width_m: row.width_m, height_m: row.height_m, dimension_status: "unverified", dimension_source: IMPORT_DIMENSION_NOTE },
          });
        await tx.query(
          "INSERT INTO location_import_records(face_id,organization_id,source_site_id,source_file,source_row,city_label,city_status,gps_status,reference_latitude,reference_longitude,needs_review,open_issues,dimension_status,source_fields) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
          [
            faceId,
            actor.organizationId,
            row.sourceSiteId,
            sourceFile,
            row.sourceRow,
            row.cityLabel,
            row.cityStatus,
            row.gpsStatus,
            row.referenceLatitude,
            row.referenceLongitude,
            row.needsReview,
            row.openIssues,
            row.dimensionStatus,
            JSON.stringify(row.sourceFields),
          ],
        );
      });
      report.push({ ...base, outcome: "imported" });
    } catch (error) {
      report.push({
        ...base,
        outcome: "failed",
        reason: error instanceof ApiError ? error.message : "Could not write this row",
      });
    }
  }
  if (options.apply)
    await audit(db, actor, "locations.import", actor.organizationId, {
      sourceFile,
      imported: report.filter((r) => r.outcome === "imported").length,
      skipped: report.filter((r) => r.outcome === "skipped_existing" || r.outcome === "conflict").length,
      failed: report.filter((r) => r.outcome === "failed").length,
    });
  return { apply: options.apply, report, byCity: summarize(report) };
}

// Assigns imported locations to one worker, identified by database user ID.
// Locations with an active assignment are left as they are. Dry run by default.
export async function assignImportedLocations(
  actor: Actor,
  input: { workerId: string; expectedEmail: string; dueDate: string; apply: boolean },
) {
  requireAdmin(actor);
  requireAccess(actor, input.apply ? "sensitive" : "ordinary");
  const data = z
    .object({
      workerId: z.string().min(1).max(100),
      // Confirms the account is the intended person, so a mistyped or copied ID is refused.
      expectedEmail: z.string().trim().email().max(254),
      dueDate: isoCalendarDate,
      apply: z.boolean(),
    })
    .parse(input);
  const db = await getDb();
  const [worker] = await db.query<{ id: string; name: string; email: string }>(
    `SELECT u.id,u.name,u.email FROM "user" u JOIN organization_members m ON m.user_id=u.id AND m.organization_id=$1 AND m.role='worker' JOIN worker_profiles p ON p.user_id=u.id AND p.organization_id=$1 AND p.active=true WHERE u.id=$2`,
    [actor.organizationId, data.workerId],
  );
  if (!worker) throw new ApiError(404, "No active worker with this database ID in this organization");
  if (worker.email.toLowerCase() !== data.expectedEmail.toLowerCase())
    throw new ApiError(422, "The account email does not match the expected email. Nothing was assigned.");
  const unassigned = await db.query<{ face_id: string; code: string }>(
    `SELECT r.face_id,f.code FROM location_import_records r JOIN billboard_faces f ON f.id=r.face_id WHERE r.organization_id=$1 AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.face_id=r.face_id AND a.status IN ('assigned','server_received','pending_review','resurvey_requested','ambiguous','approved','baseline_verified')) ORDER BY f.code`,
    [actor.organizationId],
  );
  const [{ total }] = await db.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM location_import_records WHERE organization_id=$1",
    [actor.organizationId],
  );
  const alreadyAssigned = Number(total) - unassigned.length;
  if (!data.apply) return { worker, wouldAssign: unassigned.length, alreadyAssigned, assigned: 0 };
  let assigned = 0;
  await db.transaction(async (tx) => {
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [actor.organizationId]);
    for (const row of unassigned) {
      await tx.query(
        "INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date,status) VALUES($1,$2,$3,$4,$5,$6,'assigned')",
        [randomUUID(), actor.organizationId, row.face_id, worker.id, actor.id, data.dueDate],
      );
      assigned++;
    }
    await audit(tx, actor, "locations.import_assign", worker.id, { assigned, dueDate: data.dueDate });
  });
  return { worker, wouldAssign: unassigned.length, alreadyAssigned, assigned };
}

// Corrects the city of one imported location. The original label stays, and each change is kept in history.
export async function correctImportedCity(actor: Actor, input: { faceId: string; city: string; reason: string }) {
  requireAdmin(actor);
  requireAccess(actor, "sensitive");
  const data = z
    .object({
      faceId: z.string().uuid(),
      city: z.string().trim().min(1).max(120),
      reason: z.string().trim().min(10).max(1000),
    })
    .parse(input);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [record] = await tx.query<{ structure_id: string; city: string }>(
      "SELECT f.structure_id,s.city FROM location_import_records r JOIN billboard_faces f ON f.id=r.face_id JOIN billboard_structures s ON s.id=f.structure_id WHERE r.face_id=$1 AND r.organization_id=$2 FOR UPDATE OF r",
      [data.faceId, actor.organizationId],
    );
    if (!record) throw new ApiError(404, "Imported location not found");
    const [{ faces }] = await tx.query<{ faces: string }>(
      "SELECT count(*)::text AS faces FROM billboard_faces WHERE structure_id=$1",
      [record.structure_id],
    );
    if (Number(faces) !== 1)
      throw new ApiError(409, "This structure is shared by other locations; the city cannot be changed here");
    await tx.query("UPDATE billboard_structures SET city=$1 WHERE id=$2", [data.city, record.structure_id]);
    await tx.query("UPDATE location_import_records SET city_status='confirmed' WHERE face_id=$1", [data.faceId]);
    await tx.query(
      "INSERT INTO location_city_history(id,organization_id,face_id,previous_city,new_city,reason,changed_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), actor.organizationId, data.faceId, record.city, data.city, data.reason, actor.id],
    );
    await audit(tx, actor, "locations.city_corrected", data.faceId, { previous: record.city, next: data.city });
    return { faceId: data.faceId, previousCity: record.city, city: data.city };
  });
}

// One row per coordinate that is not verified: the original source values, the status, and why.
// Pure: reads the file only, never the database. Used to explain every unverified pin to a supervisor.
export function unverifiedGpsReport(text: string) {
  return classifyLocationCsv(text)
    .flatMap((row) => (row.outcome === "ready" && row.gpsStatus !== "verified" ? [row] : []))
    .map((row) => ({
      site_id: row.sourceSiteId,
      source_row: row.sourceRow,
      city: row.city,
      gps_status: row.gpsStatus,
      reason: row.gpsReason,
      source_gps_status: row.sourceFields.gps_status ?? "",
      source_latitude: row.sourceFields.latitude ?? "",
      source_longitude: row.sourceFields.longitude ?? "",
      source_open_issues: row.sourceFields.open_issues ?? "",
    }));
}

export function toCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => cell(row[h]!)).join(","))].join("\r\n") + "\r\n";
}

// Field captures awaiting supervisor review: the position an inspector recorded for a location with no verified coordinate.
export async function pendingFieldCaptures(actor: Actor) {
  requireAdmin(actor);
  requireAccess(actor, "ordinary");
  return (await getDb()).query<{
    id: string;
    face_id: string;
    code: string;
    gps_status: string;
    latitude: number;
    longitude: number;
    accuracy_m: number;
    captured_at: string;
    worker_name: string;
    inspection_id: string;
  }>(
    `SELECT c.id,c.face_id,f.code,r.gps_status,c.latitude,c.longitude,c.accuracy_m,c.captured_at::text,u.name worker_name,c.inspection_id FROM location_field_captures c JOIN billboard_faces f ON f.id=c.face_id JOIN location_import_records r ON r.face_id=c.face_id JOIN "user" u ON u.id=c.worker_id WHERE c.organization_id=$1 AND r.gps_status<>'verified' AND NOT EXISTS (SELECT 1 FROM source_coordinates s WHERE s.face_id=c.face_id) ORDER BY c.created_at DESC, c.id DESC LIMIT 500`,
    [actor.organizationId],
  );
}

// Supervisor verification: promotes one field capture to the verified coordinate of its location.
// Requires an administrator with a recent second factor, a reading within the accuracy limit, a position inside the
// vetted Iraq boundary (or a documented boundary exception), and complete server-received photo evidence.
// The previous status, the supplied coordinate and every promotion are kept in an append-only history.
export async function promoteFieldCapture(
  actor: Actor,
  input: { captureId: string; reason: string; boundaryException?: string | null },
) {
  requireAdmin(actor);
  requireAccess(actor as ServerActor, "sensitive");
  const data = z
    .object({
      captureId: z.string().min(1).max(100),
      reason: z.string().trim().min(10).max(1000),
      boundaryException: z.string().trim().max(1000).nullable().optional(),
    })
    .parse(input);
  const maxAccuracyM = promotionMaxAccuracyM();
  const db = await getDb();
  return db.transaction(async (tx) => {
    await tx.query("SELECT id FROM organizations WHERE id=$1 FOR UPDATE", [actor.organizationId]);
    const [capture] = await tx.query<{
      id: string;
      face_id: string;
      inspection_id: string;
      latitude: number;
      longitude: number;
      accuracy_m: number | null;
      gps_status: string;
      reference_latitude: number | null;
      reference_longitude: number | null;
      inspection_status: string;
    }>(
      `SELECT c.id,c.face_id,c.inspection_id,c.latitude,c.longitude,c.accuracy_m,r.gps_status,r.reference_latitude,r.reference_longitude,i.status AS inspection_status
       FROM location_field_captures c
       JOIN location_import_records r ON r.face_id=c.face_id
       JOIN inspections i ON i.id=c.inspection_id
       WHERE c.id=$1 AND c.organization_id=$2 FOR UPDATE OF r`,
      [data.captureId, actor.organizationId],
    );
    if (!capture) throw new ApiError(404, "Field capture not found");
    if (capture.gps_status === "verified") throw new ApiError(409, "This location already has a verified coordinate; it was not changed");
    const [existing] = await tx.query<{ id: string }>("SELECT id FROM source_coordinates WHERE face_id=$1", [capture.face_id]);
    if (existing) throw new ApiError(409, "This location already has a source coordinate; it was not changed");
    // Supporting field evidence: the visit was received by the server, and its front and wide photos have receipts.
    const evidence = await tx.query<{ kind: string }>(
      "SELECT DISTINCT m.kind FROM media_evidence m WHERE m.inspection_id=$1 AND m.receipt_id IS NOT NULL",
      [capture.inspection_id],
    );
    const kinds = new Set(evidence.map((row) => row.kind));
    const evidenceComplete = capture.inspection_status === "server_received" && kinds.has("front") && kinds.has("wide");
    const decision = decidePromotion({
      latitude: capture.latitude,
      longitude: capture.longitude,
      accuracyM: capture.accuracy_m,
      maxAccuracyM,
      evidenceComplete,
      boundaryExceptionReason: data.boundaryException ?? null,
    });
    if (!decision.ok) throw new ApiError(422, decision.reason);
    await tx.query(
      "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), capture.face_id, capture.latitude, capture.longitude, capture.accuracy_m, `field-capture:${capture.id}`, actor.id],
    );
    // A pending location takes its first verified position as its reference. Supplied values already present are kept.
    await tx.query(
      "UPDATE location_import_records SET gps_status='verified', reference_latitude=COALESCE(reference_latitude,$2), reference_longitude=COALESCE(reference_longitude,$3) WHERE face_id=$1",
      [capture.face_id, capture.latitude, capture.longitude],
    );
    await tx.query(
      "INSERT INTO location_gps_promotions(id,organization_id,face_id,capture_id,inspection_id,previous_gps_status,previous_reference_latitude,previous_reference_longitude,promoted_latitude,promoted_longitude,accuracy_m,inside_iraq,boundary_exception,reason,reviewer_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        randomUUID(),
        actor.organizationId,
        capture.face_id,
        capture.id,
        capture.inspection_id,
        capture.gps_status,
        capture.reference_latitude,
        capture.reference_longitude,
        capture.latitude,
        capture.longitude,
        capture.accuracy_m,
        decision.insideIraq,
        decision.boundaryException,
        data.reason,
        actor.id,
      ],
    );
    await audit(tx, actor, "locations.gps_verified", capture.face_id, {
      captureId: capture.id,
      previousStatus: capture.gps_status,
      accuracyM: capture.accuracy_m,
      maxAccuracyM,
      insideIraq: decision.insideIraq,
      boundaryException: decision.boundaryException,
      reason: data.reason,
    });
    return { faceId: capture.face_id, gpsStatus: "verified" as const, previousStatus: capture.gps_status, boundaryException: decision.boundaryException };
  });
}
