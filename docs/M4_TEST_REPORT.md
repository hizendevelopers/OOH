# M4 local verification report

Date: 17 October 2026, Asia/Karachi. This report separates executed checks from procedures and external gates. Commands run at the repository root on Windows PowerShell unless stated otherwise. No production environment or real user evidence was used. All passwords/secrets for tests were ephemeral and never printed. Ignored fixtures were retained rather than cleaned destructively.

## Environment and baseline

- Repository: D:\Billboard Tracking System, main, baseline `9e0f631` preserved. Exact-prompt follow-up began clean at `f80ba1c`.
- Node 24.12.0, npm 11.6.2; installed Playwright 1.64.1, Chromium available; Next 16.4.2 production build.
- Docker CLI 29.8.0, Compose 5.5.1 available. `docker version` could not reach `//./pipe/dockerDesktopLinuxEngine`; host psql/pg_dump/pg_restore absent. No isolated IBVS_POSTGIS_TEST_URL configured. No container/PostGIS runtime pass.
- Disk inventory: C:~2.17GB and D:~88.48GB free observed during follow-up. Tests/temp data remain on D: under ignored .local. No user files deleted.
- Initial M4 baseline:52 unit/integration tests and lint passed before changes. First integrated delivery:65 tests/9 files, six production Chromium journeys, lint/types/build, generated restore and integrity CLI passed (details and timings in handover).

## Exact-prompt reconciliation commands and observations

| Command | Exit/result | Scope/evidence |
|---|---|---|
| `npm test -- tests/lifecycle.test.ts` | 0;3 passed,2.41s | Generated evidence, retained bytes, registry classification, bounded/invalid inputs and DB failure |
| `npm test` | 0;68 passed/10 files,119.59s; started17:38:20 | Isolated embedded PostgreSQL, fake IndexedDB, unchanged original regressions; migrations apply/repeat in fixtures |
| `npm run lint` | 0 | New script/tests and project; .local excluded from code lint, no data deletion |
| `npm run typecheck` | 0 | Project TS check; production build also runs TypeScript |
| `npm run build` | 0 | Next compiled3.8s, TypeScript10.9s; private routes/review/field generated |
| `npm run test:browser -- tests/e2e/field.spec.ts --grep "same-browser logout"` | 0;1passed,23.4s | Actual sessions + API/IndexedDB, production build, logout/offline lock/worker isolation/unchanged original Blob recovery |
| First expanded `npm run test:browser` | 1;5passed/2failed,2.4min | Phase1 login helpers did not honor real shared-IP 429 after added account-switch sign-ins; helper fixed, auth limits unchanged; rerun below |
| Repaired `npm run test:browser` | 0;7 passed,2.5min | Phase1 helpers now honor real Retry-After; no auth weakening |
| Final loopback-only `npm run test:browser` | 0; 7 passed, 1.8min; completed 17:49 Asia/Karachi | Explicit 127.0.0.1 production binding; original offline/review flows plus real account-switch regression |
| `npm run test:restart` | 0;22,111ms | Two owned production processes, same authenticated session/partial manifest, seven resumed parts, two original hashes, one receipt with stable replay |
| `npm audit --omit=dev --audit-level=high` | 0;0 vulnerabilities | Executed again during exact-prompt follow-up; full audit from first pass has5 high dev-chain findings/0 critical (braces dependency chain); no forced downgrade |
| `npm run ops:lifecycle-plan` without opt-in | 1 as required | Refused before DB open; missing explicit IBVS_RUN_LIFECYCLE_PLAN=true |
| Explicit isolated `npm run ops:lifecycle-plan` | 0 | Earlier generated restored DB/evidence only:4 referenced files retained,0unregistered,0deletion eligibility; no file/row modification |
| `git diff --check` | 0 at recorded integration checks | Original migrations 001-003 unchanged; final clean commit check below |

The first actual restart attempt exited1 before partial upload with imprecise stage diagnostics. Bounded readiness collection/controlled diagnostic stages were improved; later complete runs passed (agent final21,127ms, parent alias22,111ms). Its initial cause was not conclusively established. No unowned process was terminated. This is local process termination/restart, not power-loss or real PostgreSQL certification.

Earlier standalone `npm run ops:restore-drill` passed in 21,536ms with28 tables/30 rows schema/content fingerprint match and audit mutation denial; restored2 originals/2 parts passed SHA/size/receipt reconciliation. `npm run ops:evidence-check` separately passed against that generated restoration. This is PGlite dumpDataDir/loadDataDir fixture recovery, not encrypted customer-data pg_dump/restore, PostGIS, process power-loss or RPO/RTO certification. Current full unit suite reruns the generated restore contract too.

Browser screenshots under ignored test-results include English desktop and Arabic mobile dark evidence layouts, visually reviewed in the first pass. Tests cover360/390/768/1440 widths, keyboard controls, reduced motion, locales/themes, authenticated full-resolution evidence, first-baseline identity, withdrawal/correction, independent approval, rejection/linked offline resurvey and stable immutable receipts. Camera/GPS/quota/network are simulated Chromium inputs. Account-switch browser test checks actual logout/sign-in and real browser Blob bytes; it does not establish device encryption or remote erasure.

## Measurements and limitations

Synthetic queue fixture:100 faces/526 historical receipts,100-row page,15 samples. Earlier quiet run p50=18.89ms/p95=34.36ms. Follow-up while tests/build/lint competed: p50=45.38ms/p95=718.50ms, recorded17:40:00 Asia/Karachi. Latest aggregate artifact is .local/measurements/review-queue.json. Includes embedded query timing only, excludes network/photos/devices, not a production latency guarantee. No tuning thresholds, calibrated probability or blind field evaluation is claimed.

## Gates

| Gate | Status | Evidence/prerequisite |
|---|---|---|
| G1 repository integrity | PASSED locally | Preserved history/import coordinates/original migrations, additive 004/005, no reseed/deletion/user-password changes |
| G2 automated quality | PASSED locally | 68 tests, lint/types/build/audit and final seven-flow browser passed; intermediate failure retained and repaired |
| G3 Docker/PostGIS runtime | BLOCKED | Enable Docker Linux engine and run isolated staging/container/spatial checks; configuration is not execution |
| G4 real devices | BLOCKED | Actual Android + iOS HTTPS device cases and observations; use M4_FIELD_DEVICE_CHECKLIST.md |
| G5 independent pilot | BLOCKED | Real 50-100 Iraq faces, independent adjudication, false-positive/agreement/throughput/sync/volume measurements |
| G6 deployment/security | BLOCKED | Approved staging URL/HTTPS/identities, enforced MFA, tested least-privilege role/ACLs, encrypted coordinated recovery, retention/holds, proxy/monitoring/rollback |

See M4_EXECUTION_PLAN.md for actual grouped agent ownership, M4_SECURITY_REVIEW.md for security vs source-only coverage, M4_OPERATIONS.md for recovery/lifecycle scope and M4_STAGING_AND_ROLLBACK.md for safe isolated commands. No deployment, device/pilot sign-off, billable provisioning or destructive cleanup was performed.

Final acceptance on 17 October 2026: G1/G2 pass locally; G3-G6 blocked. Generated fixture restores/inventories and actual owned local application process restart passed within their documented scope. The final production Chromium harness closed its owned server, and restart drills closed their own directly spawned processes. Repository checks/commits are recorded in PROJECT_HANDOVER.md. No deployment or physical pilot readiness is inferred.

Safe local next commands: `npm run build`, `npm run test:browser`, `npm run test:restart`, `npm run ops:restore-drill`. These create generated fixtures; do not substitute an existing deployment/database. For isolated runtime staging prerequisites follow M4_STAGING_AND_ROLLBACK.md; for actual phones follow M4_FIELD_DEVICE_CHECKLIST.md. Integrity/lifecycle commands require explicit quiesced isolated targets and opt-in, not defaults.

FINAL VERDICT: LOCAL M4 HARDENING PASSED; PILOT RELEASE READY: NO. The feasible local scope passed; runtime, physical devices, independent Iraq pilot and staging/security operational prerequisites have not passed.

## Tested commit record

| Commit | Scope and verification |
|---|---|
| 2d99c25 | Generated restore/reconciliation and disposable spatial CI; included in first65-test/six-browser acceptance |
| ae9da73 | Analysis admission, cheap receipt replay, CSP/evidence configuration; first integrated65tests/build/browser |
| 06f5040 | Keyset review/API/UI and mutation guards; pagination tests and six production journeys |
| f80ba1c | First-pass documentation with missing-prompt caveat, now superseded by exact-prompt reconciliation |
| 015dfec | Dry-run lifecycle inventory and lint data exclusion;3targeted/68full tests, lint/types/build |
| 23e0efa | Actual owned production-server restart; final parent alias22,111ms and targeted lint/typecheck |
| 1861e1f | Offline account isolation/recovery, login Retry-After helper, loopback-only production browser; final7flows/1.8minutes, lint/types |

Final documentation commit follows these tested increments. Current branch remains main; clean status is verified after that commit. Original Phase1-3 migration files remain unchanged. The source tests are isolated; preserving originals does not imply database/filesystem superusers cannot alter data outside application controls.
