# IBVS project handover

Updated: 17 October 2026, Asia/Karachi. Delivery: Phase 1/2 preserved; Phase 3 human verification implemented and automated local acceptance passed. No external deployment or real-phone certification.

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

## Phase 1/2 verification evidence (historical baseline)
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
- One server inspection attempt per assignment is supported. Queued evidence metadata is frozen; expired login can retry after signing in, while task conflicts/corrupt uploads remain blocked with originals retained. Phase 3 now adds linked audited resurvey tasks/new attempts without deleting history. Abandonment and interrupted invalid-attempt operational recovery remain future work.
- Browser persistence/available quota are advisory. Quota failures keep an unsaved photo only in memory and show an explicit retry warning. Clearing storage, private mode, eviction or device loss can destroy local data. Local originals remain after server receipt; logout/device lock is not encryption or physical deletion.
- Foreground retries run on reopen/reconnect and every 10 seconds with exponential backoff (cap 5 minutes), with manual retry. Nothing is promised while a browser is suspended/closed. Bump the service-worker cache version for a shell release and close clients to activate updates; never force-update during a capture.

## Next milestones
Incremental commits from baseline `318ba13`: `d6069a0` private resumable evidence APIs (34 tests + lint/typecheck/build); `c9a119a` bilingual offline PWA (41 tests + five production-browser flows + lint/typecheck/build); final hardening/documentation commit follows these. Phase 1 baseline was reverified before changes (26 tests + three browser flows + lint/typecheck/build).

System C: drive was full during verification. Tests now use ignored workspace-local databases and temporary directories. No user files were deleted.

M2 device gate: test actual Android/iOS over HTTPS under reload, camera rotation/denial, GPS freshness/accuracy, storage pressure, suspend/reopen, network flaps and PWA installation/update. Desktop tests reopen the database but do not kill the server process or emulate physical power loss.

M3 review/reference/risk/resurvey is implemented locally. Remaining operational work: normalize GPS/sync metadata as reporting needs grow; scanner/derivative jobs, chunk/orphan cleanup and retention/dispute holds. Add S3/R2 adapter if choosing distributed/ephemeral hosting. Measure field media volumes/latency, enforce operational quotas/rate limits, and perform coordinated DB/private-volume backup/restore and process-crash recovery. M4: independent 50–100-face pilot and security pass. M5 only after verified references and blind evaluation.

Architecture and design are proposed/documented under the user's authorization to proceed non-destructively; they have not been separately signed off by a human reviewer. Cost numbers are planning assumptions, not researched provider quotes. Full technical references: [architecture](docs/ARCHITECTURE.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [test matrix](docs/TEST_MATRIX.md), [deployment](docs/DEPLOYMENT.md).


## Phase 3 delivery
Continued from verified `318ba13`, `d6069a0`, `c9a119a`, `f42067a`; initial working tree was clean. Read repository documentation, migrations and tests before implementation. Baseline re-verification passed 45 automated tests, lint, typecheck, production build and five production Chromium flows. Docker CLI could not connect to its Linux engine, so no Docker/PostGIS runtime pass is claimed.

- Migration 003 preserves 001/002 and existing receipts/drafts. Adds optimistic review projections and immutable decision/risk/reference/withdrawal history, linked follow-up assignments and completed-media mutation protection. Applied successfully to the existing local database and repeatedly to isolated integration databases.
- Organization-authorized supervisor APIs and /review workspace: pending queue plus worker/city/date/billboard/risk/capture filters; authorized front/wide viewer and full-resolution dialog; GPS coordinate map/uncertainty/neighbor candidates; claimed versus received times; hashes, part counts, media receipts, risk runs, decisions and sync audit history. English/Arabic RTL, light/dark, desktop shortcuts, responsive and recovery states retained.
- Explainable ibvs-risk/1.0.0 checks cover exact SHA-256 and DCT perceptual candidates, cross-worker duplicates, nearby face ambiguity, GPS distance/accuracy/freshness, timestamp gaps, conservative travel/overlap, offline/online challenge classification and image integrity/resolution/quality. No probabilities, automated worker accusations or automatic first-photo references.
- Explicit exact-face baseline enrollment records structural shape/mounting/face count/facing/landmarks and versions both original photo hashes. Invalid baselines require reasoned withdrawal before correction. Ambiguous/high-risk cases require distinct supervisor approvals on the same current assessment; integrity failures block approval.
- Review/resurvey mutations bind operation digest, actor, organization, case version and current assessment. Exact retries return previous results. A resurvey creates a new worker-bound task with instructions, due date and original inspection link. Worker downloads show decisions; new task drafts use existing offline Blob/retry behavior. Historical receipts remain immutable.
- Added unit/integration tests for rules/decoding, duplicate/neighbor/GPS/timestamp signals, missing private originals, reviewer scope, concurrent retry, independent approvals, versioned baseline withdrawal/correction and linked resurvey. Existing offline failures, GPS denial, task tampering, challenge expiry, quota and interrupted synchronization tests remain intact. Added a production-browser supervisor/resurvey journey; final results recorded below after acceptance.

Tested implementation commits: `05966e5` versioned risk analysis, immutable supervisor decisions, migration/API and first integration tests (51 tests + lint/typecheck); `6179575` stale-reference review holds, bounded private reads, audit/retry hardening and expanded integration checks (52 tests + production build); `3312e1f` premium bilingual review center, worker feedback and linked offline resurvey acceptance (six production Chromium flows). Documentation/optional spatial-check delivery follows. Local package dependencies needed restoration from the lockfile after the resumed environment; source/data were preserved.

### Phase 3 verification results
All results are local and measured, not staging, production-deployment or real-phone certification.

| Check | Phase 3 result |
|---|---|
| `npm run db:migrate` | Migration 003 applied to the existing local database; final repeat passed without resetting/reseeding. Tests also apply/repeat 001/002/003 in isolated databases. |
| `npm test` | 52 tests passed across six files (last recorded run 40.36s). Includes database permissions/immutability, stale-reference holds, duplicates/neighbor/GPS/time signals, concurrent retry, explicit references and resurvey; all Phase 2 regressions retained. |
| `npm run lint` | Passed, no warnings/errors. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed; /review and private review APIs included in production route output. |
| `npm run test:browser` | All six production Chromium flows passed (1.6 minutes). New supervisor journey passed independently first (16.6s). Complete run retains login throttling and honors Retry-After. |
| `npm audit --omit=dev --json` | Zero production dependency vulnerabilities reported. Full dev audit limitation below. |
| Docker/PostGIS runtime | Not run: Docker Linux-engine pipe unavailable; no `IBVS_POSTGIS_TEST_URL` configured. SQL contract unit tests pass; they are not runtime spatial certification. |
| Real Android/iOS, staging/production deployment, backup/restore, remote CI | Not run. |

The new browser flow checks authorized image loading/full-resolution dialog, adjacent-face/low-accuracy/offline signals, combined queue filters, two supervisors, repeat-approval denial, explicit reference enrollment/withdrawal, rejection and resurvey, historical assessment drill-down, Arabic/dark 360/390/768/1440 layouts, offline new-task capture, acknowledged IndexedDB queue persistence across reload and server receipt after reconnect. Browser screenshots are ignored test artifacts under test-results; English evidence and Arabic mobile dark layouts were visually inspected. These use test-only JPEG fixtures and fake browser media/GPS, never real-phone claims.

Acceptance refinement: the resurvey test initially reloaded before the asynchronous IndexedDB queue acknowledgement. Local originals correctly remained local. The final test waits for the explicit queued state before reload and then validates the received state after reconnect. No receipt or review status is fabricated. Select controls now have explicit accessible names; photo-load retry and localized recovery states are implemented.

### Remaining release gates and next requirements
1. Run the opt-in PostGIS runtime contract against an isolated `IBVS_POSTGIS_TEST_URL` (`npm run test:postgis`); apply `db/spatial.sql` with migration credentials. Production analysis deliberately requires PostGIS rather than silently using the development math. PostgreSQL pool/networking, geography indexes and production schema need staging verification.
2. Actual Android/iOS camera/GPS, HTTPS installation/update, suspend/eviction/low-storage/network and orientation tests, plus an independent 50-100-face pilot with neighboring boards. Chromium media/GPS/quota faults are simulated.
3. Synchronous analysis is bounded (10,000 media candidates, 500 worker inspections, 101 neighbors); queue is capped at 500. Add pagination, indexed retrieval, leased jobs and batch analysis of historical receipts before scale. Historical Phase 2 queue entries need explicit Reanalyze; missing/failed analysis never approves a case.
4. Current pHash/quality/travel thresholds are operational heuristics. Collect representative field cases, measure false positives and independent reviewer agreement, and blind-test before tuning or considering AI retrieval. Do not call severity a calibrated fraud probability. Browser camera, GPS, time and EXIF remain untrusted.
5. Single-host private disk remains the storage adapter. Malware scanning, background derivatives, chunk/orphan cleanup, retention/holds, encrypted storage/backups, process-crash and restore drills, administrator MFA, least-privilege database role, CSP/rate/body limits and staging security review remain required before Internet/pilot release.
6. Withdrawal preserves invalid references and evidence for audit. No automatic deletion or claim of immutable protection against database/filesystem superusers is made. Two-supervisor review mitigates ambiguity; it does not establish forensic identity or prevent collusion.
7. /review map is a metric coordinate diagram with accuracy circles, explicitly without street tiles. A licensed geographic basemap is a future optional integration; no fake map imagery or fabricated production data is used.

References: docs/PHASE3_API.md, docs/FRAUD_RULES.md, docs/PHASE3_PLAN.md and updated architecture/security/data/offline/test/manual documents.

Additional hardening: changed assessments reopen approved cases with fresh epochs and put mismatched baselines on review hold, excluding them from verified counts. Exact hash detection includes historical received media even without pHash records; candidate ordering is deterministic and truncated scope is flagged. Historical risk reports are available through authorized drill-down; baseline versions link to their exact original inspection images. Private reads allocate no more than 6MiB and close file descriptors on failure.

Dependency audit on 17 October: production-only audit reports zero vulnerabilities. Full audit reports five high development-chain findings rooted in the unpatched `braces` 3.0.3 stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm, through micromatch/fast-glob/Next ESLint configuration. The registry's current braces release is 3.0.3; npm's suggested forced remediation downgrades eslint-config-next to 14.2.35. No forced framework-lint downgrade was applied. Track the upstream patch; do not feed untrusted glob patterns to development tooling.
