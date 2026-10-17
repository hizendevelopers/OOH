# M4 application security review

Reviewed 17 October 2026 (Asia/Karachi). This is a source and local automated-test review, not an independent penetration test, a field-pilot sign-off or production authorization. Final command results and execution scope are recorded in [PROJECT_HANDOVER.md](../PROJECT_HANDOVER.md). No account password, production credential, deployment or live grant was changed for this review.

## Authorization boundaries

`currentActor()` resolves a Better Auth session and reads current database organization membership for each protected request. The client cannot choose its organization or role. Public registration is disabled; organization/user provisioning is a separate local CLI workflow. Current roles are `admin` and `worker`: administrators act as supervisors; there is no separately enforced reviewer or security-administrator role.

| Route or action | Implemented server boundary |
|---|---|
| Review queue, detail and historical assessments | Current administrator membership required. Queue independently scopes inspection and case organizations. Detail first resolves a received inspection within the administrator's organization. Historical assessment retrieval also binds run, inspection and organization. |
| Analyze, approve, reject, ambiguous and resurvey | Administrator plus organization-scoped received inspection. A reviewer cannot decide their own submission. JSON schema, same-origin header, bounded request body, current assessment and optimistic case version are checked server-side. |
| Resurvey creation | Same review authorization, explicit instructions and due date; selected worker must be active and a worker in the same organization. Creates a new assignment linked to the original received inspection. Historical evidence and decisions remain intact. |
| Baseline enrollment | Administrator, exact face and received inspection in organization; no self-enrollment of own submission. Current approved assessment, required independent approvals and structural details are mandatory. Existing active baseline must first be withdrawn. |
| Baseline withdrawal | Administrator and organization-scoped baseline. Mandatory reason and actor-bound operation digest; append-only withdrawal event. Withdrawal is not physical deletion. |
| Challenge and inspection initiation | Worker only; task must belong to worker and organization and have an active worker profile. Assignment status/version and face ID/code are checked. Challenges are bound to organization, worker and task. |
| Parts, photo completion and inspection submission | Worker ownership and organization predicates; task ownership/profile is rechecked. Part index, expected size and hash bind accepted bytes. Both separate front/wide receipts are required for submission. |
| Inspection status/history | Original worker scope; administrator history is organization-scoped. Inspection-status upload manifests remain worker-only. |
| Private photo GET | Same-organization administrator or original worker; completed photo receipt required. Private path comes from an internal validated key, not a client filename. No public object URL. |

Review and baseline operation IDs are not bearer credentials. Idempotency lookup includes organization, actor and operation ID, and a digest binds the target and parsed payload. Different content under a reused key returns a conflict. Case versions prevent stale concurrent decisions. Ambiguous/high-risk approval requires distinct supervisors in the current approval epoch and assessment. Critical integrity failures block approval. Baseline enrollment is a separate action; first worker photographs never automatically become trusted references.

The queue cursor is unsigned pagination context, not authorization. Changing it cannot override organization predicates. Canonical filter matching, a 2,000-character cursor limit and page sizes of at most 100 bound parsing and returned pages. Exact microsecond receipt timestamps plus inspection IDs preserve keyset ordering. Existing detail decision/assessment/audit histories are not yet paginated.

## Request, evidence and resource protection

- Inspection/review mutations require an exact configured same-origin header. Better Auth handles its own authentication endpoints and origin controls. Sensitive responses use no-store; authenticated media also sets JPEG type, nosniff and a sandbox policy. Field service-worker caching excludes private API/media responses.
- API JSON bodies are streamed under explicit limits; photo parts are bounded. Complete originals are capped at 6 MiB and JPEG decoding is limited to 24 megapixels with corruption checks and minimum dimensions. SHA-256 protects transport/storage consistency; it does not prove genuine scene capture. Private reads enforce a size bound. No malware scanner, isolated decoder process or hard image-processing execution deadline is implemented.
- Expensive analysis requires database admission after access checks and before image reads: two live leases per organization, 60 starts/minute per actor and 180/minute per organization. Allocation has short database lock/statement limits. Leases release on success/failure and expire after five minutes after a crash. Expiry does not terminate stuck work. Real PostgreSQL pool/lock/load behavior still needs runtime testing.
- Receipt creation commits before optional analysis. Analysis failure/admission denial preserves the server receipt and leaves analysis pending. Receipt replay never repeats automatic analysis; an authorized supervisor must explicitly analyze a deferred case. Idempotent review/baseline replay returns the original result before expensive analysis.
- Login throttling uses Better Auth database counters. Challenges also have a worker rate limit. These do not replace reverse-proxy connection, total-body, upload-volume and distributed rate limits. One organization can still consume its allowed resources; there is no billing quota or general per-worker archive quota.
- Production configuration requires HTTPS, database/auth-secret configuration and an absolute evidence path. Storage additionally refuses paths under the web application directory. Directory checks are lexical; deployment must validate symlinks/mounts and actual OS ACLs. POSIX mode flags do not establish Windows ACL protection.
- Production CSP excludes `unsafe-eval`; development retains it for tooling. Inline framework scripts/styles remain allowed. A nonce/hash CSP and HTTPS-proxy HSTS remain deployment work.

## Negative-test evidence and limits

The following tests exist and were inspected; consult the handover for the final recorded full-suite/browser execution. Service tests pass trusted actor objects directly, so their authorization assertions supplement rather than replace authenticated HTTP browser tests.

| Test source | Implemented assertions relevant to security |
|---|---|
| `tests/integration.test.ts` | Disabled signup; database login; worker import/inventory denial; guessed task IDs hidden across workers/organizations; cross-organization assignment rejection; atomic rollback; source-coordinate, face-code and audit mutation denial. |
| `tests/evidence.test.ts` | Wrong face/version and foreign worker/admin upload denial; challenge binding/expiry; missing evidence; changed operation payload/part bytes; malformed JPEG; private evidence scope; stable receipts; worker review/assessment/enrollment denial; foreign review/assessment denial; self-review denial; stale review version; changed operation digest; repeated/concurrent review safety; independent approvals; exact-face baseline binding; baseline/media/decision immutability; withdrawal-before-correction; linked resurvey preserving original receipt; critical missing-original approval denial. |
| `tests/security-hardening.test.ts` | Database admission concurrency and organization isolation; actor/organization rate ceilings; lease expiry/cleanup; receipt survival under deferred analysis; receipt replay without private reads; foreign analysis denial before image reads; explicit analysis recovery; lease release after success and thrown spatial failure; production/development CSP distinction. |
| `tests/review-pagination.test.ts` | Worker denial; organization/filter cursor mismatch; malformed/bounded inputs; empty foreign queue; pagination beyond legacy cap with equal microsecond timestamps; observation-based evidence classification. |
| `tests/e2e/phase1.spec.ts`, `field.spec.ts`, `review.spec.ts` | Actual session-based anonymous/worker denial, task and private-media isolation, same-origin rejection, task tampering, review permissions/repeated decisions, explicit baselines and resurvey, plus offline/receipt recovery. Browser camera/GPS/storage faults are simulated. |

Not every negative permutation is a separate HTTP assertion: for example, worker/foreign baseline withdrawal and every foreign resurvey mutation rely partly on shared administrator/org guards inspected in source. Add a parameterized authenticated route matrix before Internet exposure, including membership removal, worker deactivation policy, stale sessions, missing/mismatched origins and oversized streamed bodies. No fuzzing, distributed abuse test or external penetration test is claimed.

## Audit, privacy and account revocation

Migrations protect audit events, decisions, risk runs, baseline versions/withdrawals and completed media against ordinary application UPDATE/DELETE. Operation and reference histories preserve prior results. Database owners/superusers and filesystem administrators can bypass these controls; they are not tamper-proof forensic storage.

Operational error logging uses request IDs, safe categories and limited internal identifiers. It does not intentionally emit password/cookie/token payloads, GPS coordinates or JPEG bytes. Free-form reasons and detailed GPS/photo evidence remain sensitive application data; reasons are rendered as escaped text. Restrict application/database logs, exports and snapshots, including generated local test artifacts. Retention/holds, encryption at rest and deletion workflows require a documented policy and implementation.

`worker_profiles.active=false` blocks eligible assignments and new upload operations; it is not a universal session/access revocation switch. Existing membership/session can still authorize historical reads. For immediate access removal, revoke sessions and remove membership through a controlled operator procedure; test that procedure against the chosen auth/runtime deployment. Offline downloaded data cannot be remotely recalled or cryptographically erased by server logout. IndexedDB separation and the local lock are not device encryption.

## Practical MFA design — not implemented

1. Choose a tested identity-provider enforced MFA/SSO integration or a supported Better Auth MFA integration. Current email/password login has no MFA factor or assurance claim; adding a documentation requirement does not enforce it.
2. Require supervisor enrollment and step-up assurance server-side before review, reanalysis, baseline enrollment/withdrawal and resurvey mutations. Also protect administrator sign-in, role changes, exports and account recovery. Never trust a client checkbox or a stale local/session display flag as MFA proof.
3. Define assurance lifetime, factor enrollment/replacement, session invalidation and recovery. Prefer phishing-resistant factors where supported; protect recovery codes as hashed secrets and audit recovery without logging codes. Keep a restricted, monitored break-glass procedure with independent approval rather than a public bypass.
4. Prevent a valid password-only session from bypassing MFA through direct API calls. Test enrolled/unenrolled users, missing/expired assurance, session theft/revocation, two-supervisor flows, logout and account recovery on staging. Keep existing workers' offline drafts during session expiry; require fresh authorized identity before upload.

MFA implementation, factor/recovery configuration and live acceptance remain release gates. No provider was provisioned and no existing account was enrolled or changed in this workstream.

## Least-privilege PostgreSQL design — proposal, not applied

Use separate schema-owner/migration, application-runtime, provisioning and backup/verification credentials. The runtime must not own the schema/tables, be superuser, create roles/extensions, bypass row security, disable triggers or inherit the migration role. Remove public schema creation and unnecessary PUBLIC grants only through a reviewed deployment migration. Apply PostGIS with migration credentials. No blanket `GRANT ALL` recipe is provided or claimed tested.

| Runtime data group | Proposed minimum capability to validate against actual SQL/library traffic |
|---|---|
| Membership, roles and worker eligibility | Read only. Provisioning role creates membership/profiles. A compromised web runtime must not promote itself by updating membership. |
| Inventory/source data | Read; explicit import INSERT on structures/faces/source coordinates. No source-coordinate UPDATE/DELETE or face identity changes. Review locking of face rows requires carefully scoped UPDATE privilege for PostgreSQL row locks even when no column is changed. |
| Organizations and assignment coordination | Read; current imports/review/admission use row locks on organizations. PostgreSQL row-lock privilege requirements must be exercised rather than assuming SELECT alone works. Consider a dedicated coordination table/locking design before further reducing this privilege. |
| Assignments, challenges, uploading inspections/media and review projections | Read/INSERT plus only columns actually updated by lifecycle services. Keep immutable-receipt triggers; grant no general deletion. |
| Evidence parts, audit, decisions, analyses and reference history | Read/INSERT, with no UPDATE/DELETE for append-only tables. Completed-media immutability still needs triggers because uploading media legitimately update. |
| Analysis admission | Read/INSERT/UPDATE/DELETE for short-lived operational admission rows; this is not immutable audit history. |
| Better Auth tables | Derive exact session/account/user/verification/rate-limit permissions from the configured library routes. Sessions/rate counters require mutable operations and expiry/logout deletion. Keep provisioning writes separate where feasible; verify sign-in, logout, session refresh and every enabled password/profile/recovery route under the restricted role. Do not disable those workflows through an assumed grant list. |

PostgreSQL `SELECT ... FOR UPDATE/NO KEY UPDATE` can require UPDATE privileges even without an explicit UPDATE statement. Column grants and default timestamps must be checked using the exact production schema and installed library. Current application tenancy is enforced by service predicates, not PostgreSQL RLS; compromise of runtime credentials can expose the organizations readable by that role. An RLS/service-role redesign would need isolated tests, not a claim based on enabling a flag.

Before pilot, provision the roles on an isolated real PostgreSQL/PostGIS database and run migration/runtime separation tests: permitted sign-in/import/upload/review/baseline/resurvey/retry paths succeed; runtime DDL, role changes, membership promotion, immutable history mutation and source mutation fail. Verify backup/restore ownership and PostGIS function access. Record actual GRANT definitions and denied statements as evidence. No runtime-role deployment or least-privilege acceptance passed in this local review.

## Remaining security release gates

- Enforced administrator MFA with tested recovery and session revocation; dedicated reviewed provisioning/deprovisioning procedures.
- Real PostgreSQL/PostGIS migration, restricted-role, pool/locking and load tests; configured CI is not proof of remote execution.
- Reverse-proxy HTTPS/HSTS, origin forwarding, body/connection/rate protections and tested nonce/hash CSP.
- Private-volume ACLs/mount validation, encryption, operational capacity limits, malware/derivative isolation and hard processing timeouts.
- Coordinated encrypted PostgreSQL/private-evidence backup/isolated restore; the generated local PGlite drill is a separate narrower result.
- Authenticated route-matrix security tests and an independent security review against staging; actual Android/iOS and adjacent-board field pilot.
- Sensitive-data retention/holds, device loss policy and supervised interpretation of risk. Browser camera, GPS, timestamps, EXIF and challenge labels remain untrusted; risk severity is not a calibrated fraud probability or accusation.

No material new cross-tenant authorization bypass was verified in this source review. This statement is limited to inspected code and local test evidence, not a guarantee of absence of vulnerabilities.
