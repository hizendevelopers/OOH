# Data model

Core: Better Auth user/session/account/verification/rateLimit tables; organizations; roles; organization_members; worker_profiles; billboard_structures; billboard_faces; source_coordinates; assignments; audit_events; activity_logs.

Face code is globally immutable within its organization and linked to an immutable original source coordinate. Source coordinates are append-only. Structure metadata is separate from import observations. City, zone, orientation and uncertainty are recorded explicitly; an empty orientation is unknown, not inferred.

Evidence phase tables planned in a separate migration: inspections (assignment, worker, server status, version, claimed capture, receipt time), gps_observations (accuracy/freshness), media_evidence (private object key/hash/dimensions/receipt), challenges (random nonce/expiry/consumption), offline_sync_operations (actor + operation key + request hash + stable response), review_decisions (actor/version/reason), reference_photos (explicit human-approved baseline), verification_runs, candidate_matches.

Only acknowledged server states belong in server rows. assigned → server_received → pending_review → baseline_verified/rejected/resurvey_requested; local_draft/uploading are client queue states. M1 assignments begin assigned and cannot masquerade as received evidence.

Unique active assignment per face; foreign keys for organization and worker membership; transactional import and batch assignment; audit insert in the same transaction. Future review uses expected version and compare-and-swap. Spatial migration adds geography points and GiST index without replacing original numeric coordinates.
