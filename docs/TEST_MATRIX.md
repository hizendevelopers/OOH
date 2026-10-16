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
