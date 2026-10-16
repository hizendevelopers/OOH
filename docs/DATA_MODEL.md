# Data model

Core: Better Auth user/session/account/verification/rateLimit tables; organizations; roles; organization_members; worker_profiles; billboard_structures; billboard_faces; source_coordinates; assignments; audit_events; activity_logs.

Face code is globally immutable within its organization and linked to an immutable original source coordinate. Source coordinates are append-only. Structure metadata is separate from import observations. City, zone, orientation and uncertainty are recorded explicitly; an empty orientation is unknown, not inferred.

Migration 002 adds inspections (worker/assignment/face binding, unique worker + operation ID, canonical payload hash, immutable JSON capture/GPS metadata, uploading/server_received status, receipt/time/flags), challenges (task/worker-bound nonce/expiry/consumption), media_evidence (expected and server hashes, private object key, dimensions, receipt) and evidence_parts (immutable part hash/length/key). One inspection per assignment prevents duplicate attempts. Original schema 001 is unchanged.

For Phase 2, GPS observations and sync idempotency metadata are stored in inspection JSON and constrained unique columns instead of separate gps_observations/offline_sync_operations tables. Phase 3 can normalize this when adding query/reporting requirements. Remaining planned tables: review_decisions (actor/version/reason), reference_photos (explicit human-approved baseline), verification_runs and candidate_matches. Controlled resurvey attempts need a new migration/version policy; do not delete old inspections to retry.

Assignments remain assigned while the server has a partial uploading session. Only a validated final receipt advances the assignment to server_received. pending_review/baseline_verified/rejected/resurvey_requested review transitions are Phase 3. local_draft/queued/blocked are client states and never server receipt claims.

Unique active assignment per face; foreign keys for organization and worker membership; transactional import and batch assignment; audit insert in the same transaction. Future review uses expected version and compare-and-swap. Spatial migration adds geography points and GiST index without replacing original numeric coordinates.
