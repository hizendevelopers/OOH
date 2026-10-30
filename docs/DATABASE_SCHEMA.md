# Complete database schema

The current application uses the private `ibvs` schema in Supabase project `utokgrudjgnvypzxufcx`. This reference and the SQL file are generated from a consistent, read-only snapshot of the live database.

**Inventory:** 30 tables, 56 foreign keys, 69 indexes, 4 trigger functions, 14 triggers, and PostGIS geography.

## Files and installation

- [Repeatable setup SQL](../db/schema.sql): run in Supabase SQL Editor as `postgres` for a new or existing installation. Completed migrations are skipped and existing records are preserved. The result is `ready` with table and migration counts.
- [Fresh-install DDL snapshot](../db/schema-fresh.sql): final table definitions for an empty schema only; its guard deliberately rejects an existing database.
- [ER diagrams](DATABASE_ERD.md): relationships grouped by workflow.
- [Supabase connection setup](SUPABASE_SETUP.md): credentials, verified TLS and runtime configuration.
- [Portable upgrades](../db/migrations/): source migrations used by the repeatable setup and migration runner.

The connected project already has this schema; no reinstall is needed. For a new Supabase project, run `db/schema.sql` in its SQL Editor as `postgres`. The script creates the restricted `ibvs_app` role without embedding a password. Configure its password separately with secure administrative tooling, then set the server-only `DATABASE_URL`, `DATABASE_SCHEMA=ibvs` and TLS certificate settings. Initialize the actual organization and real accounts using administrative provisioning; `npm run db:bootstrap` creates only the internal no-login workspace actor. No sample inventory, workers, assignments or evidence is seeded.

To refresh these artifacts from the connected database, run `npm run db:schema:export`. This reads schema metadata only; it does not dump users, password hashes, sessions, photos or business data.

## End-to-end data flow

Organization and user membership → physical structure → billboard face → immutable imported coordinate → worker assignment → capture challenge/inspection → resumable photo parts → server receipt → image analysis and versioned risk assessment → human review decision → explicit reference enrollment or withdrawal/resurvey → audit history.

Original image bytes live in the configured private evidence directory. `media_evidence` and `evidence_parts` store private object keys, byte counts and hashes; the schema does not pretend to store the JPEG bytes in PostgreSQL.

## Access and integrity

Application tables are outside the public Data API. The server's `ibvs_app` role has explicit grants; it cannot create schema objects or delete immutable source/audit records. API services enforce administrator/worker and organization scope. This is a trusted-server access model, not Supabase Auth JWT/RLS authorization. Better Auth identities in `ibvs.user` are separate from `auth.users`.

Primary/foreign/unique keys, coordinate ranges, upload limits and status checks are database constraints. The twelve triggers protect imported coordinates, face identity, received inspections/photos, analysis records, decisions, baseline records and audit events. Atomic service transactions, operation IDs, payload hashes and versions implement replay protection and concurrency checks.

`review_cases.assessment_id` and `challenges.consumed_by` are logical service links rather than foreign-key constraints. `reference_photos.original_hash` and other hash fields preserve original identities without being table references. The dictionary below lists the actual database constraints without inventing extra relationships.

## Identity and organizations

### organizations

Organization boundary and demo marker.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `name` | `text` | No | — |
| `is_demo` | `boolean` | No | `false` |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `organizations_pkey`: `PRIMARY KEY (id)`

### roles

Supported application roles: admin and worker.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |

Constraints:

- `roles_pkey`: `PRIMARY KEY (id)`
- `roles_id_check`: `CHECK (id = ANY (ARRAY['admin'::text, 'worker'::text]))`

### user

Application identities managed by Better Auth; separate from Supabase auth.users.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `name` | `text` | No | — |
| `email` | `text` | No | — |
| `emailVerified` | `boolean` | No | `false` |
| `image` | `text` | Yes | — |
| `createdAt` | `timestamp with time zone` | No | `now()` |
| `updatedAt` | `timestamp with time zone` | No | `now()` |

Constraints:

- `user_pkey`: `PRIMARY KEY (id)`
- `user_email_key`: `UNIQUE (email)`

### organization_members

One organization and role per application user.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `organization_id` | `text` | No | — |
| `user_id` | `text` | No | — |
| `role` | `text` | Yes | — |

Constraints:

- `organization_members_pkey`: `PRIMARY KEY (organization_id, user_id)`
- `organization_members_user_id_key`: `UNIQUE (user_id)`
- `organization_members_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `organization_members_role_fkey`: `FOREIGN KEY (role) REFERENCES roles(id)`
- `organization_members_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES "user"(id)`

### worker_profiles

Active field-worker profile and display city.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `user_id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `display_city` | `text` | Yes | — |
| `active` | `boolean` | No | `true` |

Constraints:

- `worker_profiles_pkey`: `PRIMARY KEY (user_id)`
- `worker_profiles_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `worker_profiles_user_id_fkey`: `FOREIGN KEY (user_id) REFERENCES "user"(id)`

### account

Authentication provider accounts and password hashes.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `accountId` | `text` | No | — |
| `providerId` | `text` | No | — |
| `userId` | `text` | No | — |
| `accessToken` | `text` | Yes | — |
| `refreshToken` | `text` | Yes | — |
| `idToken` | `text` | Yes | — |
| `accessTokenExpiresAt` | `timestamp with time zone` | Yes | — |
| `refreshTokenExpiresAt` | `timestamp with time zone` | Yes | — |
| `scope` | `text` | Yes | — |
| `password` | `text` | Yes | — |
| `createdAt` | `timestamp with time zone` | No | `now()` |
| `updatedAt` | `timestamp with time zone` | No | `now()` |

Constraints:

- `account_pkey`: `PRIMARY KEY (id)`
- `account_userId_fkey`: `FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`

Additional indexes:

- `CREATE INDEX account_user ON ibvs.account USING btree ("userId")`

### session

Expiring application sessions.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `expiresAt` | `timestamp with time zone` | No | — |
| `token` | `text` | No | — |
| `createdAt` | `timestamp with time zone` | No | `now()` |
| `updatedAt` | `timestamp with time zone` | No | `now()` |
| `ipAddress` | `text` | Yes | — |
| `userAgent` | `text` | Yes | — |
| `userId` | `text` | No | — |

Constraints:

- `session_pkey`: `PRIMARY KEY (id)`
- `session_token_key`: `UNIQUE (token)`
- `session_userId_fkey`: `FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE`

Additional indexes:

- `CREATE INDEX session_user_idx ON ibvs.session USING btree ("userId")`

### verification

Expiring authentication verification values.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `identifier` | `text` | No | — |
| `value` | `text` | No | — |
| `expiresAt` | `timestamp with time zone` | No | — |
| `createdAt` | `timestamp with time zone` | No | `now()` |
| `updatedAt` | `timestamp with time zone` | No | `now()` |

Constraints:

- `verification_pkey`: `PRIMARY KEY (id)`

### rateLimit

Authentication request rate-limit counters.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `key` | `text` | No | — |
| `count` | `integer` | No | — |
| `lastRequest` | `bigint` | No | — |

Constraints:

- `rateLimit_pkey`: `PRIMARY KEY (id)`
- `rateLimit_key_key`: `UNIQUE (key)`

## Inventory

### billboard_structures

Physical billboard structures, scoped to an organization.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `code` | `text` | No | — |
| `city` | `text` | No | — |
| `zone` | `text` | No | `''::text` |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `billboard_structures_pkey`: `PRIMARY KEY (id)`
- `billboard_structures_organization_id_code_key`: `UNIQUE (organization_id, code)`
- `billboard_structures_organization_id_id_key`: `UNIQUE (organization_id, id)`
- `billboard_structures_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

### billboard_faces

Stable face identity within a physical structure.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `structure_id` | `text` | No | — |
| `code` | `text` | No | — |
| `orientation` | `text` | No | `'unknown'::text` |
| `created_at` | `timestamp with time zone` | No | `now()` |
| `description` | `text` | No | `''::text` |
| `is_test` | `boolean` | No | `false` |

Constraints:

- `billboard_faces_pkey`: `PRIMARY KEY (id)`
- `billboard_faces_organization_id_code_key`: `UNIQUE (organization_id, code)`
- `billboard_faces_organization_id_id_key`: `UNIQUE (organization_id, id)`
- `billboard_faces_code_check`: `CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,47}$'::text)`
- `billboard_faces_description_check`: `CHECK (length(description) <= 1000)`
- `billboard_faces_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `billboard_faces_organization_id_structure_id_fkey`: `FOREIGN KEY (organization_id, structure_id) REFERENCES billboard_structures(organization_id, id)`

Triggers:

- `CREATE TRIGGER face_identity_immutable BEFORE UPDATE ON billboard_faces FOR EACH ROW EXECUTE FUNCTION protect_face_identity()`

### source_coordinates

Immutable imported coordinates, uncertainty and spatial geography.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `face_id` | `text` | No | — |
| `latitude` | `double precision` | No | — |
| `longitude` | `double precision` | No | — |
| `uncertainty_m` | `double precision` | No | — |
| `source_name` | `text` | No | — |
| `imported_by` | `text` | No | — |
| `imported_at` | `timestamp with time zone` | No | `now()` |
| `location` | `geography(Point,4326)` | Yes | Generated: `(st_setsrid(st_makepoint(longitude, latitude), 4326))::geography` |

Constraints:

- `source_coordinates_pkey`: `PRIMARY KEY (id)`
- `source_coordinates_face_id_key`: `UNIQUE (face_id)`
- `source_coordinates_latitude_check`: `CHECK (latitude >= '-90'::integer::double precision AND latitude <= 90::double precision)`
- `source_coordinates_longitude_check`: `CHECK (longitude >= '-180'::integer::double precision AND longitude <= 180::double precision)`
- `source_coordinates_uncertainty_m_check`: `CHECK (uncertainty_m >= 0::double precision AND uncertainty_m <= 10000::double precision)`
- `source_coordinates_face_id_fkey`: `FOREIGN KEY (face_id) REFERENCES billboard_faces(id)`
- `source_coordinates_imported_by_fkey`: `FOREIGN KEY (imported_by) REFERENCES "user"(id)`

Additional indexes:

- `CREATE INDEX source_location_gist ON ibvs.source_coordinates USING gist (location)`

Triggers:

- `CREATE TRIGGER source_immutable BEFORE DELETE OR UPDATE ON source_coordinates FOR EACH ROW EXECUTE FUNCTION deny_change()`

### location_coordinate_corrections

Append-only reasoned coordinate corrections; originals remain unchanged.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `face_id` | `text` | No | — |
| `latitude` | `double precision` | No | — |
| `longitude` | `double precision` | No | — |
| `uncertainty_m` | `double precision` | No | — |
| `reason` | `text` | No | — |
| `created_by` | `text` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `location_coordinate_corrections_pkey`: `PRIMARY KEY (id)`
- `location_coordinate_corrections_latitude_check`: `CHECK (latitude >= '-90'::integer::double precision AND latitude <= 90::double precision)`
- `location_coordinate_corrections_longitude_check`: `CHECK (longitude >= '-180'::integer::double precision AND longitude <= 180::double precision)`
- `location_coordinate_corrections_reason_check`: `CHECK (length(TRIM(BOTH FROM reason)) >= 10 AND length(TRIM(BOTH FROM reason)) <= 1000)`
- `location_coordinate_corrections_uncertainty_m_check`: `CHECK (uncertainty_m >= 0::double precision AND uncertainty_m <= 10000::double precision)`
- `location_coordinate_corrections_created_by_fkey`: `FOREIGN KEY (created_by) REFERENCES "user"(id)`
- `location_coordinate_corrections_organization_id_face_id_fkey`: `FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)`
- `location_coordinate_corrections_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX coordinate_corrections_latest ON ibvs.location_coordinate_corrections USING btree (face_id, created_at DESC, id DESC)`
- `CREATE INDEX coordinate_corrections_org ON ibvs.location_coordinate_corrections USING btree (organization_id)`

Triggers:

- `CREATE TRIGGER coordinate_corrections_immutable BEFORE DELETE OR UPDATE ON location_coordinate_corrections FOR EACH ROW EXECUTE FUNCTION deny_change()`

### location_exceptions

Time-limited supervisor authorizations bound to an assignment version.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `assignment_id` | `text` | No | — |
| `assignment_version` | `integer` | No | — |
| `reason` | `text` | No | — |
| `authorized_by` | `text` | No | — |
| `expires_at` | `timestamp with time zone` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `location_exceptions_pkey`: `PRIMARY KEY (id)`
- `location_exceptions_assignment_version_check`: `CHECK (assignment_version > 0)`
- `location_exceptions_check`: `CHECK (expires_at > created_at AND expires_at <= (created_at + '24:00:00'::interval))`
- `location_exceptions_reason_check`: `CHECK (length(TRIM(BOTH FROM reason)) >= 10 AND length(TRIM(BOTH FROM reason)) <= 1000)`
- `location_exceptions_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES assignments(id)`
- `location_exceptions_authorized_by_fkey`: `FOREIGN KEY (authorized_by) REFERENCES "user"(id)`
- `location_exceptions_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX location_exceptions_assignment ON ibvs.location_exceptions USING btree (assignment_id, assignment_version, expires_at DESC)`
- `CREATE INDEX location_exceptions_org ON ibvs.location_exceptions USING btree (organization_id)`

Triggers:

- `CREATE TRIGGER location_exceptions_immutable BEFORE DELETE OR UPDATE ON location_exceptions FOR EACH ROW EXECUTE FUNCTION deny_change()`

## Field visits and evidence

### assignments

Worker visit assignments, state, version and linked resurvey instructions.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `face_id` | `text` | No | — |
| `worker_id` | `text` | No | — |
| `assigned_by` | `text` | No | — |
| `due_date` | `date` | No | — |
| `status` | `text` | No | `'assigned'::text` |
| `version` | `integer` | No | `1` |
| `created_at` | `timestamp with time zone` | No | `now()` |
| `parent_inspection_id` | `text` | Yes | — |
| `instructions` | `text` | Yes | — |

Constraints:

- `assignments_pkey`: `PRIMARY KEY (id)`
- `assignments_status_check`: `CHECK (status = ANY (ARRAY['assigned'::text, 'server_received'::text, 'pending_review'::text, 'baseline_verified'::text, 'approved'::text, 'ambiguous'::text, 'rejected'::text, 'resurvey_requested'::text, 'superseded'::text]))`
- `assignments_assigned_by_fkey`: `FOREIGN KEY (assigned_by) REFERENCES "user"(id)`
- `assignments_organization_id_face_id_fkey`: `FOREIGN KEY (organization_id, face_id) REFERENCES billboard_faces(organization_id, id)`
- `assignments_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `assignments_organization_id_worker_id_fkey`: `FOREIGN KEY (organization_id, worker_id) REFERENCES organization_members(organization_id, user_id)`
- `assignments_parent_inspection_id_fkey`: `FOREIGN KEY (parent_inspection_id) REFERENCES inspections(id)`

Additional indexes:

- `CREATE UNIQUE INDEX assignments_active_face ON ibvs.assignments USING btree (face_id) WHERE (status = ANY (ARRAY['assigned'::text, 'server_received'::text, 'pending_review'::text, 'resurvey_requested'::text, 'ambiguous'::text]))`
- `CREATE UNIQUE INDEX assignments_one_followup ON ibvs.assignments USING btree (parent_inspection_id) WHERE (parent_inspection_id IS NOT NULL)`
- `CREATE INDEX assignments_worker ON ibvs.assignments USING btree (organization_id, worker_id, due_date)`

### challenges

Expiring online-capture challenges and consumption tracking.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `assignment_id` | `text` | No | — |
| `worker_id` | `text` | No | — |
| `nonce` | `text` | No | — |
| `issued_at` | `timestamp with time zone` | No | `now()` |
| `expires_at` | `timestamp with time zone` | No | — |
| `consumed_by` | `text` | Yes | — |

Constraints:

- `challenges_pkey`: `PRIMARY KEY (id)`
- `challenges_consumed_by_key`: `UNIQUE (consumed_by)`
- `challenges_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES assignments(id)`
- `challenges_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `challenges_worker_id_fkey`: `FOREIGN KEY (worker_id) REFERENCES "user"(id)`

Additional indexes:

- `CREATE INDEX challenges_task ON ibvs.challenges USING btree (assignment_id, worker_id, issued_at)`

### inspections

Idempotent inspection uploads and immutable server receipts.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `assignment_id` | `text` | No | — |
| `face_id` | `text` | No | — |
| `worker_id` | `text` | No | — |
| `operation_id` | `text` | No | — |
| `payload_hash` | `text` | No | — |
| `metadata` | `jsonb` | No | — |
| `status` | `text` | No | `'uploading'::text` |
| `challenge_id` | `text` | Yes | — |
| `receipt_id` | `text` | Yes | — |
| `received_at` | `timestamp with time zone` | Yes | — |
| `flags` | `jsonb` | No | `'[]'::jsonb` |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `inspections_pkey`: `PRIMARY KEY (id)`
- `inspections_receipt_id_key`: `UNIQUE (receipt_id)`
- `inspections_worker_id_operation_id_key`: `UNIQUE (worker_id, operation_id)`
- `inspections_status_check`: `CHECK (status = ANY (ARRAY['uploading'::text, 'server_received'::text]))`
- `inspections_assignment_id_fkey`: `FOREIGN KEY (assignment_id) REFERENCES assignments(id)`
- `inspections_challenge_id_fkey`: `FOREIGN KEY (challenge_id) REFERENCES challenges(id)`
- `inspections_face_id_fkey`: `FOREIGN KEY (face_id) REFERENCES billboard_faces(id)`
- `inspections_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`
- `inspections_worker_id_fkey`: `FOREIGN KEY (worker_id) REFERENCES "user"(id)`

Additional indexes:

- `CREATE UNIQUE INDEX inspections_one_active ON ibvs.inspections USING btree (assignment_id)`
- `CREATE INDEX inspections_received_queue ON ibvs.inspections USING btree (organization_id, received_at DESC, id DESC) WHERE (status = 'server_received'::text)`
- `CREATE INDEX inspections_worker ON ibvs.inspections USING btree (organization_id, worker_id, created_at)`

Triggers:

- `CREATE TRIGGER received_inspection_immutable BEFORE DELETE OR UPDATE ON inspections FOR EACH ROW EXECUTE FUNCTION protect_received_inspection()`

### media_evidence

Front/wide original-photo metadata, byte counts, hashes and private object keys.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `inspection_id` | `text` | No | — |
| `kind` | `text` | No | — |
| `expected_bytes` | `integer` | No | — |
| `expected_hash` | `text` | No | — |
| `server_hash` | `text` | Yes | — |
| `object_key` | `text` | Yes | — |
| `width` | `integer` | Yes | — |
| `height` | `integer` | Yes | — |
| `receipt_id` | `text` | Yes | — |
| `received_at` | `timestamp with time zone` | Yes | — |

Constraints:

- `media_evidence_pkey`: `PRIMARY KEY (id)`
- `media_evidence_inspection_id_kind_key`: `UNIQUE (inspection_id, kind)`
- `media_evidence_receipt_id_key`: `UNIQUE (receipt_id)`
- `media_evidence_expected_bytes_check`: `CHECK (expected_bytes >= 1 AND expected_bytes <= 6291456)`
- `media_evidence_kind_check`: `CHECK (kind = ANY (ARRAY['front'::text, 'wide'::text]))`
- `media_evidence_inspection_id_fkey`: `FOREIGN KEY (inspection_id) REFERENCES inspections(id)`

Additional indexes:

- `CREATE INDEX media_hash ON ibvs.media_evidence USING btree (server_hash)`

Triggers:

- `CREATE TRIGGER complete_media_immutable BEFORE DELETE OR UPDATE ON media_evidence FOR EACH ROW EXECUTE FUNCTION protect_complete_media()`

### evidence_parts

Immutable resumable upload-part manifests.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `media_id` | `text` | No | — |
| `part` | `integer` | No | — |
| `hash` | `text` | No | — |
| `bytes` | `integer` | No | — |
| `object_key` | `text` | No | — |

Constraints:

- `evidence_parts_pkey`: `PRIMARY KEY (media_id, part)`
- `evidence_parts_part_check`: `CHECK (part >= 0 AND part <= 23)`
- `evidence_parts_media_id_fkey`: `FOREIGN KEY (media_id) REFERENCES media_evidence(id)`

Triggers:

- `CREATE TRIGGER parts_immutable BEFORE DELETE OR UPDATE ON evidence_parts FOR EACH ROW EXECUTE FUNCTION deny_change()`

## Review and reference baselines

### review_cases

Current review state, concurrency version, assessment and independent-review requirement.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `inspection_id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `state` | `text` | No | `'pending'::text` |
| `version` | `integer` | No | `1` |
| `epoch` | `integer` | No | `1` |
| `independent_required` | `boolean` | No | `false` |
| `assessment_id` | `text` | Yes | — |
| `risk_level` | `text` | No | `'unknown'::text` |
| `updated_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `review_cases_pkey`: `PRIMARY KEY (inspection_id)`
- `review_cases_state_check`: `CHECK (state = ANY (ARRAY['pending'::text, 'ambiguous'::text, 'approved'::text, 'rejected'::text, 'resurvey_requested'::text]))`
- `review_cases_inspection_id_fkey`: `FOREIGN KEY (inspection_id) REFERENCES inspections(id)`
- `review_cases_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX review_queue ON ibvs.review_cases USING btree (organization_id, state, updated_at)`

### media_analysis

Immutable per-photo analysis facts and perceptual hashes.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `media_id` | `text` | No | — |
| `algorithm` | `text` | No | — |
| `verified_hash` | `text` | No | — |
| `phash` | `text` | No | — |
| `facts` | `jsonb` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `media_analysis_pkey`: `PRIMARY KEY (media_id)`
- `media_analysis_media_id_fkey`: `FOREIGN KEY (media_id) REFERENCES media_evidence(id)`

Triggers:

- `CREATE TRIGGER media_analysis_immutable BEFORE DELETE OR UPDATE ON media_analysis FOR EACH ROW EXECUTE FUNCTION deny_change()`

### verification_runs

Immutable versioned risk assessments and reports.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `inspection_id` | `text` | No | — |
| `rule_version` | `text` | No | — |
| `assessment_hash` | `text` | No | — |
| `report` | `jsonb` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `verification_runs_pkey`: `PRIMARY KEY (id)`
- `verification_runs_inspection_id_fkey`: `FOREIGN KEY (inspection_id) REFERENCES inspections(id)`
- `verification_runs_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX verification_inspection ON ibvs.verification_runs USING btree (inspection_id, created_at DESC)`

Triggers:

- `CREATE TRIGGER verification_runs_immutable BEFORE DELETE OR UPDATE ON verification_runs FOR EACH ROW EXECUTE FUNCTION deny_change()`

### review_decisions

Idempotent, versioned human decisions with reasons and acknowledgements.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `inspection_id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `actor_id` | `text` | No | — |
| `operation_id` | `text` | No | — |
| `payload_hash` | `text` | No | — |
| `version` | `integer` | No | — |
| `epoch` | `integer` | No | — |
| `action` | `text` | No | — |
| `reason` | `text` | No | — |
| `assessment_hash` | `text` | No | — |
| `identity_confirmed` | `boolean` | No | `false` |
| `risk_acknowledged` | `boolean` | No | `false` |
| `result` | `jsonb` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `review_decisions_pkey`: `PRIMARY KEY (id)`
- `review_decisions_inspection_id_version_key`: `UNIQUE (inspection_id, version)`
- `review_decisions_organization_id_actor_id_operation_id_key`: `UNIQUE (organization_id, actor_id, operation_id)`
- `review_decisions_action_check`: `CHECK (action = ANY (ARRAY['approve'::text, 'reject'::text, 'resurvey'::text, 'ambiguous'::text]))`
- `review_decisions_reason_check`: `CHECK (length(reason) >= 5)`
- `review_decisions_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `review_decisions_inspection_id_fkey`: `FOREIGN KEY (inspection_id) REFERENCES inspections(id)`
- `review_decisions_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Triggers:

- `CREATE TRIGGER review_decisions_immutable BEFORE DELETE OR UPDATE ON review_decisions FOR EACH ROW EXECUTE FUNCTION deny_change()`

### reference_baselines

Versioned structural reference enrollments for a specific face and inspection.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `face_id` | `text` | No | — |
| `inspection_id` | `text` | No | — |
| `version` | `integer` | No | — |
| `structure_details` | `jsonb` | No | — |
| `actor_id` | `text` | No | — |
| `assessment_hash` | `text` | No | — |
| `operation_id` | `text` | No | — |
| `payload_hash` | `text` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `reference_baselines_pkey`: `PRIMARY KEY (id)`
- `reference_baselines_face_id_version_key`: `UNIQUE (face_id, version)`
- `reference_baselines_organization_id_actor_id_operation_id_key`: `UNIQUE (organization_id, actor_id, operation_id)`
- `reference_baselines_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `reference_baselines_face_id_fkey`: `FOREIGN KEY (face_id) REFERENCES billboard_faces(id)`
- `reference_baselines_inspection_id_fkey`: `FOREIGN KEY (inspection_id) REFERENCES inspections(id)`
- `reference_baselines_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Triggers:

- `CREATE TRIGGER reference_baselines_immutable BEFORE DELETE OR UPDATE ON reference_baselines FOR EACH ROW EXECUTE FUNCTION deny_change()`

### reference_photos

Original evidence bound to each baseline photo kind.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `baseline_id` | `text` | No | — |
| `media_id` | `text` | No | — |
| `kind` | `text` | No | — |
| `original_hash` | `text` | No | — |

Constraints:

- `reference_photos_pkey`: `PRIMARY KEY (baseline_id, kind)`
- `reference_photos_kind_check`: `CHECK (kind = ANY (ARRAY['front'::text, 'wide'::text]))`
- `reference_photos_baseline_id_fkey`: `FOREIGN KEY (baseline_id) REFERENCES reference_baselines(id)`
- `reference_photos_media_id_fkey`: `FOREIGN KEY (media_id) REFERENCES media_evidence(id)`

Triggers:

- `CREATE TRIGGER reference_photos_immutable BEFORE DELETE OR UPDATE ON reference_photos FOR EACH ROW EXECUTE FUNCTION deny_change()`

### baseline_events

Immutable, reasoned withdrawals of reference baselines.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `baseline_id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `actor_id` | `text` | No | — |
| `action` | `text` | No | — |
| `reason` | `text` | No | — |
| `operation_id` | `text` | No | — |
| `payload_hash` | `text` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `baseline_events_pkey`: `PRIMARY KEY (id)`
- `baseline_events_baseline_id_key`: `UNIQUE (baseline_id)`
- `baseline_events_organization_id_actor_id_operation_id_key`: `UNIQUE (organization_id, actor_id, operation_id)`
- `baseline_events_action_check`: `CHECK (action = 'withdraw'::text)`
- `baseline_events_reason_check`: `CHECK (length(reason) >= 5)`
- `baseline_events_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `baseline_events_baseline_id_fkey`: `FOREIGN KEY (baseline_id) REFERENCES reference_baselines(id)`
- `baseline_events_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Triggers:

- `CREATE TRIGGER baseline_events_immutable BEFORE DELETE OR UPDATE ON baseline_events FOR EACH ROW EXECUTE FUNCTION deny_change()`

## Audit and operations

### audit_events

Append-only organization-scoped operation history.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `actor_id` | `text` | No | — |
| `action` | `text` | No | — |
| `entity_id` | `text` | No | — |
| `detail` | `jsonb` | No | `'{}'::jsonb` |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `audit_events_pkey`: `PRIMARY KEY (id)`
- `audit_events_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `audit_events_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX audit_org_time ON ibvs.audit_events USING btree (organization_id, created_at DESC)`

Triggers:

- `CREATE TRIGGER audit_immutable BEFORE DELETE OR UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_change()`

### activity_logs

Actor activity categories and timestamps.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `actor_id` | `text` | No | — |
| `category` | `text` | No | — |
| `created_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `activity_logs_pkey`: `PRIMARY KEY (id)`
- `activity_logs_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `activity_logs_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

### analysis_admissions

Short-lived admission leases limiting analysis concurrency.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `id` | `text` | No | — |
| `organization_id` | `text` | No | — |
| `actor_id` | `text` | No | — |
| `started_at` | `timestamp with time zone` | No | `now()` |
| `lease_until` | `timestamp with time zone` | No | `(now() + '00:05:00'::interval)` |

Constraints:

- `analysis_admissions_pkey`: `PRIMARY KEY (id)`
- `analysis_admissions_actor_id_fkey`: `FOREIGN KEY (actor_id) REFERENCES "user"(id)`
- `analysis_admissions_organization_id_fkey`: `FOREIGN KEY (organization_id) REFERENCES organizations(id)`

Additional indexes:

- `CREATE INDEX analysis_admissions_org ON ibvs.analysis_admissions USING btree (organization_id, started_at)`

### schema_migrations

Applied portable migration ledger.

| Column | Type | Nullable | Default / generated expression |
| --- | --- | --- | --- |
| `name` | `text` | No | — |
| `applied_at` | `timestamp with time zone` | No | `now()` |

Constraints:

- `schema_migrations_pkey`: `PRIMARY KEY (name)`
