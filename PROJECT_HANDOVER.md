# IBVS project handover

Updated: 16 October 2026, Asia/Karachi. Delivery: Phase 1 preserved and Phase 2 implemented/tested locally; no external deployment or real-phone certification.

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
- Phase 2 `/field` worker PWA: public static offline shell, install manifest/icons, explicit task download, live getUserMedia capture, GPS accuracy/denial observations, front/wide required JPEG Blobs, quota/persistence diagnostics and English/Arabic responsive UI.
- Worker-scoped Dexie queues with stable operation keys, foreground backoff, persisted part resume, receipt recovery after lost response, session/account revalidation and explicit local/queued/uploading/blocked/server-received states. Camera tracks stop when hidden, unmounted or queued.
- Private persistent filesystem evidence (outside public assets), authenticated chunk/media APIs, server SHA-256 and bounded JPEG decode, task/face/version binding, challenge expiry flags, immutable final receipts and atomic assignment/audit updates. No automatic baseline approval.

## Verification evidence
All results below are local, not staging or real-phone certification.

| Check | Result |
|---|---|
| `npm test` | 45 passed across domain, PostgreSQL/evidence integration, IndexedDB/sync failure and environment validation (42.9s) |
| `npm run lint` | Passed; no warnings/errors in last recorded run |
| `npm run typecheck` | Passed |
| `npm run build` | Passed after final hardening; production routes generated without build warnings |
| `npm run test:browser` | 5 Chromium production-build flows passed after HTTP hardening (42.0s) |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities reported |
| Docker/PostGIS runtime, CI on remote runner, staging smoke, backup restore | Not run |
| Real Android/iOS, actual device camera/GPS, OS eviction/background lifecycle | Not run; browser media/GPS/quota/network behavior is simulated in automated tests |

Browser acceptance covers admin sign-in → valid CSV preview/import → select/assign → worker detail; cross-worker 404, worker inventory 403, CSRF 403, anonymous 401, health, invalid coordinates, English/Arabic RTL, light/dark, reduced motion, offline warning and 360/390/768/1440 widths. Screenshots are in ignored `test-results/`. Test passwords are ephemeral; browser traces are disabled to avoid retaining login payloads.

Phase 2 browser acceptance additionally covers live fake-camera front/wide capture, GPS denied and successful (17m accuracy) observations, offline queue + offline reload, resumed upload after aborted wide-photo request, stable final receipt replay, scoped authenticated media, no API cache entries, simulated native IndexedDB quota exhaustion with retry, camera denial and Arabic/dark field screens at all four widths. Final hardening adds wrong-face HTTP rejection and cross-worker inspection/part/media/submission denial. These are desktop Chromium simulations, not field-device measurements.

Database acceptance covers migration repeat, import rollback, duplicate rejection, original-coordinate/code/audit mutation denial, batch rollback, active-task conflicts, organization isolation, worker authorization and disabled signup. Embedded PostgreSQL is an actual database engine but does not validate production pg networking, pool behavior or PostGIS.

## Run / account setup
See [README.md](README.md) for exact PowerShell commands. `npm ci`, `npm run db:migrate`, set a user-chosen IBVS_DEMO_PASSWORD securely, `npm run db:seed`, `npm run dev`. Accounts: admin@demo.ibvs.test, worker@demo.ibvs.test and worker2@demo.ibvs.test; use your supplied password. No default password exists. Normal workspace `.local/postgres` currently has the migrated empty schema, not automatically seeded user accounts.

Production organization: `npm run org:create -- "Iraq Operations" iraq-operations`; then use `npm run user:create` with IBVS_USER_PASSWORD in the environment. Production requires PostgreSQL credentials, a ≥32-character auth secret, HTTPS origin and private persistent absolute IBVS_EVIDENCE_DIR. No production credentials were requested, provisioned or committed. Existing installs run `npm run db:migrate` for additive migration 002; schema 001 and original imports were preserved.

## Limitations and release gates
- Phase 2 implementation passes local acceptance; M2 real-phone sign-off remains outstanding. Phase 3 review UI/versioned decisions, controlled resurvey attempts, verified references, perceptual matching, GIS, MFA and AI are not shipped. No production/staging deployment is claimed.
- First photos cannot become verified references automatically. Browser camera/GPS/device clocks and connectivity labels are untrusted; no offline timestamp attestation is promised. Online challenge issuance/expiry is recorded but does not prove genuine capture. GPS is requested explicitly, never continuously.
- Production PostGIS/pg-path, Docker build, staging/private-volume validation, admin MFA, stricter CSP, reverse-proxy limits, least-privilege runtime role and encrypted backup/restore drills must pass before pilot. Compose bootstrap credentials are not a least-privilege runtime policy.
- M1 inventory/task views are bounded at approximately 10,000 records; add true pagination/export streaming before exceeding the initial 1,000-site footprint. Audit UI shows the latest 200 events while retaining database history.
- Semantic coverage meters are used instead of a charting dependency for the M1 city distribution. Time trends/productivity/review analytics require later history and must not be fabricated.
- Generated local secret and DB live in ignored `.local/`; protect using Windows account permissions. Embedded DB is single-process development only. Integration/browser tests use separate temporary databases.
- Private evidence is a single-host persistent directory, not R2/S3. Authenticated proxy access replaces signed object URLs. No ephemeral/serverless or unshared multi-host deployment is supported. Compose adds an evidence volume but Docker/volume permissions have not been exercised.
- Photos are JPEGs, capped at 6MiB / 24MP, encoded by the browser at max 2048px long edge. Server originals and intermediate chunks remain; no cleanup/retention job, malware scan or background derivative worker exists yet. Plan roughly twice original media storage plus backups until cleanup is implemented.
- One server inspection attempt per assignment is supported. Queued evidence metadata is frozen; expired login can retry after signing in, while task conflicts/corrupt uploads remain blocked with originals retained. Phase 3 must add audited abandonment/resurvey/new-attempt recovery rather than deleting history.
- Browser persistence/available quota are advisory. Quota failures keep an unsaved photo only in memory and show an explicit retry warning. Clearing storage, private mode, eviction or device loss can destroy local data. Local originals remain after server receipt; logout/device lock is not encryption or physical deletion.
- Foreground retries run on reopen/reconnect and every 10 seconds with exponential backoff (cap 5 minutes), with manual retry. Nothing is promised while a browser is suspended/closed. Bump the service-worker cache version for a shell release and close clients to activate updates; never force-update during a capture.

## Next milestones
Incremental commits from baseline `318ba13`: `d6069a0` private resumable evidence APIs (34 tests + lint/typecheck/build); `c9a119a` bilingual offline PWA (41 tests + five production-browser flows + lint/typecheck/build); final hardening/documentation commit follows these. Phase 1 baseline was reverified before changes (26 tests + three browser flows + lint/typecheck/build).

System C: drive was full during verification. Tests now use ignored workspace-local databases and temporary directories. No user files were deleted.

M2 device gate: test actual Android/iOS over HTTPS under reload, camera rotation/denial, GPS freshness/accuracy, storage pressure, suspend/reopen, network flaps and PWA installation/update. Desktop tests reopen the database but do not kill the server process or emulate physical power loss.

M3: build authorized admin evidence review with original/context viewer, actor/reason/version concurrency, audited resurvey attempts and reference approval; normalize GPS/sync metadata as reporting needs grow; add perceptual duplicates/nearby candidates without auto-approval, scanner/derivative jobs, chunk/orphan cleanup and retention/dispute holds. Add S3/R2 adapter if choosing distributed/ephemeral hosting. Measure field media volumes/latency, enforce operational quotas/rate limits, and perform coordinated DB/private-volume backup/restore and process-crash recovery. M4: independent 50–100-face pilot and security pass. M5 only after verified references and blind evaluation.

Architecture and design are proposed/documented under the user's authorization to proceed non-destructively; they have not been separately signed off by a human reviewer. Cost numbers are planning assumptions, not researched provider quotes. Full technical references: [architecture](docs/ARCHITECTURE.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [test matrix](docs/TEST_MATRIX.md), [deployment](docs/DEPLOYMENT.md).
