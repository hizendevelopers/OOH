# M4 isolated staging and rollback runbook

This is an operator procedure, not a completed deployment. On 17 October 2026 the read-only inventory found Node 24.12.0, npm 11.6.2 and the Docker CLI; the Docker engine was unavailable, and host `psql`, `pg_dump` and `pg_restore` commands were unavailable. No Docker build, container/PostGIS runtime, staging deployment or production restore was performed in this workstream. Current local checks and limitations belong in PROJECT_HANDOVER.md.

Run the commands below only on a designated **isolated staging host**, using a new Compose project and new volumes. Never substitute the live project or live database. Do not run volume removal, database reset, reseeding of existing organizations, schema down-migrations or in-place restores. Existing local demo accounts and `.local/postgres` are unrelated to this procedure and must remain untouched.

## Prerequisites and local release artifact

Have Docker's Linux engine, available loopback ports 5432 and 3000, an HTTPS reverse proxy forwarding to loopback 3000, an approved staging hostname, and a private encrypted backup destination. Bindings are currently fixed in compose.yaml; a port conflict must stop deployment until an explicit isolated override is reviewed. Do not stop an unrelated service to free a port. Root scripts do not automatically load `.env` files.

Record the reviewed commit and successful local verification, retaining failed results as well:

```powershell
git status --short
git rev-parse HEAD
node --version
npm --version
docker info --format '{{.ServerVersion}}'
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:browser
npm run ops:restore-drill
```

`test:browser` requires port 3000 free and uses isolated generated data. Its simulated camera/GPS is not phone certification. `ops:restore-drill` creates new generated-fixture directories; it is not a staging/private-volume backup. Do not run concurrent embedded application instances against the same local database. Preserve local unsynced worker drafts throughout release preparation.

## New staging database and spatial contract

Use a dedicated PowerShell session. Set secrets through an approved secret manager or secure prompt, never a command-line argument, transcript, screenshot or committed file. Connection URLs must already contain correctly percent-encoded credentials. These prompts do not display entered values:

```powershell
$stageProject = 'ibvs-m4-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
$secureValue = Read-Host 'New isolated staging database password' -AsSecureString
$env:POSTGRES_PASSWORD = [System.Net.NetworkCredential]::new('', $secureValue).Password
$secureValue = Read-Host 'Staging runtime DATABASE_URL (container host db)' -AsSecureString
$runtimeDatabaseUrl = [System.Net.NetworkCredential]::new('', $secureValue).Password
if (([Uri]$runtimeDatabaseUrl).Host -ne 'db') { throw 'Expected this isolated Compose database host db' }
$env:DATABASE_URL = $runtimeDatabaseUrl
$secureValue = Read-Host 'Staging auth secret (32+ random characters)' -AsSecureString
$env:BETTER_AUTH_SECRET = [System.Net.NetworkCredential]::new('', $secureValue).Password
$env:BETTER_AUTH_URL = Read-Host 'Exact staging HTTPS origin, without trailing slash'
docker compose --project-name $stageProject config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid isolated Compose configuration' }
docker compose --project-name $stageProject up -d db
if ($LASTEXITCODE -ne 0) { throw 'Isolated database did not start' }
docker compose --project-name $stageProject ps db
docker compose --project-name $stageProject exec -T db pg_isready -U ibvs -d ibvs
if ($LASTEXITCODE -ne 0) { throw 'Wait for healthy isolated database before proceeding' }

# Host migration URL uses localhost/127.0.0.1, never container hostname db.
$secureValue = Read-Host 'Isolated migration DATABASE_URL (loopback host)' -AsSecureString
$migrationDatabaseUrl = [System.Net.NetworkCredential]::new('', $secureValue).Password
if (([Uri]$migrationDatabaseUrl).Host -notin @('localhost','127.0.0.1')) { throw 'Expected isolated loopback migration host' }
$env:DATABASE_URL = $migrationDatabaseUrl
$env:NODE_ENV = 'development'
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; preserve database and investigate' }
Get-Content -Raw db/spatial.sql | docker compose --project-name $stageProject exec -T db psql -U ibvs -d ibvs -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'PostGIS setup failed' }
$env:IBVS_POSTGIS_TEST_URL = $migrationDatabaseUrl
npm run test:postgis
if ($LASTEXITCODE -ne 0) { throw 'Spatial contract failed' }
docker compose --project-name $stageProject exec -T db psql -U ibvs -d ibvs -v ON_ERROR_STOP=1 -c 'SELECT name FROM schema_migrations ORDER BY name; SELECT extversion FROM pg_extension WHERE extname=''postgis'';'
```

Keep the project identifier in the private release record: every later command must use that exact project. Current portable migrations run through 005; record the actual output rather than assuming the schema version. The spatial test creates transaction-local fixtures and rolls them back. It does not prove runtime-role privileges, image/storage compatibility, request limits or production pool behavior. No production URL should be placed in `IBVS_POSTGIS_TEST_URL`.

Compose's default `ibvs` database role is bootstrap infrastructure, not a least-privilege application policy. Before collecting pilot evidence, provision and test a separate runtime role using reviewed grants for actual application statements; retain schema ownership/migration privileges separately. Verify immutable-table UPDATE/DELETE denial with that role on staging. Do not enable a production deployment merely because the bootstrap-role test passed.

## Accounts, image, HTTPS and acceptance

For a **new empty staging organization only**, while the host migration URL remains selected:

```powershell
npm run org:create -- 'M4 isolated staging' m4-staging
if ($LASTEXITCODE -ne 0) { throw 'Organization provisioning failed' }
$secureValue = Read-Host 'Unique staging supervisor password (12+ characters)' -AsSecureString
$env:IBVS_USER_PASSWORD = [System.Net.NetworkCredential]::new('', $secureValue).Password
npm run user:create -- supervisor-one@staging.example.invalid 'Supervisor One' admin m4-staging
if ($LASTEXITCODE -ne 0) { throw 'Supervisor provisioning failed' }
```

Replace example identities with approved distinct staging identities. Repeat user provisioning with a new password for the second administrator and each worker; choose role `worker` for workers. Do not reuse the shared development password for a pilot. Do not run `db:seed` against staging. Account creation is not idempotent: after a failure inspect state before retrying; never delete records to make a retry succeed.

```powershell
$env:DATABASE_URL = $runtimeDatabaseUrl
docker compose --project-name $stageProject build web
if ($LASTEXITCODE -ne 0) { throw 'Image build failed' }
docker compose --project-name $stageProject up -d web
if ($LASTEXITCODE -ne 0) { throw 'Staging web did not start' }
$health = Invoke-WebRequest -Uri ($env:BETTER_AUTH_URL + '/api/health') -UseBasicParsing
$health.StatusCode
```

Compose supplies production runtime configuration and the private named evidence volume. Record the immutable image ID using `docker compose --project-name $stageProject images --quiet web`. An HTTP 200 health check is database liveness only: separately verify the staging certificate/origin, authenticated upload, file permissions/persistence, actual PostGIS review analysis, two-worker/organization access denial, anonymous API denial, supervisor decisions, independent approval, explicit baseline withdrawal/correction and linked offline resurvey. Test image restart with fixture evidence and receipt hashes retained. Never expose the evidence volume as a static server directory.

Internet/pilot release remains blocked until administrator MFA/SSO, encrypted evidence/backups, least-privilege runtime grants, appropriate proxy/body/rate/connection limits, HSTS, tested CSP, monitoring and retention/dispute ownership are established. Production CSP currently excludes eval but permits framework inline scripts/styles; this is not a nonce-policy claim. No automatic retention deletion exists. Complete the physical device checklist and pilot protocol separately.

Close the dedicated secret-bearing shell after use. Never run `docker compose config` without `--quiet` in shared logs; resolved configuration can contain credentials. Keep operational records private and sanitized.

## Coordinated fixture backup and isolated restoration

Before changing an **existing staging** deployment, record its commit, image ID, schema migrations, DB/private-volume capacity and latest successful restore. Pause new worker submissions and review writes; stop only that staging project's web service. Keep the database running. Coordinate the two backup streams while no writers run. Use an approved encrypted backup filesystem and retention policy; copying plaintext onto an unencrypted target is not an encrypted backup.

The following pattern intentionally leaves source volumes unchanged and makes a unique backup directory. `$approvedEncryptedBackupRoot` must be an existing private, encrypted staging backup directory selected by the operator; encryption/ACL approval is external to this script. It must not be a source database/evidence directory. Do not use PowerShell's binary `>` redirection for a custom PostgreSQL dump.

```powershell
$backupId = [Guid]::NewGuid().ToString('N')
$backupDirectory = Join-Path $approvedEncryptedBackupRoot ('ibvs-staging-' + $backupId)
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
$stagingWebContainer = docker compose --project-name $stageProject ps --quiet web
if (-not $stagingWebContainer) { throw 'Expected staging web container absent' }
docker compose --project-name $stageProject stop web
if ($LASTEXITCODE -ne 0) { throw 'Cannot establish quiesced staging snapshot' }
$dumpInContainer = '/tmp/ibvs-staging-' + $backupId + '.dump'
docker compose --project-name $stageProject exec -T db pg_dump -U ibvs -d ibvs --format=custom --file=$dumpInContainer
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed; preserve artifacts' }
$stagingDbContainer = docker compose --project-name $stageProject ps --quiet db
docker cp "${stagingDbContainer}:${dumpInContainer}" (Join-Path $backupDirectory 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Database backup copy failed' }
$backupEvidence = Join-Path $backupDirectory 'evidence'
New-Item -ItemType Directory -Path $backupEvidence -ErrorAction Stop | Out-Null
docker cp "${stagingWebContainer}:/var/lib/ibvs/evidence/." $backupEvidence
if ($LASTEXITCODE -ne 0) { throw 'Evidence backup copy failed' }
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $backupDirectory 'database.dump')
```

This is a staging fixture-backup recipe, not a verified production encryption implementation. Dumps contain sensitive authentication data as well as evidence metadata. Staging DB container `/tmp` retains this private dump; no automatic removal is provided. Record the outstanding artifact under the staging retention owner. Restart staging only after backup artifacts/permissions are validated, using `docker compose --project-name $stageProject start web`; preserve originals on failure.

Restore into a **second new** staging project, database and evidence volume, never this source project. Start only the new DB; copy `database.dump` into its container with a unique filename, then use `pg_restore -U ibvs -d ibvs --no-owner --exit-on-error` against its empty database. Do not use `--clean`. Restore the matching evidence tree into its new private volume with the documented node-user ownership. Record exact source/destination project and volume names before these writes. Encryption, destination volume ownership and least-privilege grants depend on the designated host: have the operator review them rather than guessing an OS path or issuing a broad recursive ownership command.

On the isolated restoration, run migrations if required and `db/spatial.sql`; verify schema/counts, immutable history, account access, original and part hashes, receipt IDs and interrupted upload recovery. `npm run ops:evidence-check` requires the isolated restored database URL, matching absolute evidence directory and `IBVS_RUN_INTEGRITY_CHECK=true`; a host shell cannot read a Docker named volume by assuming a Windows path. Execute the checker in an authorized environment with the actual private volume mounted, or use the standalone host adapter with an isolated copied evidence directory. Record duration, snapshot age, failures and losses; target RPO/RTO is not measured until this full drill actually succeeds.

## Application rollback without deleting history

Before a staging image update, retain a known-good immutable image ID/digest and verify its compatibility with the **current forward schema**. Do not downgrade schema or restore a stale DB merely to undo application code. If compatibility is unknown or integrity/access is affected, pause that staging web service, retain evidence/drafts, and investigate a forward fix.

For an operator-reviewed compatible prior image, create a new private override file (not compose.yaml) containing:

```yaml
services:
  web:
    image: sha256:REPLACE_WITH_RECORDED_PRIOR_IMAGE_ID
```

Select the existing staging runtime environment and exact project, then run:

```powershell
docker compose --project-name $stageProject -f compose.yaml -f $reviewedRollbackOverride config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Rollback override invalid' }
docker compose --project-name $stageProject -f compose.yaml -f $reviewedRollbackOverride up -d --no-build --no-deps web
if ($LASTEXITCODE -ne 0) { throw 'Application rollback failed; keep records intact' }
```

Re-run health, authenticated image/receipt/decision access and pending offline retry acceptance. Confirm original volume identities and unchanged schema. Record actual result and incident owner; a rollback command returning zero is not evidence acceptance. Workers retain local drafts until their server receipt is confirmed. Never use `down -v`, volume pruning, forced account reset or browser storage clearing as rollback/recovery.
