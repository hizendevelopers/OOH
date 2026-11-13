-- Apply migration 018 (Arabic site names) to the hosted IBVS database. Run in the Supabase SQL Editor as the project owner.
-- Take a backup first. Run it on project utokgrudjgnvypzxufcx (the IBVS project). Check 017 is recorded before running.
-- It adds one new table and changes no existing data.
SET search_path TO ibvs, public;
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '017_evidence_objects.sql') THEN
    RAISE EXCEPTION 'Migration 017 is not recorded in ibvs.schema_migrations; stop and review';
  END IF;
  IF EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name = '018_site_name_translations.sql') THEN
    RAISE EXCEPTION 'Migration 018 is already recorded; do not apply twice';
  END IF;
END $$;
CREATE TABLE ibvs.face_name_translations (
  face_id text PRIMARY KEY REFERENCES ibvs.billboard_faces(id),
  organization_id text NOT NULL REFERENCES ibvs.organizations(id),
  source_text text NOT NULL CHECK (length(source_text) BETWEEN 1 AND 1000),
  name_ar text NOT NULL CHECK (length(trim(name_ar)) BETWEEN 1 AND 1000),
  model text NOT NULL,
  translated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX face_name_translations_org ON ibvs.face_name_translations(organization_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ibvs.face_name_translations TO ibvs_app;
  END IF;
END $$;
INSERT INTO ibvs.schema_migrations(name) VALUES ('018_site_name_translations.sql');
COMMIT;
