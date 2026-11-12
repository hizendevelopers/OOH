-- Apply migration 016 (worker-entered addresses) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
-- Take a backup first. Run it on project utokgrudjgnvypzxufcx (the IBVS project). Check 015 is recorded before running.
SET search_path TO ibvs, public;
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '015_site_registration.sql') THEN
    RAISE EXCEPTION 'Migration 015 is not recorded in ibvs.schema_migrations; stop and review';
  END IF;
  IF EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '016_worker_addresses.sql') THEN
    RAISE EXCEPTION 'Migration 016 is already recorded; do not apply twice';
  END IF;
END $$;
-- Street address entered by the worker on a visit, when the imported list has none. Append-only: the latest row wins.
CREATE TABLE ibvs.face_addresses (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL REFERENCES billboard_faces(id),
  assignment_id text NOT NULL REFERENCES assignments(id),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 5 AND 300),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX face_addresses_latest ON ibvs.face_addresses(face_id, recorded_at DESC, id DESC);
CREATE TRIGGER face_addresses_immutable BEFORE UPDATE OR DELETE ON ibvs.face_addresses FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT ON ibvs.face_addresses TO ibvs_app;
  END IF;
END $$;
INSERT INTO ibvs.schema_migrations(name) VALUES ('016_worker_addresses.sql');
COMMIT;
