# Supabase database connection

The local app is connected to Supabase project `utokgrudjgnvypzxufcx`. Database settings and the generated runtime password live in ignored `apps/web/.env.local`. The app uses PostgreSQL through `pg`; it does not send database credentials to the browser or use MCP as its runtime database connection.

## Runtime

Run `npm run dev` and open http://localhost:3000. `/api/health` checks connectivity and the latest portable migration. Its `database` field must be `postgresql`.

- `DATABASE_URL` selects the hosted database. The configured Session pooler connection uses `ibvs_app.utokgrudjgnvypzxufcx` (database role `ibvs_app`), not `postgres`, with `sslmode=verify-full` and `sslrootcert` pointing to `.local/certs/supabase-ca.crt` using an absolute path. The CA is downloaded from the [certificate URL used by Supabase Studio](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json). See [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
- `DATABASE_SCHEMA=ibvs` isolates app tables from Supabase's public Data API and auth tables.
- `DATABASE_POOL_MAX=5` limits this persistent local server's connection pool. Connections have a ten-second timeout and idle connections expire after thirty seconds.
- `IBVS_WORKSPACE_ID=billboard-operations` selects the real operations workspace. Demo organizations cannot be selected by the no-login path.
- `IBVS_REQUIRE_SIGN_IN=false` preserves the requested temporary no-login behavior. The internal `Operations workspace` actor has no password or login account. It exists for organization ownership and audit attribution, and is not a field worker. To restore login, provision real accounts and set this value to `true`.

The direct endpoint requires IPv6, but this machine currently has no usable IPv6 route. The app now uses the project's **Session pooler** at `aws-0-ap-northeast-1.pooler.supabase.com:5432`, copied from the Connect dialog. Keep the restricted role and certificate verification. App-to-pooler TLS 1.3 and certificate validation were verified; `pg_stat_ssl` describes the pooler's separate backend connection and does not measure the app's TLS socket. [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres) describes the alternatives.

Photo originals remain in the existing private evidence directory specified by `IBVS_EVIDENCE_DIR`; switching the metadata database does not migrate files to Supabase Storage.

## Schema and permissions

The full [schema reference](DATABASE_SCHEMA.md), [repeatable setup SQL](../db/schema.sql), and [ER diagrams](DATABASE_ERD.md) describe all 30 tables end-to-end. Run `db/schema.sql` in Supabase SQL Editor as `postgres` for a new or existing project: it skips completed migrations and preserves records. The separate `db/schema-fresh.sql` is a final-DDL snapshot for empty schemas only.

Portable migrations `001_core.sql` through `006_location_management.sql` are installed in `ibvs`. PostGIS is installed in `extensions`, with the generated location column and spatial index from `db/spatial.sql`. [db/supabase.sql](../db/supabase.sql) records the runtime grants and private-schema hardening.

The runtime role can read app data and perform the writes required by the app. It cannot create schema objects or delete immutable source coordinates or audit events. Face/organization column grants also allow PostgreSQL's row locks used by assignment/import/review transactions. Migration ownership remains with `postgres`.

Database commands now load the same app-local environment files as Next.js. `npm run db:migrate` is a no-op when all migrations are present; applying a new migration or creating a new organization requires an administrative database connection or an authenticated Supabase MCP migration. Do not broaden the runtime role to perform deployments. `npm run db:bootstrap` can initialize a real empty workspace using an administrative connection.

## Seed removal

The original local seed was removed: six faces, five structures, three assignments, four demo accounts, and their seed audit events. The hosted workspace has no billboard inventory, workers, assignments, inspections, evidence, or audit events. Only the actual workspace and its internal actor are initialized.

The cleanup script only accepts `demo-iraq` when it is marked as demo and all records match the known seed. It refuses mixed real/demo records or captured evidence. It saves a private fixture snapshot under `.local/backups/`, excluding passwords and session tokens, and restores immutable triggers before committing. Run `npm run db:clean-demo -- --local` only while the embedded database's app process is stopped. Hosted demo seeding is blocked; isolated test fixtures remain available for automated tests.

## Verified flow

The live APIs were checked against Supabase. Inventory import/read, assignment creation/read, audit events, overview counts, role restrictions, TLS, and PostGIS were verified inside a transaction that was rolled back. No test business records were retained. Browser tests use an explicit empty database URL override so Next.js cannot load the hosted connection into a disposable test server.
