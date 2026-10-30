ALTER TABLE billboard_faces ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000);
ALTER TABLE billboard_faces ADD COLUMN is_test boolean NOT NULL DEFAULT false;

CREATE TABLE location_coordinate_corrections (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  uncertainty_m double precision NOT NULL CHECK (uncertainty_m BETWEEN 0 AND 10000),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX coordinate_corrections_latest ON location_coordinate_corrections(face_id, created_at DESC, id DESC);
CREATE INDEX coordinate_corrections_org ON location_coordinate_corrections(organization_id);
CREATE TRIGGER coordinate_corrections_immutable BEFORE UPDATE OR DELETE ON location_coordinate_corrections FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE VIEW effective_source_coordinates WITH (security_invoker = true) AS
SELECT c.id, c.face_id,
  coalesce(latest.latitude,c.latitude) AS latitude,
  coalesce(latest.longitude,c.longitude) AS longitude,
  coalesce(latest.uncertainty_m,c.uncertainty_m) AS uncertainty_m,
  c.source_name,c.imported_by,c.imported_at,
  c.latitude AS original_latitude,c.longitude AS original_longitude,c.uncertainty_m AS original_uncertainty_m,
  latest.id AS correction_id
FROM source_coordinates c
LEFT JOIN LATERAL (
  SELECT r.id,r.latitude,r.longitude,r.uncertainty_m FROM location_coordinate_corrections r
  WHERE r.face_id=c.face_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1
) latest ON true;

CREATE TABLE location_exceptions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  assignment_id text NOT NULL REFERENCES assignments(id),
  assignment_version integer NOT NULL CHECK (assignment_version > 0),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 10 AND 1000),
  authorized_by text NOT NULL REFERENCES "user"(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE INDEX location_exceptions_assignment ON location_exceptions(assignment_id,assignment_version,expires_at DESC);
CREATE INDEX location_exceptions_org ON location_exceptions(organization_id);
CREATE TRIGGER location_exceptions_immutable BEFORE UPDATE OR DELETE ON location_exceptions FOR EACH ROW EXECUTE FUNCTION deny_change();
