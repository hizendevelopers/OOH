# IBVS · Iraq Billboard Verification System

Phase 1 inventory/assignment and Phase 2 worker capture/offline synchronization are implemented locally. This is **not a deployed or pilot-approved evidence verification system**. See [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) for measured results and remaining gates.

## Local setup (PowerShell, Node 24)

```powershell
npm ci
npm run db:migrate
# Choose a strong local demo password without printing it:
$secure = Read-Host 'Local demo password (12+ characters)' -AsSecureString
$env:IBVS_DEMO_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
npm run db:seed
npm run dev
```

Open http://localhost:3000. Sign in as `admin@demo.ibvs.test`, `worker@demo.ibvs.test` or `worker2@demo.ibvs.test` using the password you supplied. Demo records are clearly labeled and contain no real evidence or approvals. Seed is explicit and refuses to overwrite an existing demo organization. The ignored `.local/` directory contains the local PostgreSQL engine data and generated development auth secret. Protect that directory using your OS account permissions. Never open two application instances against the same embedded database.

Existing installations: run `npm ci` and `npm run db:migrate` to apply additive migration `002_inspections.sql`; do not reseed or reset the database. Workers open **Open field workspace** or http://localhost:3000/field. While online, tap **Download assignments** and wait for **Offline shell ready**. Open a task, request a GPS observation, start the live camera, and capture separate front/wide-context photographs. Both are saved as original JPEG Blobs before queuing. Offline drafts survive reload after successful local saving; browser eviction/private mode/storage clearing can still erase them.

Synchronization retries in the foreground with backoff and resumes persisted server parts. **Saved locally / queued / uploading are not server receipts.** A received inspection has a backend receipt ID and server-received timestamp after both files pass byte/hash/image checks. This is not human approval or proof of genuine capture. GPS denial is retained as a review flag, not hidden. Device-claimed timestamps and offline/online challenge labels remain separate from receipt time.

Local private evidence defaults to ignored `.local/evidence/`, outside public assets. Production requires absolute `IBVS_EVIDENCE_DIR` on a persistent private volume. Original JPEGs and intermediate chunks must be backed up alongside PostgreSQL. No R2/S3 service is configured; the chosen backend supports one persistent application host. See [Phase 2 API](docs/PHASE2_API.md), [offline behavior](docs/OFFLINE_SYNC.md) and [deployment](docs/DEPLOYMENT.md).

No `.env` is automatically loaded by root scripts. Set shell environment variables or invoke `node --env-file=.env --import tsx scripts/migrate.ts`. Next.js uses its normal app-local environment loading; prefer consistent shell environment values for all commands. `.env.example` describes production variables and is not a working credential file.

## Tests and build

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
# With demo password in the environment and a seeded dev database:
npm run test:e2e
```

Integration tests use isolated embedded PostgreSQL databases, never DATABASE_URL. Checks use ignored `.local/test-data/` and `.local/temp/` on the workspace drive. After `npm run build`, `npm run test:browser` generates an ephemeral password in memory and seeds an isolated database/private-evidence directory, then tests the production build with a test-only local database override; port 3000 must be free. Browser tests use a fake camera, simulated GPS and quota/network faults; they are not real-phone verification. Browser fixtures are DEMO/E2E records, never production inputs.

## Production PostgreSQL / PostGIS

Set DATABASE_URL, BETTER_AUTH_SECRET (32+ random characters), BETTER_AUTH_URL (exact HTTPS origin) and IBVS_EVIDENCE_DIR (private persistent absolute directory). Production refuses the embedded development database unless explicitly overridden for an isolated test. See [deployment instructions](docs/DEPLOYMENT.md). Docker/PostGIS verification is separate from embedded tests.

Source layout: `apps/web` Next.js UI/API/auth/services, `packages/domain` validation and policy helpers, `db` migrations, `scripts` migration/provisioning/fixtures, `tests` domain/database/browser acceptance.

See [product requirements](docs/PRODUCT_REQUIREMENTS.md), [manual](docs/USER_MANUAL.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [cost model](docs/COSTS.md), and [retention policy](docs/RETENTION.md). Human review, references, GIS tiles, AI, real-device certification and production deployment remain Phase 3/pilot work. Public registration remains disabled.
