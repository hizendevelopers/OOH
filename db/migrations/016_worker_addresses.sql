-- Street address entered by the worker on a visit, when the imported list has none. Append-only: the latest row wins.
CREATE TABLE face_addresses (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id),
  face_id text NOT NULL REFERENCES billboard_faces(id),
  assignment_id text NOT NULL REFERENCES assignments(id),
  address text NOT NULL CHECK (length(trim(address)) BETWEEN 5 AND 300),
  recorded_by text NOT NULL REFERENCES "user"(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX face_addresses_latest ON face_addresses(face_id, recorded_at DESC, id DESC);
CREATE TRIGGER face_addresses_immutable BEFORE UPDATE OR DELETE ON face_addresses FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT ON ibvs.face_addresses TO ibvs_app;
  END IF;
END $$;
