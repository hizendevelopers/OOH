-- Photo bytes kept in the database itself, for hosts without a persistent disk or object storage.
-- One row per stored object, keyed like the object store. Rows are written once and never changed.
CREATE TABLE evidence_objects (
  key text PRIMARY KEY,
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 6291456),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(data) = bytes)
);
-- JPEG and HEIC are already compressed, so store them without trying to compress again.
ALTER TABLE evidence_objects ALTER COLUMN data SET STORAGE EXTERNAL;
CREATE TRIGGER evidence_objects_immutable BEFORE UPDATE OR DELETE ON evidence_objects FOR EACH ROW EXECUTE FUNCTION deny_change();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ibvs_app') THEN
    GRANT SELECT, INSERT ON ibvs.evidence_objects TO ibvs_app;
  END IF;
END $$;
