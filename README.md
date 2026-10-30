# IBVS · Iraq Billboard Verification System

Phase 1 inventory/assignment, Phase 2 worker capture/offline synchronization and Phase 3 human verification are implemented locally. This is **not a deployed or pilot-approved evidence verification system**. See [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) for measured results and remaining gates.

## Connected Supabase workspace (PowerShell, Node 24)

The local app uses Supabase project `utokgrudjgnvypzxufcx`, with runtime settings stored in ignored `apps/web/.env.local`. See [Supabase setup](docs/SUPABASE_SETUP.md) for schema, TLS, credentials, migrations and data cleanup.

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. Hosted installations always require sign-in. Provision the first real administrator with `npm run user:create`, then use **Workers ? Add worker** to create password accounts and **Inventory ? Assign visits** to assign billboards. Set `IBVS_REQUIRE_SIGN_IN=true` locally to use the same login flow. The internal operations actor has no login password. See [worker account setup](docs/WORKERS.md). Demo seeding is blocked on hosted databases.

Existing installations: run `npm ci` and `npm run db:migrate` to apply all outstanding additive migrations through `006_location_management.sql`; do not reseed or reset the database. Workers open **Open field workspace** or http://localhost:3000/field. While online, tap **Download assignments** and wait for **Offline shell ready**. Open a task, request a GPS observation, start the live camera, and capture separate front/wide-context photographs. Both are saved as original JPEG Blobs before queuing. Offline drafts survive reload after successful local saving; browser eviction/private mode/storage clearing can still erase them.

Synchronization retries in the foreground with backoff and resumes persisted server parts. **Saved locally / queued / uploading are not server receipts.** A received inspection has a backend receipt ID and server-received timestamp after both files pass byte/hash/image checks. This is not human approval or proof of genuine capture. GPS denial is retained as a review flag, not hidden. Device-claimed timestamps and offline/online challenge labels remain separate from receipt time.

Local private evidence defaults to ignored `.local/evidence/`, outside public assets. Production requires absolute `IBVS_EVIDENCE_DIR` on a persistent private volume. Original JPEGs and intermediate chunks must be backed up alongside PostgreSQL. No R2/S3 service is configured; the chosen backend supports one persistent application host. See [Phase 2 API](docs/PHASE2_API.md), [offline behavior](docs/OFFLINE_SYNC.md) and [deployment](docs/DEPLOYMENT.md).

Database lifecycle commands load the same `apps/web/.env*` files as Next.js; shell environment values take precedence. Automated unit tests use isolated embedded databases, and browser checks explicitly override the hosted URL. `.env.example` documents settings and contains no working credentials. Apply new hosted migrations with administrative credentials; the runtime role deliberately lacks schema creation permissions.

## Database schema

The [complete database schema](docs/DATABASE_SCHEMA.md), [runnable SQL](db/schema.sql), and [relationship diagrams](docs/DATABASE_ERD.md) cover all 30 application tables. Regenerate them from the connected database with `npm run db:schema:export`. See [location setup and photo GPS](docs/LOCATIONS.md) for manual test locations, CSV fields, nearby discovery, coordinate corrections and supervisor exceptions.

## Human verification

Administrators open **Review center** or `/review` for filtered received-inspection queues, authorized full-resolution front/wide images, local coordinate maps with GPS accuracy and nearby candidates, versioned risk reports and immutable decisions. First-visit identity remains provisional. Approval does **not** create a trusted reference: explicit structural enrollment binds versioned originals to the exact face. Ambiguous/high-risk cases require two distinct supervisors. Fresh demo seeds include `reviewer2@demo.ibvs.test`; existing installations must provision a second supervisor with `npm run user:create` rather than reseeding.

Resurvey requests contain specific instructions and create a new billboard-bound assignment linked to the original inspection. Workers download assignments again to see decisions and follow-up tasks. New tasks retain Phase 2 offline drafts and resumable retries. Original rejected/received evidence is retained. Reference corrections require a reasoned withdrawal followed by enrollment of a new version.

See [review API](docs/PHASE3_API.md), [versioned rules and thresholds](docs/FRAUD_RULES.md), and [review workflow](docs/USER_MANUAL.md). Browser camera/GPS/time are untrusted signals. The rule severity is a review aid, not a fraud probability or automatic accusation. Production spatial analysis requires PostGIS and `db/spatial.sql`; the embedded development fallback is explicitly labeled.

## Tests and build

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
# Isolated, directly owned loopback server restart during a partial upload:
npm run test:restart
# With demo password in the environment and a seeded dev database:
npm run test:e2e
# Optional: set IBVS_POSTGIS_TEST_URL to an isolated PostGIS database first:
npm run test:postgis
```

Integration tests use isolated embedded PostgreSQL databases, never DATABASE_URL. Checks use ignored `.local/test-data/` and `.local/temp/` on the workspace drive. After `npm run build`, `npm run test:browser` generates an ephemeral password in memory and seeds an isolated database/private-evidence directory, then tests the production build with a test-only local database override; port 3000 must be free. Browser tests use a fake camera, simulated GPS and quota/network faults; they are not real-phone verification. Browser fixtures are DEMO/E2E records, never production inputs.

## Production PostgreSQL / PostGIS

Set DATABASE_URL, BETTER_AUTH_SECRET (32+ random characters), BETTER_AUTH_URL (exact HTTPS origin) and IBVS_EVIDENCE_DIR (private persistent absolute directory). Production refuses the embedded development database unless explicitly overridden for an isolated test. See [deployment instructions](docs/DEPLOYMENT.md). Docker/PostGIS verification is separate from embedded tests.

Source layout: `apps/web` Next.js UI/API/auth/services, `packages/domain` validation and policy helpers, `db` migrations, `scripts` migration/provisioning/fixtures, `tests` domain/database/browser acceptance.

See [product requirements](docs/PRODUCT_REQUIREMENTS.md), [manual](docs/USER_MANUAL.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [cost model](docs/COSTS.md), and [retention policy](docs/RETENTION.md). Human review and controlled references are implemented. GIS tiles, AI, real-device certification and production deployment remain future work. Public registration remains disabled.

## M4 local hardening and operations

The review workspace uses organization-scoped keyset pagination, localized Load more and guarded supervisor actions. Analysis admission limits reduce repeated decoding; retrying an issued receipt does not re-run analysis. A supervisor explicitly chooses Reanalyze after deferred/failed analysis. Approval still requires a current successful assessment.

```powershell
# Generated fixture only; creates new ignored directories, never restores over user data:
npm run ops:restore-drill
# Only against an explicitly configured, quiesced isolated restore:
# Set DATABASE_URL (or absolute IBVS_LOCAL_DB), absolute IBVS_EVIDENCE_DIR,
# and IBVS_RUN_INTEGRITY_CHECK=true before running:
npm run ops:evidence-check
# Same explicit isolated targets; IBVS_RUN_LIFECYCLE_PLAN=true; inventory only:
npm run ops:lifecycle-plan
```

See [operations scope](docs/M4_OPERATIONS.md) and [field pilot protocol](docs/M4_PILOT_RUNBOOK.md). The generated local restore and synthetic queue measurements do not certify production backups or a field pilot. Remote PostGIS CI is configured but has not been observed running. See [M4 execution plan](docs/M4_EXECUTION_PLAN.md), [test report](docs/M4_TEST_REPORT.md), [security review](docs/M4_SECURITY_REVIEW.md), [staging/rollback](docs/M4_STAGING_AND_ROLLBACK.md) and [physical device checklist](docs/M4_FIELD_DEVICE_CHECKLIST.md). Exact results and outstanding external gates are in the handover.
