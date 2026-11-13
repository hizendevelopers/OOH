-- Arabic site names, machine-translated from each site's English description and shown when the interface is in Arabic.
-- The English text a translation came from is kept with it: when the description changes, the old translation no
-- longer matches and the site shows its English name until it is translated again. Site records are not changed.
CREATE TABLE face_name_translations (
  face_id text PRIMARY KEY REFERENCES billboard_faces(id),
  organization_id text NOT NULL REFERENCES organizations(id),
  source_text text NOT NULL CHECK (length(source_text) BETWEEN 1 AND 1000),
  name_ar text NOT NULL CHECK (length(trim(name_ar)) BETWEEN 1 AND 1000),
  model text NOT NULL,
  translated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX face_name_translations_org ON face_name_translations(organization_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ibvs.face_name_translations TO ibvs_app;
  END IF;
END $$;
