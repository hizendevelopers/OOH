import { z } from "zod";
import type { Actor } from "@ibvs/domain";
import { getDb } from "./db";
import { ApiError, type Assignment } from "./service";
import { locationPolicy, metresBetween } from "../field/location-policy";
import { spatialEngine } from "./spatial";

const numeric = z
  .union([
    z.number(),
    z
      .string()
      .trim()
      .min(1)
      .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/),
  ])
  .pipe(z.coerce.number());

export const nearbyInput = z.object({
  latitude: numeric.pipe(z.number().min(-90).max(90)),
  longitude: numeric.pipe(z.number().min(-180).max(180)),
  radiusM: numeric.pipe(z.number().min(100).max(20000)).default(5000),
  includeTest: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type NearbyLocation = Assignment & {
  distance_m: number;
  is_test: boolean;
};
export async function nearbyLocations(actor: Actor, raw: unknown) {
  if (actor.role !== "worker")
    throw new ApiError(403, "Worker access required");
  const input = nearbyInput.parse(raw);
  const db = await getDb();
  const engine = await spatialEngine(db);
  const source =
    "ST_SetSRID(ST_MakePoint(c.longitude,c.latitude),4326)::geography";
  const device =
    "ST_SetSRID(ST_MakePoint($4::double precision,$5::double precision),4326)::geography";
  const rows = await db.query<
    Assignment & { is_test: boolean; distance_m?: number }
  >(
    `SELECT f.id,f.code,f.orientation,f.is_test,f.description,s.code structure_code,s.city,s.zone,c.latitude,c.longitude,c.uncertainty_m,c.original_latitude,c.original_longitude,c.original_uncertainty_m,a.id assignment_id,a.status,a.worker_id,a.due_date::text,a.version,a.instructions,a.parent_inspection_id,u.name worker_name ${engine === "postgis" ? `,ST_Distance(${source},${device}) distance_m` : ""}
     FROM assignments a JOIN billboard_faces f ON f.id=a.face_id AND f.organization_id=a.organization_id
     JOIN billboard_structures s ON s.id=f.structure_id JOIN effective_source_coordinates c ON c.face_id=f.id
     JOIN "user" u ON u.id=a.worker_id JOIN worker_profiles w ON w.user_id=a.worker_id
     WHERE a.organization_id=$1 AND a.worker_id=$2 AND w.active=true AND a.status IN ('assigned','resurvey_requested') AND ($3::boolean OR f.is_test=false) ${engine === "postgis" ? `AND ST_DWithin(${source},${device},$6) ORDER BY distance_m,f.code LIMIT 50` : ""}`,
    engine === "postgis"
      ? [
          actor.organizationId,
          actor.id,
          input.includeTest,
          input.longitude,
          input.latitude,
          input.radiusM,
        ]
      : [actor.organizationId, actor.id, input.includeTest],
  );
  const locations: NearbyLocation[] = rows
    .map((row) => ({
      ...row,
      distance_m: row.distance_m ?? metresBetween(input, row),
    }))
    .filter((row) => row.distance_m <= input.radiusM)
    .sort((a, b) => a.distance_m - b.distance_m || a.code.localeCompare(b.code))
    .slice(0, 50);
  return { locations, policy: locationPolicy() };
}
