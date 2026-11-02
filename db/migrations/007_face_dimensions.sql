-- Registered billboard dimensions. Append-only: a correction is a new row, never an update.
-- Metres only. A missing row means "Not recorded". No default size is ever inferred.
CREATE TABLE face_dimensions (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  width_m numeric(6,2) NOT NULL CHECK (width_m > 0 AND width_m <= 100),
  height_m numeric(6,2) NOT NULL CHECK (height_m > 0 AND height_m <= 100),
  status text NOT NULL CHECK (status IN ('unverified','owner_supplied','surveyed','remeasure_required')),
  source_note text NOT NULL DEFAULT '' CHECK (length(source_note) <= 1000),
  source_document_ref text NOT NULL DEFAULT '' CHECK (length(source_document_ref) <= 200),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('unverified','remeasure_required') OR length(trim(source_note)) >= 5),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX face_dimensions_latest ON face_dimensions(face_id, recorded_at DESC, id DESC);
CREATE INDEX face_dimensions_org ON face_dimensions(organization_id);
CREATE TRIGGER face_dimensions_immutable BEFORE UPDATE OR DELETE ON face_dimensions FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE VIEW effective_face_dimensions WITH (security_invoker = true) AS
SELECT DISTINCT ON (d.face_id) d.id, d.organization_id, d.face_id, d.width_m, d.height_m, d.status,
  d.source_note, d.source_document_ref, d.recorded_by, d.recorded_at
FROM face_dimensions d
ORDER BY d.face_id, d.recorded_at DESC, d.id DESC;
