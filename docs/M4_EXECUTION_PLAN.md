# M4 execution plan and current-state matrix

Recorded 17 October 2026 (Asia/Karachi). Exact M4 text arrived after the first local hardening pass. This is the reconciliation plan for that text, not a retrospective claim that the unavailable attachment had been read earlier.

## Repository and baseline

Windows PowerShell; repository `D:\Billboard Tracking System`, branch `main`. Clean baseline `9e0f631` exists. Initial M4 local pass produced `2d99c25`, `ae9da73`, `06f5040`, `f80ba1c`; exact-prompt reconciliation begins clean at `f80ba1c`. History is preserved. No reset/reseed/deletion/production action is authorized. Existing demo credentials remain local, never printed.

Earlier inspection covered README/handover, architecture/security/offline/API/rules/test/deployment documents, source, portable/spatial migrations, package scripts, CI and containers. Baseline 52 tests and lint passed before implementation. Current acceptance before reconciliation: 65 tests, six production Chromium journeys, lint/types/build, generated restore and integrity check passed. See handover for timings; these are prior executed results, not newly run results.

## Workstreams and exclusive ownership

| Owner/reality | Scope and owned files | Dependency and pass criterion |
|---|---|---|
| Lead orchestrator | Integration, exact requirement gap audit, M4_EXECUTION_PLAN.md, M4_TEST_REPORT.md, PROJECT_HANDOVER.md; safe lifecycle inventory script/tests | All streams; no untested changes or altered originals, complete regression results |
| Actual operations_audit subagent | Infrastructure/recovery audit, now M4_STAGING_AND_ROLLBACK.md and M4_FIELD_DEVICE_CHECKLIST.md only | Existing scripts/config; reproducible isolated instructions with explicit blockers, no production actions |
| Actual security_audit subagent | Security admission/config implementation already integrated, now M4_SECURITY_REVIEW.md only | Route/test source; authorization matrix, negative checks, realistic MFA/role design, no invented enforcement |
| Actual ui_audit subagent | UI pagination/mutation protections already integrated; current independent worker/PWA/UI/QA gap audit and isolated owned-process restart script | Real API browser tests; report verified defects or gaps, preserve offline/RTL/accessibility |

The environment offers four concurrent slots, including lead. A-G responsibilities are grouped across these three real specialists and the lead; seven separate agents were not spawned or simulated. Shared-file edits are serialized. Integrated code is committed in tested increments. Main was already used safely in the first pass; a feature branch is optional, and no history rewrite is needed.

## Exact-prompt gap work

1. Add the six explicitly requested M4 documents and replace the obsolete missing-prompt blocker with this reconciliation record.
2. Add dry-run-only private lifecycle inventory: explicit isolated targets/opt-in, no filesystem writes/deletion, aggregate reporting, bounded traversal, no symlink following, no deletion eligibility without approved retention/dispute rules. Preserve all referenced originals/chunks and all ambiguous files. Unit-test failure/scope/preservation behavior.
3. Repeat automated acceptance after code changes: lint, typecheck, unit/integration suite, production build, production Chromium suite, production dependency audit. No stale server output or concurrent production build/browser mutation.
4. Preserve portable migrations 001-003, apply repeatable additive schema only where safe. Initial pass already applied 004/005 without reset; use isolated migrations for new fixtures.
5. Update gate matrix, measured artifacts, handover and tested commits; leave clean intentional Git state and no owned server running.

## Gate matrix and external blocker register

| Gate | Current scope / criterion | External prerequisite |
|---|---|---|
| G1 repository | Additive schema, unchanged original migrations/data/credentials, clean intentional commits | No external prerequisite for local integrity |
| G2 automated | All named commands exit 0 against isolated fixtures/current build; audit production separately from dev chain | Local Node/npm/Chromium available; report actual final rerun |
| G3 runtime | Actual Docker image/Compose/PostGIS/private volume/restart checks | Docker Linux engine unavailable; no isolated PostGIS URL; configuration/SQL contracts are not runtime pass |
| G4 devices | Actual Android + iOS HTTPS/PWA/lifecycle/media/GPS/storage cases | Physical devices or valid remote device service and human observations absent |
| G5 pilot | Independent 50-100 Iraq faces, agreement/false-positive/sync/volume/throughput measurements | Actual field sample, workers, supervisors and privacy owner absent |
| G6 deployment/security | HTTPS staging, MFA, runtime role, ACLs, encrypted coordinated recovery, retention/holds, limits/monitoring/rollback | Approved isolated staging infrastructure/URL/credentials, policy owners and deployment identity setup absent |

Node/npm/browser versions and disk/container availability are recorded in M4_TEST_REPORT.md. Runtime/device/pilot/deployment gates remain BLOCKED until actually performed. Local hardening is not pilot release approval. No generic confirmation or billable provisioning is required for this plan.

## Follow-up implementation result

The lifecycle planner was added and passed three targeted tests plus the 68-test full suite. Same-browser logout/isolation/recovery passed, and the repaired seven-flow browser suite passed before an additional loopback-only harness rerun. The owned-server HTTP restart drill passed after acknowledged partial upload, using two distinct directly spawned processes and no unowned process control. Explicit 127.0.0.1 production browser binding replaces the previous general npm start binding for tests only; application/container startup behavior is preserved. Complete final outcomes and intermediate failures are in M4_TEST_REPORT.md.

Final loopback-only browser rerun passed all seven flows in 1.8 minutes. G1/G2 pass locally; G3-G6 remain blocked. No owned test server was left listening on port 3000.
