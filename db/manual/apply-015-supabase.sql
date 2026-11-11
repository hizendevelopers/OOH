-- Apply migration 015 (worker site registration) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
-- Take a database backup first. Deploy the application only after this script commits (the health check requires 015).
-- Read-only check to run first:
--   SELECT name FROM ibvs.schema_migrations ORDER BY name;   -- must include 014_gallery_verification.sql, not 015
SET search_path TO ibvs, public;
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '014_gallery_verification.sql') THEN
    RAISE EXCEPTION 'Migration 014 is not recorded in ibvs.schema_migrations; stop and review';
  END IF;
  IF EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '015_site_registration.sql') THEN
    RAISE EXCEPTION 'Migration 015 is already recorded; do not apply twice';
  END IF;
END $$;
-- Workers register a site that is not in the inventory. The server assigns the site ID per city and keeps the
-- full registration (who, when, where, size) in an append-only record for supervisor review.
CREATE TABLE ibvs.site_code_sequences (
  organization_id text NOT NULL REFERENCES organizations(id),
  city_code text NOT NULL CHECK (city_code ~ '^[A-Z]{3}$'),
  next_value integer NOT NULL CHECK (next_value > 0),
  PRIMARY KEY (organization_id, city_code)
);

CREATE TABLE ibvs.site_registrations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL UNIQUE REFERENCES billboard_faces(id),
  worker_id text NOT NULL REFERENCES "user"(id),
  operation_id text NOT NULL,
  city text NOT NULL,
  area text NOT NULL CHECK (length(area) BETWEEN 2 AND 120),
  region text NOT NULL CHECK (length(region) BETWEEN 2 AND 120),
  format text NOT NULL CHECK (format IN ('unipole','wall','bridge','gantry','rooftop','other')),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision NOT NULL CHECK (accuracy_m BETWEEN 0 AND 50),
  width_m numeric(6,2) NOT NULL CHECK (width_m > 0 AND width_m <= 100),
  height_m numeric(6,2) NOT NULL CHECK (height_m > 0 AND height_m <= 100),
  observed_at timestamptz NOT NULL,
  review_status text NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('pending_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (worker_id, operation_id)
);
CREATE TRIGGER site_registrations_immutable BEFORE UPDATE OR DELETE ON ibvs.site_registrations FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ibvs.site_code_sequences TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.site_registrations TO ibvs_app;
  END IF;
END $$;
INSERT INTO ibvs.schema_migrations(name) VALUES ('015_site_registration.sql');
COMMIT;
