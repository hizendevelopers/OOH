# IBVS · Iraq Billboard Verification System

Phase 1 is an authenticated, database-backed inventory and task assignment application. It is **not a deployed or pilot-approved evidence verification system**. See [PROJECT_HANDOVER.md](PROJECT_HANDOVER.md) for actual verification results and outstanding milestones.

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

Integration tests use an isolated temporary embedded PostgreSQL database, never DATABASE_URL. After `npm run build`, `npm run test:browser` generates an ephemeral password in memory and seeds an isolated temporary database, then tests the production build with a test-only local database override; port 3000 must be free. Browser tests import additional clearly identifiable `E2E-*` records; run them only against a development/demo database. Do not seed or run these browser fixtures against production.

## Production PostgreSQL / PostGIS

Set DATABASE_URL, BETTER_AUTH_SECRET (32+ random characters), and BETTER_AUTH_URL (exact HTTPS origin). Production refuses the embedded development database unless explicitly overridden for an isolated test. See [deployment instructions](docs/DEPLOYMENT.md). Docker/PostGIS verification is separate from embedded tests.

Source layout: `apps/web` Next.js UI/API/auth/services, `packages/domain` validation and policy helpers, `db` migrations, `scripts` migration/provisioning/fixtures, `tests` domain/database/browser acceptance.

See [product requirements](docs/PRODUCT_REQUIREMENTS.md), [manual](docs/USER_MANUAL.md), [threat model](docs/SECURITY_THREAT_MODEL.md), [cost model](docs/COSTS.md), and [retention policy](docs/RETENTION.md). No evidence storage, offline capture, GIS tiles, AI or public registration is represented as complete.
