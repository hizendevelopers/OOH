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
