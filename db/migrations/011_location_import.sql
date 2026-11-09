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
