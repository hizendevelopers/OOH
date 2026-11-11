-- Apply migration 014 (gallery verification) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
-- Take a database backup first. Deploy the application only after this script commits, because the health check
-- requires migration 014 and reports unavailable until it is recorded.
BEGIN;
SET LOCAL search_path TO ibvs;
-- Pre-checks: stop before any change if the prerequisites are not present.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '013_app_role_grants.sql') THEN
    RAISE EXCEPTION 'Migration 013 is not recorded; apply it first';
  END IF;
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE name = '014_gallery_verification.sql') THEN
    RAISE EXCEPTION 'Migration 014 is already recorded; do not apply twice';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_evidence_inspection_id_kind_key') THEN
    RAISE EXCEPTION 'Expected constraint media_evidence_inspection_id_kind_key is missing; stop and review';
  END IF;
END $$;
-- Gallery uploads and server-side EXIF verification (additive only).
-- Camera photos keep source 'camera' and are unchanged. Gallery originals are stored as received.
ALTER TABLE media_evidence ADD COLUMN source text NOT NULL DEFAULT 'camera' CHECK (source IN ('camera','gallery'));
ALTER TABLE media_evidence ADD COLUMN original_format text CHECK (original_format IN ('jpeg','heic','heif'));
-- A rejected gallery photo can be replaced before submission. The old row is kept, marked superseded.
ALTER TABLE media_evidence ADD COLUMN superseded_at timestamptz;
ALTER TABLE media_evidence DROP CONSTRAINT media_evidence_inspection_id_kind_key;
CREATE UNIQUE INDEX media_evidence_current_kind ON media_evidence(inspection_id, kind) WHERE superseded_at IS NULL;

-- One verification record per media item. Append-only: a later verifier version writes a new row
-- for a new media item, never rewrites the decision that the worker and supervisor saw.
CREATE TABLE media_verification (
  id text PRIMARY KEY,
  media_id text NOT NULL UNIQUE REFERENCES media_evidence(id),
  organization_id text NOT NULL REFERENCES organizations(id),
  verifier_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('approved','rejected','needs_review')),
  reason_codes jsonb NOT NULL DEFAULT '[]',
  exif jsonb NOT NULL DEFAULT '{}',
  capture_local_date text,
  capture_local_time text,
  capture_offset text,
  capture_timezone text,
  photo_latitude double precision,
  photo_longitude double precision,
  site_latitude double precision,
  site_longitude double precision,
  site_coordinate_source text,
  distance_m double precision,
  capture_at timestamptz,
  uploaded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION media_verification_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'media_verification rows are append-only';
END $$;
CREATE TRIGGER media_verification_no_update BEFORE UPDATE OR DELETE ON media_verification
  FOR EACH ROW EXECUTE FUNCTION media_verification_append_only();

-- Runtime role access, applied only where the role exists (same pattern as 013).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT ON ibvs.media_verification TO ibvs_app;
  END IF;
END $$;

-- A received original stays immutable, except for one change: marking a rejected gallery original as
-- superseded when the worker replaces it. Every evidence column must stay the same, and nothing is deleted.
CREATE OR REPLACE FUNCTION protect_complete_media() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE only_superseded boolean;
BEGIN
  IF OLD.receipt_id IS NOT NULL THEN
    only_superseded := TG_OP = 'UPDATE' AND OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL
      AND (NEW.id, NEW.inspection_id, NEW.kind, NEW.expected_bytes, NEW.expected_hash, NEW.server_hash,
           NEW.object_key, NEW.width, NEW.height, NEW.receipt_id, NEW.received_at, NEW.source, NEW.original_format)
        IS NOT DISTINCT FROM
          (OLD.id, OLD.inspection_id, OLD.kind, OLD.expected_bytes, OLD.expected_hash, OLD.server_hash,
           OLD.object_key, OLD.width, OLD.height, OLD.receipt_id, OLD.received_at, OLD.source, OLD.original_format);
    IF NOT only_superseded THEN RAISE EXCEPTION 'Received media is immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;
INSERT INTO schema_migrations(name) VALUES ('014_gallery_verification.sql');
COMMIT;
