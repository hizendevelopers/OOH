-- Production-only, after the portable core migration. Run using migration credentials.
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE source_coordinates ADD COLUMN IF NOT EXISTS location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS source_location_gist ON source_coordinates USING gist(location);
-- Example M3 candidate query: ST_DWithin(location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
