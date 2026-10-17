# M4 pilot protocol and release gates

This is an execution protocol, not a record of a completed field pilot. Local automated checks, generated-data restore tests and synthetic performance observations do not establish real-phone, staging or production readiness. The exact M4 text arrived after the first local pass; see M4_EXECUTION_PLAN.md and M4_TEST_REPORT.md for reconciliation. The original and exact prompts require pilot hardening for 50–100 faces, independent manual verification, audit/security checks and measured performance.

## Before a field pilot

- Preserve a coordinated database/private-volume backup. Restore only into a new isolated target. Never run a restore over the live database or treat the generated PGlite drill as production backup certification.
- Run portable migrations, `db/spatial.sql` and the opt-in PostGIS contract on an isolated staging database. Verify runtime-role permissions, network/pool behavior, geography queries and the production image on the intended host.
- Establish HTTPS, administrator MFA, least-privilege runtime credentials, encrypted evidence/backups, retention/dispute ownership and private-volume ACLs. Verify proxy request/rate limits and capacity alerts. Current CSP removes production eval but still allows framework inline scripts; nonce CSP remains future hardening.
- Assign an accountable pilot lead, two independent supervisors, workers, an incident contact and a privacy/retention owner. Obtain the organization's approved collection/consent instructions. Collect location on explicit inspection action only.
- Use distinct accounts and production-appropriate secrets. Development/demo account setup is not a pilot identity policy. No credentials belong in this document, Git, screenshots or browser traces.

## Select 50–100 real faces

Record actual immutable face IDs and imported location uncertainty. Include adjacent structures, opposite faces on one structure, similar advertising creative, imperfect coordinates and low-signal sites. Include representative Iraqi cities/zones and the actual device/browser mix. Do not manufacture a completed sample with generated photos or synthetic locations.

Before worker submission, independently visit and describe the physical face: structure shape, mounting, face count, orientation and distinctive landmarks. Keep this physical identity adjudication independent of the worker's advertising crop and GPS claim. Treat uncertain identity as ambiguous rather than guessing. Existing source coordinates and worker photographs remain provisional.

## Device and inspection execution

Test actual Android and iOS browsers/PWA over HTTPS: install/update, landscape/portrait, camera permission denial/recovery, GPS denial/poor accuracy, low storage, offline capture, reload, suspend/reopen, network flaps and interrupted upload. Protect originals and do not clear browser storage to recover a queue. Verify local saved/queued/uploading states separately from a backend receipt.

For each face, collect required front and wide context photographs and specific resurvey views when requested. Compare device-claimed capture/fix time with server receipt. Confirm challenge classification without claiming physical camera or timestamp attestation. Record bytes, retries, partial manifest recovery and final receipt identity.

Two supervisors independently review ambiguous/high-risk identities using structure and context. First approval does not enroll a reference. Explicit baseline enrollment binds exact face ID, structural details and original media hashes. Withdraw/correct invalid references with preserved history. Changed assessments reopen reviews and hold mismatched references; never silently reuse a stale approval. Rejected/resurvey tasks receive new linked submissions rather than overwritten evidence.

## Record measurements and adjudication

Keep the authorized pilot record under the organization's evidence access/retention policy. Minimum fields:

| Area | Record |
|---|---|
| Identity | Face/task/inspection IDs; physical identity verdict correct/wrong/ambiguous/unobservable; independent supervisor identifiers and reasons |
| Capture | Actual phone/OS/browser; connectivity class; GPS accuracy and imported uncertainty; claimed and received times; photo bytes/dimensions |
| Recovery | Offline reload/suspend behavior; retry attempts; interrupted part recovery; quota failure/recovery; stable receipt after replay |
| Review | Rule version and assessment hash; specific signals; reviewer outcome; reference version/withdrawal; linked resurvey outcome |
| Performance | Measured queue/API/upload/review duration distributions, sample count, server/DB/device/network conditions and measurement method |
| Safety/privacy | Unauthorized access probes; integrity verification; consent/retention exceptions; incident and resolution |

Do not label an isolated suspicious signal as proven fraud. Measure reviewer disagreement, unresolved identity, duplicate-candidate false positives and resurvey workload against independent physical adjudication. Risk severity is not a calibrated probability. Optional AI retrieval remains outside M4 until a representative verified dataset and blind evaluation exist.

## Stop conditions and sign-off

Stop release for any cross-worker/organization access, overwritten original/audit history, false receipt, integrity mismatch, unbounded resource failure, unrecoverable unsynced evidence without explicit warning, or backup restoration into an unintended target. Preserve affected originals and records; investigate without deleting history.

The pilot lead signs off only after actual device cases, independent face adjudication, staging security checks, measured performance and coordinated production-like restore evidence are recorded. Until then, report M4 as locally hardened with external gates outstanding. CI configuration being present, a successful build, or a green generated-fixture drill is not sign-off.
