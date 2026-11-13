-- Apply migration 017 (photos stored in the database) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
-- Take a backup first. Run it on project utokgrudjgnvypzxufcx (the IBVS project). Check 016 is recorded before running.
SET search_path TO ibvs, public;
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '016_worker_addresses.sql') THEN
    RAISE EXCEPTION 'Migration 016 is not recorded in ibvs.schema_migrations; stop and review';
  END IF;
  IF EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '017_evidence_objects.sql') THEN
    RAISE EXCEPTION 'Migration 017 is already recorded; do not apply twice';
  END IF;
END $$;
-- Photo bytes kept in the database itself. One row per stored object, written once and never changed.
CREATE TABLE ibvs.evidence_objects (
  key text PRIMARY KEY,
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 6291456),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(data) = bytes)
);
ALTER TABLE ibvs.evidence_objects ALTER COLUMN data SET STORAGE EXTERNAL;
CREATE TRIGGER evidence_objects_immutable BEFORE UPDATE OR DELETE ON ibvs.evidence_objects FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT ON ibvs.evidence_objects TO ibvs_app;
  END IF;
END $$;
INSERT INTO ibvs.schema_migrations(name) VALUES ('017_evidence_objects.sql');
COMMIT;
