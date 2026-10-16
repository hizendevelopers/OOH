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
