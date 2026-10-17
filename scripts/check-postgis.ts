import { strict as assert } from "node:assert";
import { Client } from "pg";
import type { Database } from "../apps/web/src/server/db";
import {
  spatialEngine,
  geoDistance,
  nearbyFaces,
} from "../apps/web/src/server/spatial";

// Explicit opt-in test database. No production tables are changed: fixtures are TEMP
// tables inside a transaction, always rolled back. Install PostGIS separately.
const connectionString = process.env.IBVS_POSTGIS_TEST_URL;
if (!connectionString)
  throw new Error(
    "Set IBVS_POSTGIS_TEST_URL to an isolated PostGIS test database",
  );
const client = new Client({ connectionString });
await client.connect();
const prior = process.env.DATABASE_URL;
process.env.DATABASE_URL = connectionString;
const db: Database = {
  async query<T>(sql: string, params: unknown[] = []) {
    return (await client.query(sql, params)).rows as T[];
  },
  async transaction<T>(fn: (tx: Database) => Promise<T>) {
    return fn(db);
  },
};
try {
  await client.query("BEGIN");
  assert.equal(await spatialEngine(db), "postgis");
  await client.query(
    `CREATE TEMP TABLE billboard_structures(id text,code text); CREATE TEMP TABLE billboard_faces(id text,organization_id text,structure_id text,code text,orientation text); CREATE TEMP TABLE source_coordinates(face_id text,latitude double precision,longitude double precision,uncertainty_m double precision,location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED)`,
  );
  await client.query(
    `INSERT INTO billboard_structures VALUES('s','structure'); INSERT INTO billboard_faces VALUES('a','org','s','NORTH','N'),('b','org','s','SOUTH','S'),('c','foreign','s','PRIVATE','E'); INSERT INTO source_coordinates(face_id,latitude,longitude,uncertainty_m) VALUES('a',33,44,50),('b',33.00005,44,50),('c',33,44,50)`,
  );
  const distance = await geoDistance(
    db,
    { latitude: 33, longitude: 44 },
    { latitude: 33.00005, longitude: 44 },
    "postgis",
  );
  assert(distance > 5 && distance < 6);
  const candidates = await nearbyFaces(
    db,
    "org",
    "a",
    { latitude: 33, longitude: 44, uncertainty_m: 50 },
    "postgis",
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].code, "SOUTH");
  assert(Math.abs(candidates[0].distanceM - distance) < 0.01);
  assert.equal(
    await geoDistance(
      db,
      { latitude: 33, longitude: 44 },
      { latitude: 33, longitude: 44 },
      "postgis",
    ),
    0,
  );
  console.log(
    "PostGIS runtime distances, neighboring faces and organization isolation passed (temporary fixtures).",
  );
} finally {
  await client.query("ROLLBACK").finally(() => client.end());
  if (prior === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = prior;
}
