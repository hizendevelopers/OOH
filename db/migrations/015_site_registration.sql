-- Workers register a site that is not in the inventory. The server assigns the site ID per city and keeps the
-- full registration (who, when, where, size) in an append-only record for supervisor review.
CREATE TABLE site_code_sequences (
  organization_id text NOT NULL REFERENCES organizations(id),
  city_code text NOT NULL CHECK (city_code ~ '^[A-Z]{3}$'),
  next_value integer NOT NULL CHECK (next_value > 0),
  PRIMARY KEY (organization_id, city_code)
);

CREATE TABLE site_registrations (
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
CREATE TRIGGER site_registrations_immutable BEFORE UPDATE OR DELETE ON site_registrations FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ibvs.site_code_sequences TO ibvs_app;
    GRANT SELECT, INSERT ON ibvs.site_registrations TO ibvs_app;
  END IF;
END $$;
