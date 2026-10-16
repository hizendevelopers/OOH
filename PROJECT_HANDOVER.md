# IBVS project handover

Updated: 16 October 2026, Asia/Karachi. Delivery: local M0 specification and M1 application; no external deployment.

## Initial inspection
The workspace was empty and not a Git repository. Node 24.12, npm 11.6 and Docker CLI were installed. Docker's Linux engine was unavailable. No pre-existing application or user data was overwritten. A new local Git repository was initialized on main.

## Delivered
- TypeScript workspace with Next.js 16 / React 19 / Tailwind 4 and a shared domain package.
- Better Auth email/password sign-in/out and database sessions, public registration disabled, database-backed login throttling, origin/CSRF checks and server-side organization/worker access predicates.
- Database-backed dashboard, city coverage bars, inventory search/filter, atomic CSV preview/import, duplicate rejection, structure/face separation, batch worker assignment, due dates and private worker task details.
- Immutable imported coordinates and face identity, transactional append-only audit, assignment CSV export with spreadsheet formula neutralization.
- Responsive English/Arabic primary UI, RTL-isolated IDs, light/dark modes, mobile navigation, keyboard dialogs, connection/error/empty/loading states. Some technical and secondary operational strings remain English.
- Core PostgreSQL migration, additive production PostGIS migration, local persistent embedded PostgreSQL fallback, organization/user provisioning and explicit DEMO fixtures (no evidence/approvals).
- Dockerfile, Compose, CI configuration, automated acceptance tests, manuals and the nine required specification documents, plus deployment/retention/cost guides.

## Verification evidence
All results below are local, not staging or real-phone certification.

| Check | Result |
|---|---|
| `npm test` | 26 passed across domain, embedded PostgreSQL integration and environment validation |
| `npm run lint` | Passed; no warnings/errors in last recorded run |
| `npm run typecheck` | Passed |
| `npm run build` | Passed after final UI changes; all routes compiled and production output generated |
| `npm run test:browser` | 3 Chromium production-build flows passed after final UI changes (14.9 seconds) |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities reported |
| Docker/PostGIS runtime, CI on remote runner, staging smoke, backup restore | Not run |
| Real Android/iOS, camera/GPS capture, offline evidence replay | Not run; capture pipeline not implemented |

Browser acceptance covers admin sign-in → valid CSV preview/import → select/assign → worker detail; cross-worker 404, worker inventory 403, CSRF 403, anonymous 401, health, invalid coordinates, English/Arabic RTL, light/dark, reduced motion, offline warning and 360/390/768/1440 widths. Screenshots are in ignored `test-results/`. Test passwords are ephemeral; browser traces are disabled to avoid retaining login payloads.

Database acceptance covers migration repeat, import rollback, duplicate rejection, original-coordinate/code/audit mutation denial, batch rollback, active-task conflicts, organization isolation, worker authorization and disabled signup. Embedded PostgreSQL is an actual database engine but does not validate production pg networking, pool behavior or PostGIS.

## Run / account setup
See [README.md](README.md) for exact PowerShell commands. `npm ci`, `npm run db:migrate`, set a user-chosen IBVS_DEMO_PASSWORD securely, `npm run db:seed`, `npm run dev`. Accounts: admin@demo.ibvs.test, worker@demo.ibvs.test and worker2@demo.ibvs.test; use your supplied password. No default password exists. Normal workspace `.local/postgres` currently has the migrated empty schema, not automatically seeded user accounts.

Production organization: `npm run org:create -- "Iraq Operations" iraq-operations`; then use `npm run user:create` with IBVS_USER_PASSWORD in the environment. Production requires PostgreSQL credentials, a ≥32-character auth secret and HTTPS origin. No production credentials were requested, provisioned or committed.

## Limitations and release gates
- M2–M5 are not complete. No PWA installation/service worker, Dexie photo storage, camera/GPS survey, multipart storage, receipt/idempotency pipeline, review UI, reference approval, GIS tiles, MFA or AI classifier is shipped.
- First photos cannot become verified references automatically. Browser camera/GPS/device clocks are untrusted; no offline timestamp attestation is promised. M1 stores no evidence or live worker locations.
- Production PostGIS/pg-path, Docker build, staging, private storage, admin MFA, stricter CSP, reverse-proxy limits, least-privilege runtime role and encrypted backup/restore drills must pass before pilot. Compose bootstrap credentials are not a least-privilege runtime policy.
- M1 inventory/task views are bounded at approximately 10,000 records; add true pagination/export streaming before exceeding the initial 1,000-site footprint. Audit UI shows the latest 200 events while retaining database history.
- Semantic coverage meters are used instead of a charting dependency for the M1 city distribution. Time trends/productivity/review analytics require later history and must not be fabricated.
- Generated local secret and DB live in ignored `.local/`; protect using Windows account permissions. Embedded DB is single-process development only. Integration/browser tests use separate temporary databases.

## Next milestones
M2: implement explicitly downloaded worker tasks, live camera/GPS metadata, Dexie Blob drafts, storage diagnostics, cache-safe shell and durable foreground queue; test on actual Android/iOS under reload, denial, quota and connectivity failure.

M3: private S3/R2 multipart sessions, bounded byte/dimension validation, server hashes and anomaly candidates, receipts, idempotency, immutable/versioned human review and reference policy. M4: independent 50–100-face pilot, security/operational hardening and restore drill. M5 only after verified references and blind evaluation.

Architecture and design are proposed/documented under the user's authorization to proceed non-destructively; they have not been separately signed off by a human reviewer. Cost numbers are planning assumptions, not researched provider quotes. Full technical references: [architecture](docs/ARCHITECTURE.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [test matrix](docs/TEST_MATRIX.md), [deployment](docs/DEPLOYMENT.md).
