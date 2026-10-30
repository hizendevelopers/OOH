-- IBVS repeatable setup and upgrade script for Supabase SQL Editor (postgres).
-- Safe to rerun: completed migrations are skipped and existing records are preserved.
-- db/schema-fresh.sql is the separate final-DDL snapshot for empty schemas only.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('ibvs.schema.install'));
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS ibvs;
SET LOCAL search_path = ibvs, extensions, public;
DO $ibvs_ledger_guard$ BEGIN
  IF to_regclass('ibvs.schema_migrations') IS NULL AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ibvs') THEN
    RAISE EXCEPTION 'Existing ibvs tables have no migration ledger; inspect before applying upgrades';
  END IF;
END $ibvs_ledger_guard$;
CREATE TABLE IF NOT EXISTS ibvs.schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
DO $ibvs_role$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ibvs_app') THEN
    CREATE ROLE ibvs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $ibvs_role$;

-- 001_core.sql
DO $ibvs_apply_1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='001_core.sql') THEN
    EXECUTE $ibvs_sql_1$
CREATE TABLE IF NOT EXISTS "user" (id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, "emailVerified" boolean NOT NULL DEFAULT false, image text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS session (id text PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text UNIQUE NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX session_user_idx ON session("userId");
CREATE TABLE IF NOT EXISTS account (id text PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE INDEX account_user ON account("userId");
CREATE TABLE IF NOT EXISTS verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "rateLimit" (id text PRIMARY KEY, key text UNIQUE NOT NULL, count integer NOT NULL, "lastRequest" bigint NOT NULL);
CREATE TABLE organizations (id text PRIMARY KEY, name text NOT NULL, is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE roles (id text PRIMARY KEY CHECK(id IN ('admin','worker')));
INSERT INTO roles VALUES ('admin'),('worker');
CREATE TABLE organization_members (organization_id text REFERENCES organizations(id), user_id text REFERENCES "user"(id), role text REFERENCES roles(id), PRIMARY KEY(organization_id,user_id), UNIQUE(user_id));
CREATE TABLE worker_profiles (user_id text PRIMARY KEY REFERENCES "user"(id), organization_id text NOT NULL REFERENCES organizations(id), display_city text, active boolean NOT NULL DEFAULT true);
CREATE TABLE billboard_structures (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), code text NOT NULL, city text NOT NULL, zone text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,code), UNIQUE(organization_id,id));
CREATE TABLE billboard_faces (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), structure_id text NOT NULL, code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{2,47}$'), orientation text NOT NULL DEFAULT 'unknown', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,code), UNIQUE(organization_id,id), FOREIGN KEY(organization_id,structure_id) REFERENCES billboard_structures(organization_id,id));
CREATE TABLE source_coordinates (id text PRIMARY KEY, face_id text NOT NULL UNIQUE REFERENCES billboard_faces(id), latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), uncertainty_m double precision NOT NULL CHECK(uncertainty_m BETWEEN 0 AND 10000), source_name text NOT NULL, imported_by text NOT NULL REFERENCES "user"(id), imported_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE assignments (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), face_id text NOT NULL, worker_id text NOT NULL, assigned_by text NOT NULL REFERENCES "user"(id), due_date date NOT NULL, status text NOT NULL DEFAULT 'assigned' CHECK(status IN ('assigned','server_received','pending_review','baseline_verified','rejected','resurvey_requested')), version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(organization_id,face_id) REFERENCES billboard_faces(organization_id,id), FOREIGN KEY(organization_id,worker_id) REFERENCES organization_members(organization_id,user_id));
CREATE UNIQUE INDEX assignments_active_face ON assignments(face_id) WHERE status IN ('assigned','server_received','pending_review','resurvey_requested');
CREATE INDEX assignments_worker ON assignments(organization_id,worker_id,due_date);
CREATE TABLE audit_events (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_org_time ON audit_events(organization_id,created_at DESC);
CREATE TABLE activity_logs (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION deny_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable record'; END $$;
CREATE TRIGGER source_immutable BEFORE UPDATE OR DELETE ON source_coordinates FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE FUNCTION protect_face_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.structure_id IS DISTINCT FROM OLD.structure_id THEN RAISE EXCEPTION 'Immutable face identity'; END IF; RETURN NEW; END $$;
CREATE TRIGGER face_identity_immutable BEFORE UPDATE ON billboard_faces FOR EACH ROW EXECUTE FUNCTION protect_face_identity();
$ibvs_sql_1$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('001_core.sql');
  END IF;
END $ibvs_apply_1$;

-- 002_inspections.sql
DO $ibvs_apply_2$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='002_inspections.sql') THEN
    EXECUTE $ibvs_sql_2$
CREATE TABLE challenges (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), assignment_id text NOT NULL REFERENCES assignments(id), worker_id text NOT NULL REFERENCES "user"(id), nonce text NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_by text UNIQUE);
CREATE INDEX challenges_task ON challenges(assignment_id,worker_id,issued_at);
CREATE TABLE inspections (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), assignment_id text NOT NULL REFERENCES assignments(id), face_id text NOT NULL REFERENCES billboard_faces(id), worker_id text NOT NULL REFERENCES "user"(id), operation_id text NOT NULL, payload_hash text NOT NULL, metadata jsonb NOT NULL, status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','server_received')), challenge_id text REFERENCES challenges(id), receipt_id text UNIQUE, received_at timestamptz, flags jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(worker_id,operation_id));
CREATE UNIQUE INDEX inspections_one_active ON inspections(assignment_id);
CREATE INDEX inspections_worker ON inspections(organization_id,worker_id,created_at);
CREATE TABLE media_evidence (id text PRIMARY KEY, inspection_id text NOT NULL REFERENCES inspections(id), kind text NOT NULL CHECK(kind IN ('front','wide')), expected_bytes integer NOT NULL CHECK(expected_bytes BETWEEN 1 AND 6291456), expected_hash text NOT NULL, server_hash text, object_key text, width integer, height integer, receipt_id text UNIQUE, received_at timestamptz, UNIQUE(inspection_id,kind));
CREATE INDEX media_hash ON media_evidence(server_hash);
CREATE TABLE evidence_parts (media_id text NOT NULL REFERENCES media_evidence(id), part integer NOT NULL CHECK(part BETWEEN 0 AND 23), hash text NOT NULL, bytes integer NOT NULL, object_key text NOT NULL, PRIMARY KEY(media_id,part));
CREATE TRIGGER parts_immutable BEFORE UPDATE OR DELETE ON evidence_parts FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE FUNCTION protect_received_inspection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status='server_received' THEN RAISE EXCEPTION 'Received inspection is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER received_inspection_immutable BEFORE UPDATE OR DELETE ON inspections FOR EACH ROW EXECUTE FUNCTION protect_received_inspection();
$ibvs_sql_2$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('002_inspections.sql');
  END IF;
END $ibvs_apply_2$;

-- 003_human_review.sql
DO $ibvs_apply_3$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='003_human_review.sql') THEN
    EXECUTE $ibvs_sql_3$
ALTER TABLE assignments DROP CONSTRAINT assignments_status_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_status_check CHECK(status IN ('assigned','server_received','pending_review','baseline_verified','approved','ambiguous','rejected','resurvey_requested','superseded'));
ALTER TABLE assignments ADD COLUMN parent_inspection_id text REFERENCES inspections(id);
ALTER TABLE assignments ADD COLUMN instructions text;
DROP INDEX assignments_active_face;
CREATE UNIQUE INDEX assignments_active_face ON assignments(face_id) WHERE status IN ('assigned','server_received','pending_review','resurvey_requested','ambiguous');
CREATE UNIQUE INDEX assignments_one_followup ON assignments(parent_inspection_id) WHERE parent_inspection_id IS NOT NULL;
CREATE TABLE review_cases (inspection_id text PRIMARY KEY REFERENCES inspections(id), organization_id text NOT NULL REFERENCES organizations(id), state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ambiguous','approved','rejected','resurvey_requested')), version integer NOT NULL DEFAULT 1, epoch integer NOT NULL DEFAULT 1, independent_required boolean NOT NULL DEFAULT false, assessment_id text, risk_level text NOT NULL DEFAULT 'unknown', updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX review_queue ON review_cases(organization_id,state,updated_at);
INSERT INTO review_cases(inspection_id,organization_id) SELECT id,organization_id FROM inspections WHERE status='server_received';
CREATE TABLE media_analysis (media_id text PRIMARY KEY REFERENCES media_evidence(id), algorithm text NOT NULL, verified_hash text NOT NULL, phash text NOT NULL, facts jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE verification_runs (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), inspection_id text NOT NULL REFERENCES inspections(id), rule_version text NOT NULL, assessment_hash text NOT NULL, report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX verification_inspection ON verification_runs(inspection_id,created_at DESC);
CREATE TABLE review_decisions (id text PRIMARY KEY, inspection_id text NOT NULL REFERENCES inspections(id), organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), operation_id text NOT NULL, payload_hash text NOT NULL, version integer NOT NULL, epoch integer NOT NULL, action text NOT NULL CHECK(action IN ('approve','reject','resurvey','ambiguous')), reason text NOT NULL CHECK(length(reason)>=5), assessment_hash text NOT NULL, identity_confirmed boolean NOT NULL DEFAULT false, risk_acknowledged boolean NOT NULL DEFAULT false, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(inspection_id,version), UNIQUE(organization_id,actor_id,operation_id));
CREATE TABLE reference_baselines (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), face_id text NOT NULL REFERENCES billboard_faces(id), inspection_id text NOT NULL REFERENCES inspections(id), version integer NOT NULL, structure_details jsonb NOT NULL, actor_id text NOT NULL REFERENCES "user"(id), assessment_hash text NOT NULL, operation_id text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(face_id,version), UNIQUE(organization_id,actor_id,operation_id));
CREATE TABLE reference_photos (baseline_id text NOT NULL REFERENCES reference_baselines(id), media_id text NOT NULL REFERENCES media_evidence(id), kind text NOT NULL CHECK(kind IN ('front','wide')), original_hash text NOT NULL, PRIMARY KEY(baseline_id,kind));
CREATE TABLE baseline_events (id text PRIMARY KEY, baseline_id text NOT NULL REFERENCES reference_baselines(id), organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), action text NOT NULL CHECK(action='withdraw'), reason text NOT NULL CHECK(length(reason)>=5), operation_id text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(baseline_id), UNIQUE(organization_id,actor_id,operation_id));
CREATE TRIGGER media_analysis_immutable BEFORE UPDATE OR DELETE ON media_analysis FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER verification_runs_immutable BEFORE UPDATE OR DELETE ON verification_runs FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE OR DELETE ON review_decisions FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER reference_baselines_immutable BEFORE UPDATE OR DELETE ON reference_baselines FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER reference_photos_immutable BEFORE UPDATE OR DELETE ON reference_photos FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE TRIGGER baseline_events_immutable BEFORE UPDATE OR DELETE ON baseline_events FOR EACH ROW EXECUTE FUNCTION deny_change();
CREATE FUNCTION protect_complete_media() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.receipt_id IS NOT NULL THEN RAISE EXCEPTION 'Received media is immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER complete_media_immutable BEFORE UPDATE OR DELETE ON media_evidence FOR EACH ROW EXECUTE FUNCTION protect_complete_media();
$ibvs_sql_3$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('003_human_review.sql');
  END IF;
END $ibvs_apply_3$;

-- 004_analysis_admission.sql
DO $ibvs_apply_4$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='004_analysis_admission.sql') THEN
    EXECUTE $ibvs_sql_4$
CREATE TABLE analysis_admissions (id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id), actor_id text NOT NULL REFERENCES "user"(id), started_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz NOT NULL DEFAULT now()+interval '5 minutes');
CREATE INDEX analysis_admissions_org ON analysis_admissions(organization_id,started_at);
$ibvs_sql_4$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('004_analysis_admission.sql');
  END IF;
END $ibvs_apply_4$;

-- 005_review_queue_index.sql
DO $ibvs_apply_5$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='005_review_queue_index.sql') THEN
    EXECUTE $ibvs_sql_5$
CREATE INDEX inspections_received_queue ON inspections(organization_id,received_at DESC,id DESC) WHERE status='server_received';
$ibvs_sql_5$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('005_review_queue_index.sql');
  END IF;
END $ibvs_apply_5$;

-- 006_location_management.sql
DO $ibvs_apply_6$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name='006_location_management.sql') THEN
    EXECUTE $ibvs_sql_6$
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
$ibvs_sql_6$;
    INSERT INTO ibvs.schema_migrations(name) VALUES ('006_location_management.sql');
  END IF;
END $ibvs_apply_6$;
-- Production-only, after the portable core migration. Run using migration credentials.
CREATE EXTENSION IF NOT EXISTS postgis;
ALTER TABLE source_coordinates ADD COLUMN IF NOT EXISTS location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED;
CREATE INDEX IF NOT EXISTS source_location_gist ON source_coordinates USING gist(location);
-- Example M3 candidate query: ST_DWithin(location, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
-- Apply after the portable migrations in the private ibvs schema, as postgres.
-- App tables stay outside the Supabase Data API; the Next.js API owns access.
REVOKE ALL ON SCHEMA ibvs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA ibvs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ibvs FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA ibvs REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER FUNCTION ibvs.deny_change() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_face_identity() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_received_inspection() SET search_path = pg_catalog;
ALTER FUNCTION ibvs.protect_complete_media() SET search_path = pg_catalog;

GRANT USAGE ON SCHEMA ibvs, extensions TO ibvs_app;
GRANT SELECT ON ALL TABLES IN SCHEMA ibvs TO ibvs_app;
GRANT INSERT ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.organization_members, ibvs.worker_profiles,
  ibvs.billboard_structures, ibvs.billboard_faces, ibvs.source_coordinates,
  ibvs.assignments, ibvs.audit_events, ibvs.activity_logs, ibvs.challenges,
  ibvs.inspections, ibvs.media_evidence, ibvs.evidence_parts, ibvs.review_cases,
  ibvs.media_analysis, ibvs.verification_runs, ibvs.review_decisions,
  ibvs.reference_baselines, ibvs.reference_photos, ibvs.baseline_events,
  ibvs.analysis_admissions, ibvs.location_coordinate_corrections, ibvs.location_exceptions TO ibvs_app;
GRANT UPDATE ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.worker_profiles, ibvs.assignments, ibvs.challenges,
  ibvs.inspections, ibvs.media_evidence, ibvs.review_cases,
  ibvs.analysis_admissions TO ibvs_app;
-- Organization row locks serialize imports and review operations.
GRANT UPDATE (name) ON ibvs.organizations TO ibvs_app;
-- Assignments lock face rows; PostgreSQL requires an UPDATE privilege for this.
GRANT UPDATE (orientation) ON ibvs.billboard_faces TO ibvs_app;
GRANT DELETE ON ibvs."user", ibvs.session, ibvs.account, ibvs.verification,
  ibvs."rateLimit", ibvs.analysis_admissions TO ibvs_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ibvs TO ibvs_app;
ALTER ROLE ibvs_app SET search_path = ibvs, extensions, public;

-- Supabase's automatic RLS event trigger runs as its owner, not through the API.
DO $$ BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
DO $ibvs_verify$
DECLARE missing text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name) INTO missing FROM unnest(ARRAY['account','activity_logs','analysis_admissions','assignments','audit_events','baseline_events','billboard_faces','billboard_structures','challenges','evidence_parts','inspections','location_coordinate_corrections','location_exceptions','media_analysis','media_evidence','organization_members','organizations','rateLimit','reference_baselines','reference_photos','review_cases','review_decisions','roles','schema_migrations','session','source_coordinates','user','verification','verification_runs','worker_profiles']) AS required(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ibvs' AND tablename=required.name);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Migration ledger and schema differ; missing tables: %', missing; END IF;
END $ibvs_verify$;
COMMIT;
SELECT 'ready' AS status, 'ibvs' AS schema, (SELECT count(*) FROM pg_tables WHERE schemaname='ibvs') AS tables, (SELECT count(*) FROM ibvs.schema_migrations) AS migrations;
