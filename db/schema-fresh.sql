-- Complete IBVS PostgreSQL schema, exported by npm run db:schema:export.

-- Target: an empty ibvs schema on Supabase PostgreSQL 17, using an administrative role.

-- This is a fresh-install schema, not an upgrade script. No operational or demo data is included.

-- Runtime credentials are configured separately; no passwords are embedded here.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('ibvs.schema.install'));

DO $ibvs_guard$ BEGIN

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ibvs')

     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ibvs') THEN

    RAISE EXCEPTION 'ibvs schema is not empty; run db/schema.sql for an existing installation';

  END IF;

END $ibvs_guard$;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS ibvs;

SET LOCAL search_path = ibvs, extensions, public;

DO $ibvs_role$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ibvs_app') THEN

    CREATE ROLE ibvs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

  END IF;

END $ibvs_role$;


-- Tables and columns. Constraints follow after all tables to support cyclic references.

CREATE TABLE ibvs."account" (
  "id" text NOT NULL,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp with time zone,
  "refreshTokenExpiresAt" timestamp with time zone,
  "scope" text,
  "password" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."activity_logs" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "category" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."analysis_admissions" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_until" timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL
);

CREATE TABLE ibvs."assignments" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "face_id" text NOT NULL,
  "worker_id" text NOT NULL,
  "assigned_by" text NOT NULL,
  "due_date" date NOT NULL,
  "status" text DEFAULT 'assigned'::text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "parent_inspection_id" text,
  "instructions" text
);

CREATE TABLE ibvs."audit_events" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "action" text NOT NULL,
  "entity_id" text NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."baseline_events" (
  "id" text NOT NULL,
  "baseline_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "operation_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."billboard_faces" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "structure_id" text NOT NULL,
  "code" text NOT NULL,
  "orientation" text DEFAULT 'unknown'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "is_test" boolean DEFAULT false NOT NULL
);

CREATE TABLE ibvs."billboard_structures" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "code" text NOT NULL,
  "city" text NOT NULL,
  "zone" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."challenges" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "assignment_id" text NOT NULL,
  "worker_id" text NOT NULL,
  "nonce" text NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_by" text
);

CREATE TABLE ibvs."evidence_parts" (
  "media_id" text NOT NULL,
  "part" integer NOT NULL,
  "hash" text NOT NULL,
  "bytes" integer NOT NULL,
  "object_key" text NOT NULL
);

CREATE TABLE ibvs."inspections" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "assignment_id" text NOT NULL,
  "face_id" text NOT NULL,
  "worker_id" text NOT NULL,
  "operation_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "status" text DEFAULT 'uploading'::text NOT NULL,
  "challenge_id" text,
  "receipt_id" text,
  "received_at" timestamp with time zone,
  "flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."location_coordinate_corrections" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "face_id" text NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "uncertainty_m" double precision NOT NULL,
  "reason" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."location_exceptions" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "assignment_id" text NOT NULL,
  "assignment_version" integer NOT NULL,
  "reason" text NOT NULL,
  "authorized_by" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."media_analysis" (
  "media_id" text NOT NULL,
  "algorithm" text NOT NULL,
  "verified_hash" text NOT NULL,
  "phash" text NOT NULL,
  "facts" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."media_evidence" (
  "id" text NOT NULL,
  "inspection_id" text NOT NULL,
  "kind" text NOT NULL,
  "expected_bytes" integer NOT NULL,
  "expected_hash" text NOT NULL,
  "server_hash" text,
  "object_key" text,
  "width" integer,
  "height" integer,
  "receipt_id" text,
  "received_at" timestamp with time zone
);

CREATE TABLE ibvs."organization_members" (
  "organization_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text
);

CREATE TABLE ibvs."organizations" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "is_demo" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."rateLimit" (
  "id" text NOT NULL,
  "key" text NOT NULL,
  "count" integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

CREATE TABLE ibvs."reference_baselines" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "face_id" text NOT NULL,
  "inspection_id" text NOT NULL,
  "version" integer NOT NULL,
  "structure_details" jsonb NOT NULL,
  "actor_id" text NOT NULL,
  "assessment_hash" text NOT NULL,
  "operation_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."reference_photos" (
  "baseline_id" text NOT NULL,
  "media_id" text NOT NULL,
  "kind" text NOT NULL,
  "original_hash" text NOT NULL
);

CREATE TABLE ibvs."review_cases" (
  "inspection_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "state" text DEFAULT 'pending'::text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "epoch" integer DEFAULT 1 NOT NULL,
  "independent_required" boolean DEFAULT false NOT NULL,
  "assessment_id" text,
  "risk_level" text DEFAULT 'unknown'::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."review_decisions" (
  "id" text NOT NULL,
  "inspection_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "actor_id" text NOT NULL,
  "operation_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "version" integer NOT NULL,
  "epoch" integer NOT NULL,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "assessment_hash" text NOT NULL,
  "identity_confirmed" boolean DEFAULT false NOT NULL,
  "risk_acknowledged" boolean DEFAULT false NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."roles" (
  "id" text NOT NULL
);

CREATE TABLE ibvs."schema_migrations" (
  "name" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."session" (
  "id" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "token" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL
);

CREATE TABLE ibvs."source_coordinates" (
  "id" text NOT NULL,
  "face_id" text NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "uncertainty_m" double precision NOT NULL,
  "source_name" text NOT NULL,
  "imported_by" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "location" geography(Point,4326) GENERATED ALWAYS AS ((st_setsrid(st_makepoint(longitude, latitude), 4326))::geography) STORED
);

CREATE TABLE ibvs."user" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "emailVerified" boolean DEFAULT false NOT NULL,
  "image" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."verification" (
  "id" text NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."verification_runs" (
  "id" text NOT NULL,
  "organization_id" text NOT NULL,
  "inspection_id" text NOT NULL,
  "rule_version" text NOT NULL,
  "assessment_hash" text NOT NULL,
  "report" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE ibvs."worker_profiles" (
  "user_id" text NOT NULL,
  "organization_id" text NOT NULL,
  "display_city" text,
  "active" boolean DEFAULT true NOT NULL
);


-- Primary keys, unique keys, validation checks and foreign keys.

ALTER TABLE ibvs."account" ADD CONSTRAINT "account_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."activity_logs" ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."analysis_admissions" ADD CONSTRAINT "analysis_admissions_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."audit_events" ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."billboard_structures" ADD CONSTRAINT "billboard_structures_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."challenges" ADD CONSTRAINT "challenges_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."evidence_parts" ADD CONSTRAINT "evidence_parts_pkey" PRIMARY KEY (media_id, part);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."media_analysis" ADD CONSTRAINT "media_analysis_pkey" PRIMARY KEY (media_id);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."organization_members" ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY (organization_id, user_id);

ALTER TABLE ibvs."organizations" ADD CONSTRAINT "organizations_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."rateLimit" ADD CONSTRAINT "rateLimit_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."reference_photos" ADD CONSTRAINT "reference_photos_pkey" PRIMARY KEY (baseline_id, kind);

ALTER TABLE ibvs."review_cases" ADD CONSTRAINT "review_cases_pkey" PRIMARY KEY (inspection_id);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."schema_migrations" ADD CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (name);

ALTER TABLE ibvs."session" ADD CONSTRAINT "session_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."user" ADD CONSTRAINT "user_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."verification" ADD CONSTRAINT "verification_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."verification_runs" ADD CONSTRAINT "verification_runs_pkey" PRIMARY KEY (id);

ALTER TABLE ibvs."worker_profiles" ADD CONSTRAINT "worker_profiles_pkey" PRIMARY KEY (user_id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_baseline_id_key" UNIQUE (baseline_id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_organization_id_actor_id_operation_id_key" UNIQUE (organization_id, actor_id, operation_id);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_organization_id_code_key" UNIQUE (organization_id, code);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_organization_id_id_key" UNIQUE (organization_id, id);

ALTER TABLE ibvs."billboard_structures" ADD CONSTRAINT "billboard_structures_organization_id_code_key" UNIQUE (organization_id, code);

ALTER TABLE ibvs."billboard_structures" ADD CONSTRAINT "billboard_structures_organization_id_id_key" UNIQUE (organization_id, id);

ALTER TABLE ibvs."challenges" ADD CONSTRAINT "challenges_consumed_by_key" UNIQUE (consumed_by);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_receipt_id_key" UNIQUE (receipt_id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_worker_id_operation_id_key" UNIQUE (worker_id, operation_id);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_inspection_id_kind_key" UNIQUE (inspection_id, kind);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_receipt_id_key" UNIQUE (receipt_id);

ALTER TABLE ibvs."organization_members" ADD CONSTRAINT "organization_members_user_id_key" UNIQUE (user_id);

ALTER TABLE ibvs."rateLimit" ADD CONSTRAINT "rateLimit_key_key" UNIQUE (key);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_face_id_version_key" UNIQUE (face_id, version);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_organization_id_actor_id_operation_id_key" UNIQUE (organization_id, actor_id, operation_id);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_inspection_id_version_key" UNIQUE (inspection_id, version);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_organization_id_actor_id_operation_id_key" UNIQUE (organization_id, actor_id, operation_id);

ALTER TABLE ibvs."session" ADD CONSTRAINT "session_token_key" UNIQUE (token);

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_face_id_key" UNIQUE (face_id);

ALTER TABLE ibvs."user" ADD CONSTRAINT "user_email_key" UNIQUE (email);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_status_check" CHECK (status = ANY (ARRAY['assigned'::text, 'server_received'::text, 'pending_review'::text, 'baseline_verified'::text, 'approved'::text, 'ambiguous'::text, 'rejected'::text, 'resurvey_requested'::text, 'superseded'::text]));

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_action_check" CHECK (action = 'withdraw'::text);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_reason_check" CHECK (length(reason) >= 5);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_code_check" CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,47}$'::text);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_description_check" CHECK (length(description) <= 1000);

ALTER TABLE ibvs."evidence_parts" ADD CONSTRAINT "evidence_parts_part_check" CHECK (part >= 0 AND part <= 23);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_status_check" CHECK (status = ANY (ARRAY['uploading'::text, 'server_received'::text]));

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_latitude_check" CHECK (latitude >= '-90'::integer::double precision AND latitude <= 90::double precision);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_longitude_check" CHECK (longitude >= '-180'::integer::double precision AND longitude <= 180::double precision);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_reason_check" CHECK (length(TRIM(BOTH FROM reason)) >= 10 AND length(TRIM(BOTH FROM reason)) <= 1000);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_uncertainty_m_check" CHECK (uncertainty_m >= 0::double precision AND uncertainty_m <= 10000::double precision);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_assignment_version_check" CHECK (assignment_version > 0);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_check" CHECK (expires_at > created_at AND expires_at <= (created_at + '24:00:00'::interval));

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_reason_check" CHECK (length(TRIM(BOTH FROM reason)) >= 10 AND length(TRIM(BOTH FROM reason)) <= 1000);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_expected_bytes_check" CHECK (expected_bytes >= 1 AND expected_bytes <= 6291456);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_kind_check" CHECK (kind = ANY (ARRAY['front'::text, 'wide'::text]));

ALTER TABLE ibvs."reference_photos" ADD CONSTRAINT "reference_photos_kind_check" CHECK (kind = ANY (ARRAY['front'::text, 'wide'::text]));

ALTER TABLE ibvs."review_cases" ADD CONSTRAINT "review_cases_state_check" CHECK (state = ANY (ARRAY['pending'::text, 'ambiguous'::text, 'approved'::text, 'rejected'::text, 'resurvey_requested'::text]));

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_action_check" CHECK (action = ANY (ARRAY['approve'::text, 'reject'::text, 'resurvey'::text, 'ambiguous'::text]));

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_reason_check" CHECK (length(reason) >= 5);

ALTER TABLE ibvs."roles" ADD CONSTRAINT "roles_id_check" CHECK (id = ANY (ARRAY['admin'::text, 'worker'::text]));

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_latitude_check" CHECK (latitude >= '-90'::integer::double precision AND latitude <= 90::double precision);

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_longitude_check" CHECK (longitude >= '-180'::integer::double precision AND longitude <= 180::double precision);

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_uncertainty_m_check" CHECK (uncertainty_m >= 0::double precision AND uncertainty_m <= 10000::double precision);

ALTER TABLE ibvs."account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ibvs."activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."analysis_admissions" ADD CONSTRAINT "analysis_admissions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."analysis_admissions" ADD CONSTRAINT "analysis_admissions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_assigned_by_fkey" FOREIGN KEY (assigned_by) REFERENCES "user"(id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_organization_id_face_id_fkey" FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_organization_id_worker_id_fkey" FOREIGN KEY (organization_id, worker_id) REFERENCES organization_members(organization_id, user_id);

ALTER TABLE ibvs."assignments" ADD CONSTRAINT "assignments_parent_inspection_id_fkey" FOREIGN KEY (parent_inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."audit_events" ADD CONSTRAINT "audit_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_baseline_id_fkey" FOREIGN KEY (baseline_id) REFERENCES reference_baselines(id);

ALTER TABLE ibvs."baseline_events" ADD CONSTRAINT "baseline_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."billboard_faces" ADD CONSTRAINT "billboard_faces_organization_id_structure_id_fkey" FOREIGN KEY (organization_id, structure_id) REFERENCES billboard_structures(organization_id, id);

ALTER TABLE ibvs."billboard_structures" ADD CONSTRAINT "billboard_structures_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."challenges" ADD CONSTRAINT "challenges_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES assignments(id);

ALTER TABLE ibvs."challenges" ADD CONSTRAINT "challenges_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."challenges" ADD CONSTRAINT "challenges_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES "user"(id);

ALTER TABLE ibvs."evidence_parts" ADD CONSTRAINT "evidence_parts_media_id_fkey" FOREIGN KEY (media_id) REFERENCES media_evidence(id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES assignments(id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_face_id_fkey" FOREIGN KEY (face_id) REFERENCES billboard_faces(id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."inspections" ADD CONSTRAINT "inspections_worker_id_fkey" FOREIGN KEY (worker_id) REFERENCES "user"(id);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_created_by_fkey" FOREIGN KEY (created_by) REFERENCES "user"(id);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_organization_id_face_id_fkey" FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id);

ALTER TABLE ibvs."location_coordinate_corrections" ADD CONSTRAINT "location_coordinate_corrections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_assignment_id_fkey" FOREIGN KEY (assignment_id) REFERENCES assignments(id);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_authorized_by_fkey" FOREIGN KEY (authorized_by) REFERENCES "user"(id);

ALTER TABLE ibvs."location_exceptions" ADD CONSTRAINT "location_exceptions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."media_analysis" ADD CONSTRAINT "media_analysis_media_id_fkey" FOREIGN KEY (media_id) REFERENCES media_evidence(id);

ALTER TABLE ibvs."media_evidence" ADD CONSTRAINT "media_evidence_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."organization_members" ADD CONSTRAINT "organization_members_role_fkey" FOREIGN KEY (role) REFERENCES roles(id);

ALTER TABLE ibvs."organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "user"(id);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_face_id_fkey" FOREIGN KEY (face_id) REFERENCES billboard_faces(id);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."reference_baselines" ADD CONSTRAINT "reference_baselines_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."reference_photos" ADD CONSTRAINT "reference_photos_baseline_id_fkey" FOREIGN KEY (baseline_id) REFERENCES reference_baselines(id);

ALTER TABLE ibvs."reference_photos" ADD CONSTRAINT "reference_photos_media_id_fkey" FOREIGN KEY (media_id) REFERENCES media_evidence(id);

ALTER TABLE ibvs."review_cases" ADD CONSTRAINT "review_cases_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."review_cases" ADD CONSTRAINT "review_cases_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES "user"(id);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."review_decisions" ADD CONSTRAINT "review_decisions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_face_id_fkey" FOREIGN KEY (face_id) REFERENCES billboard_faces(id);

ALTER TABLE ibvs."source_coordinates" ADD CONSTRAINT "source_coordinates_imported_by_fkey" FOREIGN KEY (imported_by) REFERENCES "user"(id);

ALTER TABLE ibvs."verification_runs" ADD CONSTRAINT "verification_runs_inspection_id_fkey" FOREIGN KEY (inspection_id) REFERENCES inspections(id);

ALTER TABLE ibvs."verification_runs" ADD CONSTRAINT "verification_runs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."worker_profiles" ADD CONSTRAINT "worker_profiles_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE ibvs."worker_profiles" ADD CONSTRAINT "worker_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES "user"(id);


-- Additional indexes, including active-assignment uniqueness and PostGIS GiST.

CREATE INDEX account_user ON ibvs.account USING btree ("userId");

CREATE INDEX analysis_admissions_org ON ibvs.analysis_admissions USING btree (organization_id, started_at);

CREATE UNIQUE INDEX assignments_active_face ON ibvs.assignments USING btree (face_id) WHERE (status = ANY (ARRAY['assigned'::text, 'server_received'::text, 'pending_review'::text, 'resurvey_requested'::text, 'ambiguous'::text]));

CREATE UNIQUE INDEX assignments_one_followup ON ibvs.assignments USING btree (parent_inspection_id) WHERE (parent_inspection_id IS NOT NULL);

CREATE INDEX assignments_worker ON ibvs.assignments USING btree (organization_id, worker_id, due_date);

CREATE INDEX audit_org_time ON ibvs.audit_events USING btree (organization_id, created_at DESC);

CREATE INDEX challenges_task ON ibvs.challenges USING btree (assignment_id, worker_id, issued_at);

CREATE UNIQUE INDEX inspections_one_active ON ibvs.inspections USING btree (assignment_id);

CREATE INDEX inspections_received_queue ON ibvs.inspections USING btree (organization_id, received_at DESC, id DESC) WHERE (status = 'server_received'::text);

CREATE INDEX inspections_worker ON ibvs.inspections USING btree (organization_id, worker_id, created_at);

CREATE INDEX coordinate_corrections_latest ON ibvs.location_coordinate_corrections USING btree (face_id, created_at DESC, id DESC);

CREATE INDEX coordinate_corrections_org ON ibvs.location_coordinate_corrections USING btree (organization_id);

CREATE INDEX location_exceptions_assignment ON ibvs.location_exceptions USING btree (assignment_id, assignment_version, expires_at DESC);

CREATE INDEX location_exceptions_org ON ibvs.location_exceptions USING btree (organization_id);

CREATE INDEX media_hash ON ibvs.media_evidence USING btree (server_hash);

CREATE INDEX review_queue ON ibvs.review_cases USING btree (organization_id, state, updated_at);

CREATE INDEX session_user_idx ON ibvs.session USING btree ("userId");

CREATE INDEX source_location_gist ON ibvs.source_coordinates USING gist (location);

CREATE INDEX verification_inspection ON ibvs.verification_runs USING btree (inspection_id, created_at DESC);


-- Immutable-evidence and identity protection functions/triggers.

CREATE OR REPLACE FUNCTION ibvs.deny_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN RAISE EXCEPTION 'Immutable record'; END $function$;

CREATE OR REPLACE FUNCTION ibvs.protect_complete_media()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN IF OLD.receipt_id IS NOT NULL THEN RAISE EXCEPTION 'Received media is immutable'; END IF; RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION ibvs.protect_face_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.code IS DISTINCT FROM OLD.code OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.structure_id IS DISTINCT FROM OLD.structure_id THEN RAISE EXCEPTION 'Immutable face identity'; END IF; RETURN NEW; END $function$;

CREATE OR REPLACE FUNCTION ibvs.protect_received_inspection()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$ BEGIN IF OLD.status='server_received' THEN RAISE EXCEPTION 'Received inspection is immutable'; END IF; RETURN NEW; END $function$;

CREATE TRIGGER audit_immutable BEFORE DELETE OR UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER baseline_events_immutable BEFORE DELETE OR UPDATE ON baseline_events FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER face_identity_immutable BEFORE UPDATE ON billboard_faces FOR EACH ROW EXECUTE FUNCTION protect_face_identity();

CREATE TRIGGER parts_immutable BEFORE DELETE OR UPDATE ON evidence_parts FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER received_inspection_immutable BEFORE DELETE OR UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION protect_received_inspection();

CREATE TRIGGER coordinate_corrections_immutable BEFORE DELETE OR UPDATE ON location_coordinate_corrections FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER location_exceptions_immutable BEFORE DELETE OR UPDATE ON location_exceptions FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER media_analysis_immutable BEFORE DELETE OR UPDATE ON media_analysis FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER complete_media_immutable BEFORE DELETE OR UPDATE ON media_evidence FOR EACH ROW EXECUTE FUNCTION protect_complete_media();

CREATE TRIGGER reference_baselines_immutable BEFORE DELETE OR UPDATE ON reference_baselines FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER reference_photos_immutable BEFORE DELETE OR UPDATE ON reference_photos FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER review_decisions_immutable BEFORE DELETE OR UPDATE ON review_decisions FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER source_immutable BEFORE DELETE OR UPDATE ON source_coordinates FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE TRIGGER verification_runs_immutable BEFORE DELETE OR UPDATE ON verification_runs FOR EACH ROW EXECUTE FUNCTION deny_change();

CREATE VIEW ibvs."effective_source_coordinates" WITH (security_invoker = true) AS SELECT c.id,
    c.face_id,
    COALESCE(latest.latitude, c.latitude) AS latitude,
    COALESCE(latest.longitude, c.longitude) AS longitude,
    COALESCE(latest.uncertainty_m, c.uncertainty_m) AS uncertainty_m,
    c.source_name,
    c.imported_by,
    c.imported_at,
    c.latitude AS original_latitude,
    c.longitude AS original_longitude,
    c.uncertainty_m AS original_uncertainty_m,
    latest.id AS correction_id
   FROM (source_coordinates c
     LEFT JOIN LATERAL ( SELECT r.id,
            r.latitude,
            r.longitude,
            r.uncertainty_m
           FROM location_coordinate_corrections r
          WHERE (r.face_id = c.face_id)
          ORDER BY r.created_at DESC, r.id DESC
         LIMIT 1) latest ON (true));


-- Required reference values and migration ledger; no business records.

INSERT INTO ibvs.roles(id) VALUES ('admin'),('worker');

INSERT INTO ibvs.schema_migrations(name) VALUES
  ('001_core.sql'),
  ('002_inspections.sql'),
  ('003_human_review.sql'),
  ('004_analysis_admission.sql'),
  ('005_review_queue_index.sql'),
  ('006_location_management.sql');


-- Restricted application-role permissions and private-schema protection.

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

COMMIT;
