# Data model

Core: Better Auth user/session/account/verification/rateLimit tables; organizations; roles; organization_members; worker_profiles; billboard_structures; billboard_faces; source_coordinates; assignments; audit_events; activity_logs.

Face code is globally immutable within its organization and linked to an immutable original source coordinate. Source coordinates are append-only. Structure metadata is separate from import observations. City, zone, orientation and uncertainty are recorded explicitly; an empty orientation is unknown, not inferred.

Migration 002 adds inspections (worker/assignment/face binding, unique worker + operation ID, canonical payload hash, immutable JSON capture/GPS metadata, uploading/server_received status, receipt/time/flags), challenges (task/worker-bound nonce/expiry/consumption), media_evidence (expected and server hashes, private object key, dimensions, receipt) and evidence_parts (immutable part hash/length/key). One inspection per assignment prevents duplicate attempts. Original schema 001 is unchanged.

For Phase 2, GPS observations and sync idempotency metadata are stored in inspection JSON and constrained unique columns instead of separate gps_observations/offline_sync_operations tables. Phase 3 can normalize this when adding query/reporting requirements. Migration 003 implements review decisions, explicit reference photos, verification runs and linked resurvey tasks as described below. Candidate evidence remains within versioned reports. Never delete old inspections to retry.

Assignments remain assigned while the server has a partial uploading session. Only a validated final receipt advances the assignment to server_received. pending_review/baseline_verified/rejected/resurvey_requested review transitions are Phase 3. local_draft/queued/blocked are client states and never server receipt claims.

Unique active assignment per face; foreign keys for organization and worker membership; transactional import and batch assignment; audit insert in the same transaction. Future review uses expected version and compare-and-swap. Spatial migration adds geography points and GiST index without replacing original numeric coordinates.


## Phase 3 schema
Migration 003 adds `review_cases` (mutable optimistic version/approval epoch projection), append-only `verification_runs` and `media_analysis`, append-only `review_decisions`, `reference_baselines`, `reference_photos` and `baseline_events`. Completed media receives a mutation-denial trigger. Existing migrations 001/002 and received metadata are preserved. No migration promotes worker photos to verified references.

Assignments support approved/ambiguous/superseded states and optional `parent_inspection_id`/`instructions`. A resurvey transaction frees the original active task and inserts one new task linked to the original inspection. One follow-up per inspection and one attempt per assignment remain database-enforced. Each face reference has an increasing version; withdrawal is an append-only event, never deletion. Corrected enrollment retains historical image hashes and structural descriptions.

## M4 additive schema

Migration 004 creates `analysis_admissions` with organization/actor/start/lease fields and a scope/time index. Expired rate-window records are ephemeral operational bookkeeping, distinct from immutable review/audit history. Migration 005 indexes received inspections by organization, descending receipt timestamp and ID. Original migrations 001-003 are unchanged; neither migration modifies originals, baseline approvals, credentials or offline drafts.

`review_cases.state` is the current review projection. Assignment status describes lifecycle and can retain an earlier approval when new risk reopens the case; consumers must use `review_state` for current human review status.
