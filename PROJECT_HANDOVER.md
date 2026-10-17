# IBVS project handover

Updated: 17 October 2026, Asia/Karachi. Delivery: Phase 1/2/3 preserved; M4 local security, review and operations hardening passed automated acceptance. Real field pilot remains outstanding. No external deployment or real-phone certification.

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
See [README.md](README.md) for exact PowerShell commands. `npm ci`, `npm run db:migrate`, set a user-chosen IBVS_DEMO_PASSWORD securely, `npm run db:seed`, `npm run dev`. Accounts: admin@demo.ibvs.test, worker@demo.ibvs.test and worker2@demo.ibvs.test; use your supplied password. No default password exists. The normal workspace `.local/postgres` now contains explicitly initialized demo accounts, including reviewer2@demo.ibvs.test, with the user-requested local password. M4 preserved those credentials/data; no password is committed. The earlier empty-schema state is historical.

Production organization: `npm run org:create -- "Iraq Operations" iraq-operations`; then use `npm run user:create` with IBVS_USER_PASSWORD in the environment. Production requires PostgreSQL credentials, a ≥32-character auth secret, HTTPS origin and private persistent absolute IBVS_EVIDENCE_DIR. No production credentials were requested, provisioned or committed. Existing installs run `npm run db:migrate` for all outstanding additive migrations through 005; schemas 001-003 and original imports were preserved during M4.

## Limitations and release gates
- Phase 2 implementation passes local acceptance; M2 real-phone sign-off remains outstanding. Phase 3 review UI/versioned decisions, controlled resurveys, explicitly enrolled references and perceptual matching are implemented locally. Production GIS runtime, MFA and AI remain unverified or future work. No production/staging deployment is claimed.
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
3. Synchronous analysis is bounded (10,000 media candidates, 500 worker inspections, 101 neighbors); the legacy queue array is capped at 500, while M4 adds indexed keyset UI pagination and database admission leases. Durable background jobs and batch analysis of historical receipts remain future scale work. Historical Phase 2 queue entries need explicit Reanalyze; missing/failed analysis never approves a case.
4. Current pHash/quality/travel thresholds are operational heuristics. Collect representative field cases, measure false positives and independent reviewer agreement, and blind-test before tuning or considering AI retrieval. Do not call severity a calibrated fraud probability. Browser camera, GPS, time and EXIF remain untrusted.
5. Single-host private disk remains the storage adapter. Malware scanning, background derivatives, chunk/orphan cleanup, retention/holds, encrypted storage/backups, process-crash and restore drills, administrator MFA, least-privilege database role, CSP/rate/body limits and staging security review remain required before Internet/pilot release.
6. Withdrawal preserves invalid references and evidence for audit. No automatic deletion or claim of immutable protection against database/filesystem superusers is made. Two-supervisor review mitigates ambiguity; it does not establish forensic identity or prevent collusion.
7. /review map is a metric coordinate diagram with accuracy circles, explicitly without street tiles. A licensed geographic basemap is a future optional integration; no fake map imagery or fabricated production data is used.

References: docs/PHASE3_API.md, docs/FRAUD_RULES.md, docs/PHASE3_PLAN.md and updated architecture/security/data/offline/test/manual documents.

Additional hardening: changed assessments reopen approved cases with fresh epochs and put mismatched baselines on review hold, excluding them from verified counts. Exact hash detection includes historical received media even without pHash records; candidate ordering is deterministic and truncated scope is flagged. Historical risk reports are available through authorized drill-down; baseline versions link to their exact original inspection images. Private reads allocate no more than 6MiB and close file descriptors on failure.

Dependency audit on 17 October: production-only audit reports zero vulnerabilities. Full audit reports five high development-chain findings rooted in the unpatched `braces` 3.0.3 stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm, through micromatch/fast-glob/Next ESLint configuration. The registry's current braces release is 3.0.3; npm's suggested forced remediation downgrades eslint-config-next to 14.2.35. No forced framework-lint downgrade was applied. Track the upstream patch; do not feed untrusted glob patterns to development tooling.


## M4 local hardening delivery
Requested on 17 October 2026 with explicit parallel delegation and no destructive/production actions. Repository began clean at `9e0f631`. During the first pass, the only accessible attachment was the original 16 October IBVS master prompt; its M4 definition is pilot hardening, independent manual verification, security and measured performance. No separate M4 master prompt attachment was found; its text was requested while safe local work continued. This delivery does not claim execution of an unavailable attachment or completion of an actual 50-100-face pilot.

Independent security, operations and UI workstreams inspected the implementation and performed final integration reviews with no blocking defects found. Baseline re-verification passed 52 tests and lint. Changes preserve migrations 001-003, private originals, existing local demo accounts/passwords, English/Arabic theme/design and offline drafts. No plaintext credential is recorded here.

### Tested increments

- `2d99c25`: generated-fixture snapshot restore with full schema/row fingerprints and audit immutability; explicitly scoped read-only registered-evidence reconciliation; operations tests and isolated PostGIS CI configuration.
- `ae9da73`: organization/actor database admission limits before image reads, cheap immutable receipt replay with explicit supervisor analysis recovery, production CSP without eval, fail-fast absolute production evidence paths and security/environment tests. Migration 004 is additive.
- `06f5040`: authorized filter-bound keyset pages with exact microsecond receipt ordering, migration 005 index, legacy API compatibility, bilingual Load more, synchronous supervisor mutation locks and extended database/production-browser acceptance.
- Final documentation reconciles historical status, API contracts, resource limits and operational scope; adds the independent field pilot protocol. Risk rule semantics remain `ibvs-risk/1.0.0`.

### Final integrated verification

All results below were actually executed locally against this implementation. Test fixtures are isolated/generated; no real evidence, field observations, approvals or performance results are fabricated.

| Check | Actual result |
|---|---|
| `npm run db:migrate` | Applied additive 004/005 to the existing local DB without reset/reseed. Tests also apply portable migrations to isolated databases. |
| `npm test` | 65 passed across 9 files, 97.47s. Includes original offline/security/review regressions plus 4 security, 3 operations, 5 pagination and 1 environment checks. |
| `npm run lint` / `npm run typecheck` | Both passed. |
| `npm run build` | Passed production build, including private APIs and review/field routes. |
| `npm run test:browser` | All 6 production Chromium flows passed, 1.8 minutes. Includes actual paged API loading, one immutable decision despite duplicate in-flight shortcuts/submission/navigation, Arabic keyboard tabs and existing offline/resurvey flows. |
| Visual review | Current English desktop evidence and Arabic 390px dark screenshots inspected. Browser layout checks cover 360/390/768/1440 widths. Test-only JPEGs are synthetic fixtures; media/GPS faults are simulated. |
| `npm run ops:restore-drill` | Standalone passed, 21,536ms; persisted PGlite snapshot restored into a new target, 28 tables/30 rows matched complete fingerprints/schema, immutable audit mutation rejected, 2 originals/2 parts verified. No application/user DB was restored over. |
| `npm run ops:evidence-check` | Positive standalone check passed against only that generated restored fixture: 2 media/2 parts/2 originals, all failure counters zero. Missing opt-in refused before DB access; negative fixtures are tested. |
| Local queue timing | 15 samples: p50 18.89ms / p95 34.36ms for a 100-row page across 100 synthetic faces/526 receipts in embedded PostgreSQL. Excludes network, photos, workers and production load; not a field latency guarantee. Aggregate artifact: ignored `.local/measurements/review-queue.json`. |
| Dependency audit | Production-only audit: 0 vulnerabilities. Full audit: 5 high development-chain findings, 0 critical; upstream braces chain described above. No forced framework downgrade. |
| `git diff --check` | Passed. Original migrations 001-003 unchanged. |
| Docker / PostGIS runtime / remote CI | Not run: Docker Linux-engine pipe unavailable and no isolated PostGIS URL configured. Disposable CI job added but not observed executing. |
| Real Android/iOS / actual 50-100-face pilot / staging / production | Not performed. No production changes or deployment. |

### Remaining constraints and required external work

1. The exact M4 prompt arrived after this first pass; reconciliation results and requirements are recorded below. Follow [M4_PILOT_RUNBOOK.md](docs/M4_PILOT_RUNBOOK.md) for real independent face adjudication, actual device behavior, measured field outcomes, privacy ownership and accountable sign-off. Synthetic 100-face tests do not replace a field pilot.
2. Run Docker/production PostgreSQL/PostGIS and the configured CI spatial job, then staging schema/pool/permissions/geography checks. Embedded tests do not certify real PostgreSQL multi-process admission concurrency or production query performance.
3. Analysis admits two active leases per organization, up to 60 actor starts/minute and 180 organization starts/minute. Five-minute crash expiry does not terminate a stuck decoder; add processing isolation/timeouts and durable jobs before broader load. Initial receipt analysis is attempted once; replay is cheap even when analysis was deferred. Explicit authorized Reanalyze is required for recovery. No successful assessment means no approval.
4. The UI pages through the queue; the compatibility array is still capped at 500. Candidate/history bounds, unpaginated case history and synchronous image analysis remain constraints. Risk thresholds remain uncalibrated heuristics; no fraud probabilities or tamper-proof browser signals are claimed.
5. Complete MFA, nonce/hash CSP (framework inline scripts/styles remain allowed), edge request/rate protections, least-privilege runtime roles, malware/derivative isolation, capacity monitoring and retention/dispute workflows. No automatic orphan/chunk deletion or repair was introduced.
6. Perform coordinated encrypted production-like PostgreSQL/private-volume backup and isolated restoration, physical/process-crash recovery and measured RPO/RTO. The generated PGlite drill proves only its documented local fixture recovery path. Reconciliation checks registered files and receipts, not orphan enumeration, physical durability or full legal/reference semantics. See [M4_OPERATIONS.md](docs/M4_OPERATIONS.md).
7. Browser offline originals remain subject to eviction/device loss; tests use fake media/GPS and simulated failures. No physical phone, power-loss or production evidence-storage certification is claimed. Existing local accounts and requested passwords were preserved, not promoted to a production identity policy.

M4 is locally hardened and automatically verified within the scope above; field/operational sign-off remains open. No destructive repair, deletion, production action or external messaging was performed.

## Exact M4 prompt reconciliation (17 October 2026)

The owner supplied the complete M4 text after `f80ba1c`. The earlier missing-attachment note describes that first pass only; the prompt is now available and no longer a blocker. Actual subagents were reused: operations authored staging/rollback and actual-device procedures, security authored a route/control/negative-test matrix plus unenforced MFA and proposed least-privilege designs, and PWA/QA added a real same-browser session-isolation regression. Seven specialist responsibilities were grouped across three actual agents and lead integration; seven separate agents were not simulated.

Added all six specifically requested execution/test/device/staging/security/handover records. Added explicit-target, bounded, aggregate-only lifecycle inventory with no deletion mode: unknown/unregistered/old temporary objects remain retained, deletion eligibility zero pending approved retention/holds. Excluded ignored `.local/` runtime/fixture data from ESLint traversal. Corrected a misleading database-reopen test comment; closeDb in one process is not process restart.

The new same-browser production Chromium regression uses real logout/login, offline lock, a different worker and return to the original account, checking unchanged IndexedDB Blob bytes/hash/operationId and no cross-worker evidence writes. First targeted run passed (23.4s). The first expanded full run found older Phase 1 login helpers did not handle legitimate shared-IP 429 throttling; those helpers now honor Retry-After without changing auth policy. Both repaired reruns passed all seven flows (2.5 minutes, then 1.8 minutes with explicit loopback binding). Final completion was at 17:49 Asia/Karachi; M4_TEST_REPORT.md retains the failed intermediate run.

Latest unit/integration rerun passed 68 tests across 10 files (119.59s), including three new lifecycle tests. Production build, types, lint and production audit passed; latest contended queue fixture measurement was p50 45.38ms/p95 718.50ms across 15 samples (17:40 Asia/Karachi), versus earlier quiet measurements above. This variability is explicitly not a production latency promise. Runtime inventory: Node 24.12.0/npm 11.6.2, Playwright 1.64.1, Docker CLI 29.8.0/Compose 5.5.1, unavailable Linux engine and host PostgreSQL tools; ~2.17GB C: and 88.48GB D: free observed. No user files were deleted to recover space.

Current gate status: G1/G2 local acceptance passed after the final rerun; G3 runtime, G4 real devices, G5 independent field pilot, G6 staging/security deployment remain blocked. No billable service, external infrastructure or production account action was performed. See M4_EXECUTION_PLAN.md, M4_TEST_REPORT.md, M4_SECURITY_REVIEW.md, M4_STAGING_AND_ROLLBACK.md, M4_FIELD_DEVICE_CHECKLIST.md, M4_PILOT_RUNBOOK.md and M4_OPERATIONS.md for execution evidence and safe next steps.

Exact-prompt recovery increment: `test:restart` now verifies an actual directly owned loopback production server SIGKILL/new-process recovery after an acknowledged partial chunk. Final parent run passed in 22,111ms: same auth session and part manifest survived, seven remaining chunks resumed, two original hashes matched, one received history entry and stable receipt replay. First incomplete attempt failed before upload with insufficient diagnostic precision; readiness collection/stage diagnostics improved and repeated final runs passed. Physical power loss/PostGIS/container recovery remains unverified. Production Playwright now uses an explicit 127.0.0.1 command rather than the general public application bind; Docker/app runtime configuration is unchanged.

Exact-prompt tested commits: `015dfec` read-only lifecycle inventory, explicit targets/limits and preservation tests (three focused and 68 full tests); `23e0efa` actual owned production server restart/resumable HTTP verification (final parent run22,111ms, agent final21,127ms). `1861e1f` adds same-browser session/Blob recovery, throttle-aware Phase 1 helpers, explicit loopback production-browser binding and the corrected DB-reopen comment; its final seven-flow run passed. The final documentation commit records these measured outcomes and all six required reports. Final seven-flow production Chromium run passed in1.8minutes with the explicit loopback command. Lint/types/build passed; production audit zero vulnerabilities, known five high development-chain findings remain. No owned drill/browser service was left running.

All six requested records now exist: docs/M4_EXECUTION_PLAN.md, docs/M4_TEST_REPORT.md, docs/M4_FIELD_DEVICE_CHECKLIST.md, docs/M4_STAGING_AND_ROLLBACK.md, docs/M4_SECURITY_REVIEW.md and this handover. Original migration001-003 diff remains empty. No real account password, uploaded evidence, imported coordinate, immutable audit or Git history was reset or deleted.

FINAL VERDICT: LOCAL M4 HARDENING PASSED; PILOT RELEASE READY: NO. G3-G6 require the actual external prerequisites and sign-off described above, not simulated certification.
