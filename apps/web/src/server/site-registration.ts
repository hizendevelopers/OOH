// Worker registration of a site that is not in the inventory. The server assigns the site ID, stores the
// location from the device reading (checked here), creates the billboard, its size and its pin, and assigns the
// new site back to the worker so the normal visit flow can capture the photographs.
import { randomUUID } from "node:crypto";
import type { Actor } from "@ibvs/domain";
import {
  aspectRatio,
  siteCities,
  siteCode,
  siteRegistrationInput,
  SITE_DUE_DAYS,
  SITE_DUPLICATE_RADIUS_M,
  type SiteCity,
  type SiteRegistrationInput,
} from "../../../../packages/domain/src/sites";
import { getDb, type Database } from "./db";
import { ApiError, audit } from "./service";
import { isInsideIraq } from "./gps-promotion";
import { haversineMeters, siteDate } from "./gallery-verification";

export type SiteRegistration = {
  faceId: string;
  code: string;
  city: SiteCity;
  assignmentId: string;
  dueDate: string;
  aspectRatio: string;
  replayed: boolean;
};

async function activeWorker(db: Database, actor: Actor) {
  if (actor.role !== "worker") throw new ApiError(403, "Only field workers can register a new site");
  const [row] = await db.query<{ user_id: string }>(
    "SELECT p.user_id FROM worker_profiles p JOIN organization_members m ON m.user_id=p.user_id WHERE p.user_id=$1 AND p.organization_id=$2 AND p.active=true AND m.role='worker'",
    [actor.id, actor.organizationId],
  );
  if (!row) throw new ApiError(403, "Worker account is not active");
}

// Next ID for a city. The sequence row is incremented atomically; an ID already used by a legacy import is skipped.
async function nextSiteId(db: Database, organizationId: string, city: SiteCity) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db.query<{ next_value: number }>(
      "INSERT INTO site_code_sequences(organization_id,city_code,next_value) VALUES($1,$2,1) ON CONFLICT(organization_id,city_code) DO UPDATE SET next_value=site_code_sequences.next_value+1 RETURNING next_value",
      [organizationId, siteCities[city].code],
    );
    if (row.next_value > 9999)
      throw new ApiError(409, `The ${siteCities[city].en} site sequence is full; contact your supervisor`);
    const code = siteCode(city, row.next_value);
    const taken = await db.query(
      "SELECT 1 FROM billboard_faces WHERE organization_id=$1 AND code=$2 UNION ALL SELECT 1 FROM billboard_structures WHERE organization_id=$1 AND code=$2",
      [organizationId, code],
    );
    if (!taken.length) return code;
  }
  throw new ApiError(503, "Could not allocate a site ID; try again");
}

// Existing sites within the duplicate radius. Uses the authoritative effective coordinates.
async function nearestExisting(db: Database, organizationId: string, input: SiteRegistrationInput) {
  const candidates = await db.query<{ code: string; latitude: number; longitude: number }>(
    "SELECT f.code, c.latitude, c.longitude FROM billboard_faces f JOIN effective_source_coordinates c ON c.face_id=f.id WHERE f.organization_id=$1 AND c.latitude BETWEEN $2 AND $3 AND c.longitude BETWEEN $4 AND $5",
    [organizationId, input.latitude - 0.0008, input.latitude + 0.0008, input.longitude - 0.001, input.longitude + 0.001],
  );
  let nearest: { code: string; distanceM: number } | null = null;
  for (const c of candidates) {
    const distanceM = haversineMeters(input, c);
    if (distanceM <= SITE_DUPLICATE_RADIUS_M && (!nearest || distanceM < nearest.distanceM))
      nearest = { code: c.code, distanceM: Math.round(distanceM) };
  }
  return nearest;
}

export async function registerSite(actor: Actor, raw: unknown): Promise<SiteRegistration> {
  const input = siteRegistrationInput.parse(raw);
  const db = await getDb();
  return db.transaction(async (tx) => {
    await activeWorker(tx, actor);

    // Same device and same operation key: return the earlier result instead of creating a second site.
    const [earlier] = await tx.query<{ face_id: string; code: string; city: SiteCity; assignment_id: string; due_date: string; width_m: string; height_m: string }>(
      "SELECT r.face_id, f.code, r.city, a.id AS assignment_id, a.due_date::text AS due_date, r.width_m::text, r.height_m::text FROM site_registrations r JOIN billboard_faces f ON f.id=r.face_id JOIN assignments a ON a.face_id=r.face_id AND a.worker_id=r.worker_id WHERE r.worker_id=$1 AND r.operation_id=$2",
      [actor.id, input.operationId],
    );
    if (earlier)
      return {
        faceId: earlier.face_id,
        code: earlier.code,
        city: earlier.city,
        assignmentId: earlier.assignment_id,
        dueDate: earlier.due_date,
        aspectRatio: aspectRatio(Number(earlier.width_m), Number(earlier.height_m)),
        replayed: true,
      };

    if (!isInsideIraq(input.latitude, input.longitude))
      throw new ApiError(422, "The reading is outside Iraq. Check the location and try again.");

    const existing = await nearestExisting(tx, actor.organizationId, input);
    if (existing)
      throw new ApiError(
        409,
        `This spot is already an inventory site (${existing.code}, ${existing.distanceM} m away). Choose that site instead.`,
      );

    const code = await nextSiteId(tx, actor.organizationId, input.city);
    const structureId = randomUUID();
    const faceId = randomUUID();
    const assignmentId = randomUUID();
    const dueDate = siteDate(Date.now() + SITE_DUE_DAYS * 86400000);

    await tx.query(
      "INSERT INTO billboard_structures(id,organization_id,code,city,zone) VALUES($1,$2,$3,$4,$5)",
      [structureId, actor.organizationId, code, siteCities[input.city].en, input.area],
    );
    await tx.query(
      "INSERT INTO billboard_faces(id,organization_id,structure_id,code,orientation,description) VALUES($1,$2,$3,$4,'unknown',$5)",
      [faceId, actor.organizationId, structureId, code, input.description],
    );
    await tx.query(
      "INSERT INTO face_dimensions(id,organization_id,face_id,width_m,height_m,status,source_note,recorded_by) VALUES($1,$2,$3,$4,$5,'unverified','',$6)",
      [randomUUID(), actor.organizationId, faceId, input.widthM, input.heightM, actor.id],
    );
    await tx.query(
      "INSERT INTO source_coordinates(id,face_id,latitude,longitude,uncertainty_m,source_name,imported_by) VALUES($1,$2,$3,$4,$5,'worker_registration',$6)",
      [randomUUID(), faceId, input.latitude, input.longitude, input.accuracyM, actor.id],
    );
    await tx.query(
      "INSERT INTO site_registrations(id,organization_id,face_id,worker_id,operation_id,city,area,region,format,description,latitude,longitude,accuracy_m,width_m,height_m,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      [
        randomUUID(),
        actor.organizationId,
        faceId,
        actor.id,
        input.operationId,
        input.city,
        input.area,
        input.region,
        input.format,
        input.description,
        input.latitude,
        input.longitude,
        input.accuracyM,
        input.widthM,
        input.heightM,
        input.observedAt,
      ],
    );
    await tx.query(
      "INSERT INTO assignments(id,organization_id,face_id,worker_id,assigned_by,due_date) VALUES($1,$2,$3,$4,$5,$6)",
      [assignmentId, actor.organizationId, faceId, actor.id, actor.id, dueDate],
    );
    await audit(tx, actor, "site.registered", faceId, {
      code,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM,
      widthM: input.widthM,
      heightM: input.heightM,
      format: input.format,
      assignmentId,
    });
    return {
      faceId,
      code,
      city: input.city,
      assignmentId,
      dueDate,
      aspectRatio: aspectRatio(input.widthM, input.heightM),
      replayed: false,
    };
  });
}
