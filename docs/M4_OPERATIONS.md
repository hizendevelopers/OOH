# Local operational verification

These tools perform no deletion, retention cleanup or repair. They never establish a production backup guarantee. Existing local accounts, database and evidence must be preserved.

## Generated-fixture restore drill

Run `npx tsx scripts/restore-drill.ts`. No database credentials, source path or destination path are accepted. The command creates a unique ignored `.local/test-data/restore-drill-*` directory, applies all portable migrations to a new fixture database, creates generated private front/wide JPEGs and audit history, then snapshots the database with the installed PGlite `dumpDataDir` API. It persists and hashes the snapshot, closes the source, restores the persisted bytes through `loadDataDir` into a second new database and copies the generated evidence to a separate new directory.

Verification compares every public table's complete row fingerprints and counts, column definitions, indexes, constraints, noninternal triggers and public functions. It reconciles restored media/part hashes, sizes and receipt links, and attempts an audit mutation that must fail. The JSON output contains aggregate counts, a snapshot digest and elapsed time. Fixtures and snapshots are retained locally for inspection; no cleanup runs. They contain generated test material only.

This is a local PGlite filesystem-snapshot recovery test, not `pg_dump`/`pg_restore`, PostgreSQL networking, PostGIS, encrypted backup, production evidence recovery, real process-crash recovery, measured RPO/RTO or an actual customer-data restore. Production still requires a coordinated, encrypted PostgreSQL/private-volume backup and isolated restore drill under the deployment runbook. Never point a restore at an existing database or volume.

## Read-only private evidence reconciliation

First use a quiesced isolated restoration. Explicitly configure its `DATABASE_URL` (or existing absolute `IBVS_LOCAL_DB`) and existing absolute `IBVS_EVIDENCE_DIR`, set `IBVS_RUN_INTEGRITY_CHECK=true`, then run `npx tsx scripts/evidence-integrity.ts`. The tool refuses implicit local database/evidence defaults. The command takes a repeatable-read, read-only database transaction and keyset-pages the media registry. It reads one bounded private object at a time through the existing storage adapter. It checks registered parts and completed originals for SHA-256, byte sizes, complete part manifests and receipt links. Incomplete uploads may legitimately have missing parts; completed media may not. Exit status is nonzero for failures.

Output is aggregate counters only. It excludes database URLs, organization/worker/inspection identifiers, private paths, image bytes, GPS, and caught exception text. It never changes files or database rows. Filesystem content cannot be transactionally snapshotted by this command: stop writers or use a coordinated snapshot to avoid inconsistent reads. Missing, unreadable and inaccessible objects share a safe unreadable category; inspect underlying causes privately.

Limitations: this checks **registered** media/parts only; it does not enumerate orphan files, validate image decoding, verify full reference/review semantics, prove physical durability or establish backup completeness. It retains chunks and originals. The read-only transaction may be long on a large archive; schedule it operationally. No automatic deletion is authorized by this tool.

## Isolated CI spatial contract

The GitHub workflow defines a disposable `postgis/postgis:17-3.5` service containing CI-only fixture credentials. It applies portable migrations and additive `db/spatial.sql`, then executes the existing temporary-table spatial contract. Production credentials are never used. This configuration is committed for a future remote runner; adding it does not prove the job ran. The contract verifies real geography distances and organization-scoped neighboring candidates, not production pool/permissions/load or a complete field pilot.

The image family/tag is documented by the [upstream PostGIS image project](https://github.com/postgis/docker-postgis). This reference check does not substitute for pulling/running the configured image.
