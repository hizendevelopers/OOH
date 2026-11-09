-- Apply migrations 010, 011 and 012 to the hosted IBVS database (schema ibvs). One transaction.
BEGIN;
SET LOCAL search_path TO ibvs;
-- ===== 010_two_factor.sql =====
-- Two-factor authentication (TOTP with recovery codes) for administrator accounts.
-- Existing accounts keep twoFactorEnabled = false and sign in exactly as before until
-- they enroll or the administrator enforcement setting is turned on.
CREATE TABLE "twoFactor" (
  id text PRIMARY KEY,
  secret text NOT NULL,
  "backupCodes" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT true,
  "failedVerificationCount" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamptz
);
CREATE INDEX "twoFactor_userId_idx" ON "twoFactor"("userId");
ALTER TABLE "user" ADD COLUMN "twoFactorEnabled" boolean NOT NULL DEFAULT false;

INSERT INTO schema_migrations(name) VALUES ('010_two_factor.sql');
-- ===== 011_location_import.sql =====
-- Location import provenance and pending GPS support. Existing rows are never rewritten.
CREATE TABLE location_import_records (
  face_id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  source_site_id text NOT NULL CHECK (length(source_site_id) BETWEEN 3 AND 48),
  source_file text NOT NULL CHECK (length(source_file) BETWEEN 1 AND 200),
  source_row integer NOT NULL CHECK (source_row > 0),
  city_label text NOT NULL CHECK (length(city_label) BETWEEN 1 AND 120),
  city_status text NOT NULL CHECK (city_status IN ('confirmed','unspecified','pending_verification')),
  gps_status text NOT NULL CHECK (gps_status IN ('verified','approximate','to_correct','pending_gps')),
  reference_latitude double precision CHECK (reference_latitude BETWEEN -90 AND 90),
  reference_longitude double precision CHECK (reference_longitude BETWEEN -180 AND 180),
  needs_review boolean NOT NULL,
  open_issues text NOT NULL DEFAULT '' CHECK (length(open_issues) <= 2000),
  dimension_status text NOT NULL CHECK (dimension_status IN ('recorded','pending_measurement')),
  source_fields jsonb NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_site_id),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id),
  CHECK ((gps_status = 'pending_gps') = (reference_latitude IS NULL)),
  CHECK ((reference_latitude IS NULL) = (reference_longitude IS NULL))
);
CREATE INDEX location_import_records_org_city ON location_import_records(organization_id, city_label);

-- Append-only city corrections: the original label stays in location_import_records.
CREATE TABLE location_city_history (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  previous_city text NOT NULL CHECK (length(previous_city) BETWEEN 1 AND 120),
  new_city text NOT NULL CHECK (length(new_city) BETWEEN 1 AND 120),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  changed_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX location_city_history_face ON location_city_history(face_id, created_at);
CREATE TRIGGER location_city_history_immutable BEFORE UPDATE OR DELETE ON location_city_history FOR EACH ROW EXECUTE FUNCTION deny_change();

-- GPS captured during a visit to a location that has no verified coordinate yet.
-- This is inspection evidence. It never replaces source_coordinates.
CREATE TABLE location_field_captures (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  inspection_id text NOT NULL UNIQUE REFERENCES inspections(id),
  worker_id text NOT NULL REFERENCES "user"(id),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision NOT NULL CHECK (accuracy_m BETWEEN 0 AND 10000),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX location_field_captures_face ON location_field_captures(face_id, created_at);
CREATE TRIGGER location_field_captures_immutable BEFORE UPDATE OR DELETE ON location_field_captures FOR EACH ROW EXECUTE FUNCTION deny_change();

INSERT INTO schema_migrations(name) VALUES ('011_location_import.sql');
-- ===== 012_security_hardening.sql =====
-- Second-factor verification time, used to tell which sessions passed a verified authenticator.
-- The trigger sets verifiedAt the moment verified becomes true, so the value is set by the database, not the client.
ALTER TABLE "twoFactor" ADD COLUMN "verifiedAt" timestamptz;
UPDATE "twoFactor" SET "verifiedAt" = now() WHERE verified AND "verifiedAt" IS NULL;

CREATE FUNCTION two_factor_stamp_verified() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.verified AND (TG_OP = 'INSERT' OR OLD.verified IS DISTINCT FROM NEW.verified) THEN
    NEW."verifiedAt" := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER two_factor_verified_stamp BEFORE INSERT OR UPDATE ON "twoFactor" FOR EACH ROW EXECUTE FUNCTION two_factor_stamp_verified();

-- Append-only history of every promotion of a field-captured position to a verified coordinate.
-- It keeps the previous status, the previous coordinate, the captured coordinate and accuracy,
-- the reviewer, the reason, and whether a documented boundary exception was used.
CREATE TABLE location_gps_promotions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  capture_id text NOT NULL REFERENCES location_field_captures(id),
  inspection_id text NOT NULL REFERENCES inspections(id),
  previous_gps_status text NOT NULL,
  previous_reference_latitude double precision,
  previous_reference_longitude double precision,
  promoted_latitude double precision NOT NULL CHECK (promoted_latitude BETWEEN -90 AND 90),
  promoted_longitude double precision NOT NULL CHECK (promoted_longitude BETWEEN -180 AND 180),
  accuracy_m double precision NOT NULL CHECK (accuracy_m >= 0),
  inside_iraq boolean NOT NULL,
  boundary_exception boolean NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  reviewer_id text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id),
  CHECK (inside_iraq OR boundary_exception)
);
CREATE INDEX location_gps_promotions_face ON location_gps_promotions(face_id, created_at);
CREATE TRIGGER location_gps_promotions_immutable BEFORE UPDATE OR DELETE ON location_gps_promotions FOR EACH ROW EXECUTE FUNCTION deny_change();

INSERT INTO schema_migrations(name) VALUES ('012_security_hardening.sql');
COMMIT;
