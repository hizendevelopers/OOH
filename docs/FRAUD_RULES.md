# Explainable review rules — ibvs-risk/1.0.0

The rules are review aids, not a calibrated fraud probability model. Severity is the maximum emitted severity, never a weighted probability. Every signal stores a code, rule version, severity, supporting evidence, recommended action and whether approval is blocked. Reports are content-hashed and appended only when changed. Human decisions and original evidence remain immutable. Browser camera, GPS, EXIF, connectivity and clock cannot establish genuine capture or face identity.

| Signals | Current rule and consequence |
|---|---|
| `human_review_required` | Always emitted. Initial worker photographs remain provisional. |
| `integrity_failure`, `missing_evidence`, `task_binding_mismatch` | Critical, blocks approval; require replacement evidence/resurvey. Invalid or missing private JPEG, server hash mismatch, missing front/wide receipts or inconsistent assigned face/task metadata. API task-ID tampering is also rejected before upload. |
| `exact_duplicate`, `cross_worker_duplicate` | SHA-256 equality to other received original server hashes within the organization, including historical Phase 2 receipts without a perceptual analysis. High, independent review; retains matched inspection/face/worker IDs. Never automatically rejects. |
| `perceptual_similarity` | JPEG grayscale 32×32 DCT, 8×8 low-frequency coefficients, median of 63 non-DC coefficients, 64-bit hash (`jpeg-dct64-v1`). Hamming distance ≤8 indicates a candidate, medium severity. Recompression test passes; rotation, crop and adversarial transforms are not guaranteed. Low-detail photos can collide. Human comparison is required. |
| `neighboring_faces` | Other organization faces within 150m plus both imported uncertainty radii. Same-structure and coincident faces remain distinct candidates. High, two distinct supervisor approvals required. Source coordinates remain unverified. |
| `gps_missing` | Unavailable/denied GPS, medium. Missing location is retained, never fabricated. |
| `gps_low_accuracy` | Claimed accuracy >100m, medium. |
| `gps_mismatch` | Distance from assigned source exceeds claimed accuracy plus imported coordinate uncertainty, high, independent review. Production uses PostGIS geography distances. |
| `gps_stale` | Claimed fix and capture differ by more than 30 seconds, medium. |
| `capture_receipt_discrepancy` | Device capture over 24 hours before receipt or >5 minutes after it, medium. Legitimate offline delays are possible. |
| `offline_capture` | Explicit offline device claim, low; server cannot attest offline time. |
| `unchallenged_capture`, `challenge_expired` | No validated online challenge, low; expired challenge, medium. Phase 2 five-minute worker/task-bound challenges are retained and never promoted to physical-camera attestation. |
| `online_challenged` | Valid server-issued challenge classification, informational. Proves bounded server interaction only. |
| `impossible_travel` | Conservative minimum distance subtracts both accuracy radii; claimed non-overlapping capture intervals imply >160 km/h, high, independent review. No inference from receipt ordering or an offline batch alone. |
| `overlapping_inspections` | Claimed capture intervals overlap while minimum separation after uncertainty exceeds 500m, high, independent review. Device clocks/GPS may be wrong. |
| `low_resolution`, `poor_quality` | Suggested short edge <720px; grayscale deviation <12, edge energy <20, mean <25 or >235. Medium heuristic exposure/detail warnings, not a validated quality classifier. Hard upload limits remain JPEG, 6MiB, minimum 320px dimensions, maximum 24MP. |
| `analysis_scope_limited` | Candidate/history safety limit reached. High, mandatory independent review; the report is incomplete, never silently “clean.” |

Analysis considers up to 10,000 other received media rows, 500 previous same-worker received inspections and 101 neighboring faces. The review UI uses keyset pagination (50 by default, maximum 100 per page); the legacy queue array remains capped at 500. Database admission leases limit analysis concurrency/rate, but background jobs and batch reanalysis of historical Phase 2 receipts remain future work. Historical receipts are enrolled into the pending queue by migration; supervisors explicitly run analysis when no report exists. Failed analysis leaves a pending case, never approval.

Rules and thresholds require representative Iraq field data, independent reviewer adjudication, false-positive measurement and blind evaluation before tuning. The current thresholds are documented conservative operational defaults, not validated forensic science. Reports can change when new duplicate evidence arrives; approvals and reference enrollment must use the current report hash. Old reports and decisions remain visible in audit history.

A changed assessment reopens an approved case as pending with a new version/approval epoch. An active reference whose approval state or assessment hash no longer matches is on review hold and excluded from verified counts. The historical reference is not deleted or silently rewritten: supervisors must explicitly withdraw/correct it. Reanalysis is currently invoked after receipt and on supervisor request, not a continuous forensic monitor. Historical perceptual hashes require analysis; exact SHA-256 comparisons use stored validated server hashes even without a perceptual record.

M4 changes resource admission and retrieval, not risk semantics: rule version remains `ibvs-risk/1.0.0`. See PHASE3_API.md for lease limits, receipt replay behavior and explicit supervisor recovery after deferred analysis. No threshold calibration or representative field evaluation is claimed.
