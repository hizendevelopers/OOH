# Local operational verification

These tools perform no deletion, retention cleanup or repair. They never establish a production backup guarantee. Existing local accounts, database and evidence must be preserved.

## Generated-fixture restore drill

Run `npx tsx scripts/restore-drill.ts`. No database credentials, source path or destination path are accepted. The command creates a unique ignored `.local/test-data/restore-drill-*` directory, applies all portable migrations to a new fixture database, creates generated private front/wide JPEGs and audit history, then snapshots the database with the installed PGlite `dumpDataDir` API. It persists and hashes the snapshot, closes the source, restores the persisted bytes through `loadDataDir` into a second new database and copies the generated evidence to a separate new directory.

Verification compares every public table's complete row fingerprints and counts, column definitions, indexes, constraints, noninternal triggers and public functions. It reconciles restored media/part hashes, sizes and receipt links, and attempts an audit mutation that must fail. The JSON output contains aggregate counts, a snapshot digest and elapsed time. Fixtures and snapshots are retained locally for inspection; no cleanup runs. They contain generated test material only.

This is a local PGlite filesystem-snapshot recovery test, not `pg_dump`/`pg_restore`, PostgreSQL networking, PostGIS, encrypted backup, production evidence recovery, real process-crash recovery, measured RPO/RTO or an actual customer-data restore. Production still requires a coordinated, encrypted PostgreSQL/private-volume backup and isolated restore drill under the deployment runbook. Never point a restore at an existing database or volume.

## Read-only private evidence reconciliation

First use a quiesced isolated restoration. Explicitly configure its `DATABASE_URL` (or existing absolute `IBVS_LOCAL_DB`) and existing absolute `IBVS_EVIDENCE_DIR`, set `IBVS_RUN_INTEGRITY_CHECK=true`, then run `npx tsx scripts/evidence-integrity.ts`. The tool refuses implicit local database/evidence defaults. The command takes a repeatable-read, read-only database transaction and keyset-pages the media registry. It reads one bounded private object at a time through the existing storage adapter. It checks registered parts and completed originals for SHA-256, byte sizes, complete part manifests and receipt links. Incomplete uploads may legitimately have missing parts; completed media may not. Exit status is nonzero for failures.

Output is aggregate counters only. It excludes database URLs, organization/worker/inspection identifiers, private paths, image bytes, GPS, and caught exception text. It does not modify application evidence files or application rows. Opening an embedded PGlite database can update engine maintenance files or access metadata. Filesystem content cannot be transactionally snapshotted by this command: stop writers or use a coordinated snapshot to avoid inconsistent reads. Missing, unreadable and inaccessible objects share a safe unreadable category; inspect underlying causes privately.

Limitations: this checks **registered** media/parts only; it does not enumerate orphan files, validate image decoding, verify full reference/review semantics, prove physical durability or establish backup completeness. It retains chunks and originals. The read-only transaction may be long on a large archive; schedule it operationally. No automatic deletion is authorized by this tool.

## Isolated CI spatial contract

The GitHub workflow defines a disposable `postgis/postgis:17-3.5` service containing CI-only fixture credentials. It applies portable migrations and additive `db/spatial.sql`, then executes the existing temporary-table spatial contract. Production credentials are never used. This configuration is committed for a future remote runner; adding it does not prove the job ran. The contract verifies real geography distances and organization-scoped neighboring candidates, not production pool/permissions/load or a complete field pilot.

The image family/tag is documented by the [upstream PostGIS image project](https://github.com/postgis/docker-postgis). This reference check does not substitute for pulling/running the configured image.

## Dry-run-only lifecycle inventory

On an explicitly configured, quiesced **isolated restored** database/evidence tree, set `IBVS_RUN_LIFECYCLE_PLAN=true` and run `npm run ops:lifecycle-plan`. As with reconciliation, DATABASE_URL or an existing absolute IBVS_LOCAL_DB and an existing canonical absolute IBVS_EVIDENCE_DIR are required; there are no default targets. Do not use a live writing tree. Opening PGlite may update engine maintenance metadata even though application rows and evidence are not modified.

The planner inventories regular objects and compares recognized internal keys against **both** media_evidence and evidence_parts, including incomplete uploads. It distinguishes referenced objects, unregistered objects, temporary files and unknown names, with aggregate stdout only. A temporary-file age observation of 24 hours is inventory information, not an approved retention period. Traversal is capped at 100,000 entries and bounded depth; limits, directory/read or DB errors fail without a completed report. Static symlinks/junctions/special entries are skipped; canonical-root checks reject redirected roots. Concurrent filesystem replacement is not a hostile-filesystem security boundary: stop writers and restrict operator access first.

Every object remains retained and `deletionEligible` is always zero. There is no apply/delete mode or private path manifest. An unregistered file may precede a transaction commit or contain recoverable failed-upload evidence; it is not proven useless. Approved retention/dispute/legal holds, ownership, active-upload protection and a reviewed immutable archive model must precede any future deletion implementation. Completed chunks remain referenced and are required by reconciliation; never delete them merely because an original exists. Use the registered-object integrity checker separately to find missing/corrupt references; inventory alone cannot prove completeness or image validity.

Local fixture tests check referenced originals, unregistered chunks, old temporary files, unknown names, byte preservation, traversal limits, relative-root refusal and database failure. The standalone planner passed against the earlier generated restored fixture (four registered files retained, zero deletion eligibility); absent opt-in correctly exits nonzero before opening the DB.

## Actual owned application process restart

After `npm run build`, run `npm run test:restart` at the repository root. It creates only new ignored generated fixtures and random credentials, rejects DATABASE_URL definitions in Next dotenv files, removes inherited DATABASE_URL for its children, and starts a directly owned Next production process on an allocated port bound to 127.0.0.1. It never targets an existing deployment/database/evidence directory or adopts an already running process. Readiness, HTTP, seed and exit operations have bounds; safe aggregate diagnostics avoid emitting credentials, cookies, raw logs or private paths.

The command acknowledges one chunk of a multi-part JPEG, proves no receipt yet, abruptly terminates only the child it spawned, then starts a new process against the same generated DB/private evidence/secret. It verifies the real authenticated session, inspection ID and partial manifest survive; resumes the remaining chunks, receives the inspection, compares both authorized original SHA-256 hashes, checks no-store, one history entry and stable receipt replay. Owned processes and request contexts are disposed; fixtures remain for inspection.

Final parent run passed in 22,111ms with two starts, seven resumed parts and two original hashes. An earlier attempt failed before upload with insufficiently precise diagnostics; bounded ANSI-stripped readiness collection and diagnostic stages were improved, and subsequent complete runs passed. The first failure's cause was not conclusively established, and it is not hidden. This is actual local application-process termination/restart over HTTP using PGlite, not physical power loss, arbitrary disk corruption, PostgreSQL/PostGIS/container recovery or a production backup restore.
