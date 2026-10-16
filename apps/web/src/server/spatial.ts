import type { Database } from "./db";
import { distanceM } from "@ibvs/domain";
import type { Candidate } from "../../../../packages/domain/src/risk";
export type Coordinate = { latitude: number; longitude: number };
export async function spatialEngine(db: Database) {
  if (!process.env.DATABASE_URL) return "haversine_development" as const;
  const extension = await db.query(
    "SELECT 1 FROM pg_extension WHERE extname='postgis'",
  );
  if (!extension.length)
    throw new Error(
      "Production risk analysis requires PostGIS and db/spatial.sql",
    );
  return "postgis" as const;
}
export async function geoDistance(
  db: Database,
  a: Coordinate,
  b: Coordinate,
  engine: "postgis" | "haversine_development",
) {
  if (engine === "haversine_development") return distanceM(a, b);
  const [result] = await db.query<{ distance: number }>(
    "SELECT ST_Distance(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) distance",
    [a.longitude, a.latitude, b.longitude, b.latitude],
  );
  return result.distance;
}
export async function nearbyFaces(
  db: Database,
  organizationId: string,
  faceId: string,
  source: Coordinate & { uncertainty_m: number },
  engine: "postgis" | "haversine_development",
): Promise<Candidate[]> {
  const select = `SELECT f.id,f.code,s.code structure_code,f.orientation,c.latitude,c.longitude,c.uncertainty_m`;
  if (engine === "postgis")
    return db.query<Candidate>(
      `${select},ST_Distance(c.location,origin.location) "distanceM" FROM billboard_faces f JOIN billboard_structures s ON s.id=f.structure_id JOIN source_coordinates c ON c.face_id=f.id JOIN source_coordinates origin ON origin.face_id=$2 WHERE f.organization_id=$1 AND f.id<>$2 AND ST_DWithin(c.location,origin.location,150+origin.uncertainty_m+c.uncertainty_m) ORDER BY "distanceM",f.code LIMIT 101`,
      [organizationId, faceId],
    );
  const rows = await db.query<Omit<Candidate, "distanceM">>(
    `${select} FROM billboard_faces f JOIN billboard_structures s ON s.id=f.structure_id JOIN source_coordinates c ON c.face_id=f.id WHERE f.organization_id=$1 AND f.id<>$2`,
    [organizationId, faceId],
  );
  return rows
    .map((row) => ({ ...row, distanceM: distanceM(row, source) }))
    .filter(
      (row) => row.distanceM <= 150 + source.uncertainty_m + row.uncertainty_m,
    )
    .sort((a, b) => a.distanceM - b.distanceM || a.code.localeCompare(b.code))
    .slice(0, 101);
}
