# Delivery plan

| Milestone | Acceptance | Dependency |
|---|---|---|
| M0 | Requirements, architecture, threats, schema and tokens documented | This workspace |
| M1 | Auth, transactional CSV import, inventory, task assignment, worker scope, audit, export; automated tests/build | Local PostgreSQL engine |
| M2 | PWA camera/GPS/Blob queue and foreground resume | Real Android/iOS phones and HTTPS |
| M3 | Private resumable evidence, validation, receipt, human review, history | Private storage and scanning policy |
| M4 | Independent 50–100-face pilot, security pass, restore and staging smoke | Field staff and hosting |
| M5 | Optional evaluated retrieval | Verified reference dataset |

Phase 1 files: root workspace/config/CI, apps/web app routes/components/styles/server auth/db/services, packages/domain validation/permissions/state/geo, db/migrations, scripts migration/provision/seed, tests unit/integration/browser and operational manuals. Create a local development engine if Docker is unavailable; do not substitute unverified spatial behavior.

External prerequisites: production PostgreSQL/PostGIS, HTTPS domain and host, private R2/S3 with lifecycle policy, licensed tiles, administrator MFA policy, backup destination, worker consent/retention owner. Only request credentials when a feature needs them. No external service is provisioned by this implementation.


Phase 3 implements the review/reference/risk/resurvey portion of M3 locally. Operational scanning, leased analysis jobs, historical batch reanalysis, chunk cleanup, production PostGIS, MFA and recovery drills remain gates before M4. Single-host authenticated private storage remains the selected adapter; distributed R2/S3 storage and licensed street tiles are optional future integrations. The review map is an explicitly labeled local coordinate map and requires neither tile service nor client secret.
