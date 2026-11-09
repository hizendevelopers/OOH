-- Apply migrations 007-009 to the hosted IBVS database (schema ibvs) in Supabase SQL Editor.
-- Take a backup first. The whole script runs in one transaction: it either applies fully or not at all.
BEGIN;
SET LOCAL search_path TO ibvs;

-- ===== 007_face_dimensions.sql =====
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

INSERT INTO schema_migrations(name) VALUES ('007_face_dimensions.sql');

-- ===== 008_advertiser_history.sql =====
-- Advertiser history. Brand observations come from workers and confirmations come from
-- supervisors. Both are append-only. The current advertiser is the latest confirmation.
CREATE TABLE advertisers (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  name_en text NOT NULL DEFAULT '' CHECK (length(name_en) <= 120),
  name_ar text NOT NULL DEFAULT '' CHECK (length(name_ar) <= 120),
  normalized_key text NOT NULL CHECK (length(normalized_key) BETWEEN 2 AND 120),
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, normalized_key),
  UNIQUE (organization_id, id)
);

CREATE TABLE brand_observations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  inspection_id text NOT NULL UNIQUE REFERENCES inspections(id),
  kind text NOT NULL CHECK (kind IN ('advertiser','blank','unreadable')),
  observed_text text NOT NULL DEFAULT '' CHECK (length(observed_text) <= 120),
  normalized_key text NOT NULL DEFAULT '' CHECK (length(normalized_key) <= 120),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'advertiser') = (length(observed_text) > 0)),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)
);
CREATE INDEX brand_observations_face ON brand_observations(face_id, recorded_at DESC, id DESC);
CREATE TRIGGER brand_observations_immutable BEFORE UPDATE OR DELETE ON brand_observations FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TABLE advertiser_confirmations (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL,
  observation_id text REFERENCES brand_observations(id),
  outcome text NOT NULL CHECK (outcome IN ('advertiser','blank','unreadable')),
  advertiser_id text,
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
  confirmed_by text NOT NULL REFERENCES "user"(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((outcome = 'advertiser') = (advertiser_id IS NOT NULL)),
  FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id),
  FOREIGN KEY (organization_id, advertiser_id) REFERENCES advertisers(organization_id, id)
);
CREATE INDEX advertiser_confirmations_face ON advertiser_confirmations(face_id, confirmed_at DESC, id DESC);
CREATE TRIGGER advertiser_confirmations_immutable BEFORE UPDATE OR DELETE ON advertiser_confirmations FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE VIEW current_face_advertiser WITH (security_invoker = true) AS
SELECT DISTINCT ON (c.face_id) c.id, c.organization_id, c.face_id, c.outcome, c.advertiser_id, c.observation_id, c.confirmed_by, c.confirmed_at
FROM advertiser_confirmations c
ORDER BY c.face_id, c.confirmed_at DESC, c.id DESC;

INSERT INTO schema_migrations(name) VALUES ('008_advertiser_history.sql');

-- ===== 009_angle_photos.sql =====
-- Optional angle photographs. Front and wide remain required. Up to four angle
-- photographs may be added, so a visit has three to six photographs.
ALTER TABLE media_evidence DROP CONSTRAINT IF EXISTS media_evidence_kind_check;
ALTER TABLE media_evidence ADD CONSTRAINT media_evidence_kind_check CHECK (kind IN ('front','wide','angle_1','angle_2','angle_3','angle_4'));

INSERT INTO schema_migrations(name) VALUES ('009_angle_photos.sql');

COMMIT;
