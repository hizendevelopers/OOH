# Acceptance test matrix

| Area | Automated target | Milestone |
|---|---|---|
| Domain | ID/coordinates/uncertainty, CSV/duplicates, role filtering, transitions, locale | M1 |
| Persistence | Fresh migrations, repeat migration, immutable source, rollback on duplicate, audit | M1 |
| Authorization | Anonymous, non-admin import, cross-worker task, cross-tenant access, CSRF | M1 |
| Browser | Sign-in, admin CSV preview/import/assign, worker task/detail, locales/themes, widths | M1 |
| Evidence | Wrong face, malformed media, duplicate hash, expired challenge, forged metadata | M3 |
| Offline | Camera mock, GPS denied/allowed, durable Blob, reconnect/reload/retry/idempotency | M2–M3 |
| Operations | Health, Docker/PostGIS, backup/restore, staging smoke | M4 |

Results belong in PROJECT_HANDOVER.md. An unrun test is not a pass. Real-phone/offline tests and Docker spatial tests are separate from embedded PostgreSQL tests.

Phase 2 implemented coverage: Dexie Blob persistence and reopen, front/wide requirement, quota failure atomicity, stable operation payload, interrupted/resumed upload, lost final response, backoff, session/account mismatch pause, server disk-write failure rollback, wrong face/version/worker, expired challenge flagging, malformed image, chunk/receipt duplicate replay, private media access, server DB reopen mid-upload, production evidence config/path restrictions. Playwright uses fake live media and simulated GPS (denied/success), quota and network faults; it exercises offline reload, resumable retry, scoped media APIs, CSRF/task tampering, public-cache exclusions, RTL/dark and 360/390/768/1440 widths. Real phones, OS eviction, real server process kill/power loss, Docker/PostGIS, scanning, staging and restore drills remain unrun.


Phase 3 adds real database/service tests for administrator/organization permissions, mandatory reasons, stale/repeated decisions, concurrent identical replay, independent supervisor confirmation, explicit baseline enrollment/withdrawal/correction, immutable decision/media history and linked resurvey tasks. Risk tests cover exact/cross-worker/perceptual duplicates, adjacent faces, low GPS accuracy, mismatch, offline timestamp discrepancies, bounded JPEG corruption, missing private originals and conservative travel/overlap uncertainty. Existing expired-challenge/task-tampering/offline/quota/interrupted-sync tests remain. The new production Chromium journey uses authenticated real APIs and test-only JPEG fixtures, reviews both photos, independent approval, baseline enrollment/withdrawal, rejection/resurvey and offline worker capture. PostGIS SQL contract tests are distinct from the opt-in runtime check `npm run test:postgis`; run against an isolated `IBVS_POSTGIS_TEST_URL`. Unavailable runtime credentials are not a passing test.

M4 implemented acceptance: analysis lease/rate/expiry/release and unauthorized access; deferred receipt replay and supervisor recovery; production/development CSP; absolute evidence path validation; 100 synthetic faces/525 historical receipts with tied microsecond timestamps and a later new receipt, filters/cursor/tenant checks, complete pagination; generated snapshot restore and audit immutability; reconciliation failures/opt-in safety. Production Chromium adds real paged API loading and blocked in-flight decision duplicate/keyboard/navigation attempts, retaining all offline/resurvey regressions. Local timing excludes network/photos. Actual final results, development dependency findings and unrun external gates are in PROJECT_HANDOVER.md.

Exact M4 reconciliation adds an actual same-browser logout/offline lock/account-switch/recovery production Chromium test, preserving original Blob/hash/operation ID. `npm run test:restart` separately terminates and restarts only its own loopback production server after a persisted partial chunk, then verifies the same session/manifest, resumed parts, both original hashes and stable receipt/history. It passed with isolated PGlite fixtures; this supersedes earlier unrun local-process-restart notes, without claiming physical power-loss/container/PostGIS recovery. Lifecycle inventory tests retain all originals/chunks/temp/unknown objects, refuse invalid/bounded scans and fail on DB errors; no deletion authority is implemented. Intermediate browser throttling failures and final results are in M4_TEST_REPORT.md.
