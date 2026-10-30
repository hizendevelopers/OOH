import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDb, closeDb, root, type Database } from "../apps/web/src/server/db";
import { environment } from "../apps/web/src/server/env";

type Column = {
  table_name: string;
  name: string;
  data_type: string;
  required: boolean;
  expression: string | null;
  generated: string;
};
type Constraint = {
  table_name: string;
  name: string;
  kind: string;
  definition: string;
  columns: string[];
  parent_table: string | null;
  parent_columns: string[] | null;
};
type Index = {
  table_name: string;
  name: string;
  definition: string;
  unique: boolean;
  columns: string[];
  predicate: string | null;
};
type Trigger = { table_name: string; name: string; definition: string };
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const code = (value: string) =>
  `\`${value.replaceAll("`", "'").replaceAll("|", "\\|")}\``;

const modules: Record<string, Record<string, string>> = {
  "Identity and organizations": {
    organizations: "Organization boundary and demo marker.",
    roles: "Supported application roles: admin and worker.",
    user: "Application identities managed by Better Auth; separate from Supabase auth.users.",
    organization_members: "One organization and role per application user.",
    worker_profiles: "Active field-worker profile and display city.",
    account: "Authentication provider accounts and password hashes.",
    session: "Expiring application sessions.",
    verification: "Expiring authentication verification values.",
    rateLimit: "Authentication request rate-limit counters.",
  },
  Inventory: {
    billboard_structures:
      "Physical billboard structures, scoped to an organization.",
    billboard_faces: "Stable face identity within a physical structure.",
    source_coordinates:
      "Immutable imported coordinates, uncertainty and spatial geography.",
    location_coordinate_corrections:
      "Append-only reasoned coordinate corrections; originals remain unchanged.",
    location_exceptions:
      "Time-limited supervisor authorizations bound to an assignment version.",
  },
  "Field visits and evidence": {
    assignments:
      "Worker visit assignments, state, version and linked resurvey instructions.",
    challenges: "Expiring online-capture challenges and consumption tracking.",
    inspections: "Idempotent inspection uploads and immutable server receipts.",
    media_evidence:
      "Front/wide original-photo metadata, byte counts, hashes and private object keys.",
    evidence_parts: "Immutable resumable upload-part manifests.",
  },
  "Review and reference baselines": {
    review_cases:
      "Current review state, concurrency version, assessment and independent-review requirement.",
    media_analysis: "Immutable per-photo analysis facts and perceptual hashes.",
    verification_runs: "Immutable versioned risk assessments and reports.",
    review_decisions:
      "Idempotent, versioned human decisions with reasons and acknowledgements.",
    reference_baselines:
      "Versioned structural reference enrollments for a specific face and inspection.",
    reference_photos: "Original evidence bound to each baseline photo kind.",
    baseline_events: "Immutable, reasoned withdrawals of reference baselines.",
  },
  "Audit and operations": {
    audit_events: "Append-only organization-scoped operation history.",
    activity_logs: "Actor activity categories and timestamps.",
    analysis_admissions:
      "Short-lived admission leases limiting analysis concurrency.",
    schema_migrations: "Applied portable migration ledger.",
  },
};

async function inspect(db: Database) {
  const tables = await db.query<{ name: string }>(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname='ibvs' ORDER BY tablename",
  );
  const columns =
    await db.query<Column>(`SELECT c.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS expression,a.attgenerated AS generated
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='ibvs' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`);
  const constraints =
    await db.query<Constraint>(`SELECT c.relname AS table_name,k.conname AS name,k.contype AS kind,pg_get_constraintdef(k.oid,true) AS definition,
    ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS x(num,pos) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.num ORDER BY x.pos) AS columns,
    parent.relname AS parent_table,ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY AS x(num,pos) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=x.num ORDER BY x.pos) AS parent_columns
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_class parent ON parent.oid=k.confrelid
    WHERE n.nspname='ibvs' AND k.contype IN ('p','u','c','f') ORDER BY CASE k.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END,c.relname,k.conname`);
  const indexes =
    await db.query<Index>(`SELECT c.relname AS table_name,i.relname AS name,pg_get_indexdef(i.oid) AS definition,x.indisunique AS unique,pg_get_expr(x.indpred,x.indrelid) AS predicate,
    ARRAY(SELECT a.attname::text FROM unnest(x.indkey::smallint[]) WITH ORDINALITY AS k(num,pos) JOIN pg_attribute a ON a.attrelid=x.indrelid AND a.attnum=k.num WHERE k.pos<=x.indnkeyatts ORDER BY k.pos) AS columns
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ibvs' AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conindid=i.oid AND k.contype IN ('p','u','x')) ORDER BY c.relname,i.relname`);
  const functions = await db.query<{ name: string; definition: string }>(
    "SELECT p.proname AS name,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ibvs' ORDER BY p.proname",
  );
  const triggers = await db.query<Trigger>(
    "SELECT c.relname AS table_name,t.tgname AS name,pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ibvs' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
  );
  const views = await db.query<{ name: string; definition: string }>(
    "SELECT viewname AS name,definition FROM pg_views WHERE schemaname='ibvs' ORDER BY viewname",
  );
  const migrations = await db.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY name",
  );
  return {
    tables,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    migrations,
    views,
  };
}

try {
  if (environment().DATABASE_SCHEMA !== "ibvs" || !environment().DATABASE_URL)
    throw new Error(
      "Schema export requires the configured hosted ibvs database",
    );
  const snapshot = await (
    await getDb()
  ).transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    return inspect(db);
  });
  const {
    tables,
    columns,
    constraints,
    indexes,
    functions,
    triggers,
    migrations,
    views,
  } = snapshot;
  const expected = Object.values(modules)
    .flatMap((module) => Object.keys(module))
    .sort();
  if (
    JSON.stringify(tables.map((table) => table.name)) !==
    JSON.stringify(expected)
  )
    throw new Error(
      "Live tables differ from the application table catalog; inspect before exporting",
    );
  const migrationFiles = (await readdir(path.join(root(), "db/migrations")))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (
    JSON.stringify(migrations.map((migration) => migration.name)) !==
    JSON.stringify(migrationFiles)
  )
    throw new Error("Apply pending migrations before exporting the schema");

  const sql = [
    "-- Complete IBVS PostgreSQL schema, exported by npm run db:schema:export.",
    "-- Target: an empty ibvs schema on Supabase PostgreSQL 17, using an administrative role.",
    "-- This is a fresh-install schema, not an upgrade script. No operational or demo data is included.",
    "-- Runtime credentials are configured separately; no passwords are embedded here.",
    "BEGIN;",
    "SELECT pg_advisory_xact_lock(hashtext('ibvs.schema.install'));",
    "DO $ibvs_guard$ BEGIN",
    "  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ibvs')",
    "     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='ibvs') THEN",
    "    RAISE EXCEPTION 'ibvs schema is not empty; run db/schema.sql for an existing installation';",
    "  END IF;",
    "END $ibvs_guard$;",
    "CREATE SCHEMA IF NOT EXISTS extensions;",
    "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;",
    "CREATE SCHEMA IF NOT EXISTS ibvs;",
    "SET LOCAL search_path = ibvs, extensions, public;",
    "DO $ibvs_role$ BEGIN",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ibvs_app') THEN",
    "    CREATE ROLE ibvs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;",
    "  END IF;",
    "END $ibvs_role$;",
    "\n-- Tables and columns. Constraints follow after all tables to support cyclic references.",
  ];
  for (const table of tables) {
    sql.push(
      `CREATE TABLE ibvs.${identifier(table.name)} (\n${columns
        .filter((column) => column.table_name === table.name)
        .map((column) => {
          const expression = column.generated
            ? ` GENERATED ALWAYS AS (${column.expression}) STORED`
            : column.expression
              ? ` DEFAULT ${column.expression}`
              : "";
          return `  ${identifier(column.name)} ${column.data_type}${expression}${column.required ? " NOT NULL" : ""}`;
        })
        .join(",\n")}\n);`,
    );
  }
  sql.push(
    "\n-- Primary keys, unique keys, validation checks and foreign keys.",
  );
  for (const constraint of constraints)
    sql.push(
      `ALTER TABLE ibvs.${identifier(constraint.table_name)} ADD CONSTRAINT ${identifier(constraint.name)} ${constraint.definition};`,
    );
  sql.push(
    "\n-- Additional indexes, including active-assignment uniqueness and PostGIS GiST.",
  );
  for (const index of indexes) sql.push(index.definition + ";");
  sql.push(
    "\n-- Immutable-evidence and identity protection functions/triggers.",
  );
  for (const fn of functions) sql.push(fn.definition.trimEnd() + ";");
  for (const trigger of triggers) sql.push(trigger.definition + ";");
  for (const view of views)
    sql.push(
      `CREATE VIEW ibvs.${identifier(view.name)} WITH (security_invoker = true) AS ${view.definition.trim().replace(/;$/, "")};`,
    );
  sql.push(
    "\n-- Required reference values and migration ledger; no business records.",
  );
  sql.push("INSERT INTO ibvs.roles(id) VALUES ('admin'),('worker');");
  sql.push(
    `INSERT INTO ibvs.schema_migrations(name) VALUES\n${migrations.map((migration) => `  (${literal(migration.name)})`).join(",\n")};`,
  );
  sql.push(
    "\n-- Restricted application-role permissions and private-schema protection.",
  );
  sql.push(
    (await readFile(path.join(root(), "db/supabase.sql"), "utf8")).trim(),
  );
  sql.push("COMMIT;", "");
  await writeFile(path.join(root(), "db/schema-fresh.sql"), sql.join("\n\n"));

  // The default user-facing SQL must also work against an existing project.
  // Apply migrations according to their ledger, without replaying CREATE TABLE
  // statements or recreating operational data.
  const installer = [
    "-- IBVS repeatable setup and upgrade script for Supabase SQL Editor (postgres).",
    "-- Safe to rerun: completed migrations are skipped and existing records are preserved.",
    "-- db/schema-fresh.sql is the separate final-DDL snapshot for empty schemas only.",
    "BEGIN;",
    "SELECT pg_advisory_xact_lock(hashtext('ibvs.schema.install'));",
    "CREATE SCHEMA IF NOT EXISTS extensions;",
    "CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;",
    "CREATE SCHEMA IF NOT EXISTS ibvs;",
    "SET LOCAL search_path = ibvs, extensions, public;",
    "DO $ibvs_ledger_guard$ BEGIN",
    "  IF to_regclass('ibvs.schema_migrations') IS NULL AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ibvs') THEN",
    "    RAISE EXCEPTION 'Existing ibvs tables have no migration ledger; inspect before applying upgrades';",
    "  END IF;",
    "END $ibvs_ledger_guard$;",
    "CREATE TABLE IF NOT EXISTS ibvs.schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());",
    "DO $ibvs_role$ BEGIN",
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ibvs_app') THEN",
    "    CREATE ROLE ibvs_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;",
    "  END IF;",
    "END $ibvs_role$;",
  ];
  for (const [index, file] of migrationFiles.entries()) {
    const body = await readFile(
      path.join(root(), "db/migrations", file),
      "utf8",
    );
    const outer = `$ibvs_apply_${index + 1}$`;
    const inner = `$ibvs_sql_${index + 1}$`;
    if (body.includes(outer) || body.includes(inner))
      throw new Error(`Migration ${file} collides with installer delimiters`);
    installer.push(
      `\n-- ${file}\nDO ${outer} BEGIN\n  IF NOT EXISTS (SELECT 1 FROM ibvs.schema_migrations WHERE name=${literal(file)}) THEN\n    EXECUTE ${inner}\n${body.trim()}\n${inner};\n    INSERT INTO ibvs.schema_migrations(name) VALUES (${literal(file)});\n  END IF;\nEND ${outer};`,
    );
  }
  installer.push(
    (await readFile(path.join(root(), "db/spatial.sql"), "utf8")).trim(),
  );
  installer.push(
    (await readFile(path.join(root(), "db/supabase.sql"), "utf8")).trim(),
  );
  installer.push(
    `DO $ibvs_verify$\nDECLARE missing text;\nBEGIN\n  SELECT string_agg(name, ', ' ORDER BY name) INTO missing FROM unnest(ARRAY[${expected.map(literal).join(",")}]) AS required(name)\n  WHERE NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ibvs' AND tablename=required.name);\n  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Migration ledger and schema differ; missing tables: %', missing; END IF;\nEND $ibvs_verify$;`,
  );
  installer.push(
    "COMMIT;",
    "SELECT 'ready' AS status, 'ibvs' AS schema, (SELECT count(*) FROM pg_tables WHERE schemaname='ibvs') AS tables, (SELECT count(*) FROM ibvs.schema_migrations) AS migrations;",
    "",
  );
  await writeFile(path.join(root(), "db/schema.sql"), installer.join("\n"));

  const diagrams: string[] = [];
  for (const [module, entries] of Object.entries(modules)) {
    const lines = ["erDiagram"];
    const included = new Set(Object.keys(entries));
    const edges = constraints.filter(
      (constraint) =>
        constraint.kind === "f" && included.has(constraint.table_name),
    );
    for (const edge of edges)
      if (edge.parent_table) included.add(edge.parent_table);
    for (const table of [...included].sort()) {
      const keys = constraints.filter(
        (constraint) =>
          constraint.table_name === table &&
          ["p", "f"].includes(constraint.kind),
      );
      const fields = columns.filter(
        (column) =>
          column.table_name === table &&
          keys.some((key) => key.columns.includes(column.name)),
      );
      lines.push(`  ${table} {`);
      for (const field of fields) {
        const tags = ["p", "f"]
          .filter((kind) =>
            keys.some(
              (key) => key.kind === kind && key.columns.includes(field.name),
            ),
          )
          .map((kind) => (kind === "p" ? "PK" : "FK"));
        lines.push(
          `    ${field.data_type.replace(/[^a-zA-Z0-9_]/g, "_")} ${field.name} ${tags.join(",")}`,
        );
      }
      // Standalone counters/verification tables still need a visible entity.
      if (!fields.length) lines.push("    text id PK");
      lines.push("  }");
    }
    for (const edge of edges) {
      const uniqueConstraint = constraints.some(
        (key) =>
          key.table_name === edge.table_name &&
          ["p", "u"].includes(key.kind) &&
          key.columns.every((column) => edge.columns.includes(column)),
      );
      const uniqueIndex = indexes.some(
        (index) =>
          index.table_name === edge.table_name &&
          index.unique &&
          index.columns.length > 0 &&
          index.columns.every((column) => edge.columns.includes(column)) &&
          (index.predicate === null ||
            (edge.columns.length === 1 &&
              index.predicate.replace(/[()"']/g, "").trim() ===
                `${edge.columns[0]} IS NOT NULL`)),
      );
      const unique = uniqueConstraint || uniqueIndex;
      const required = edge.columns.every((name) =>
        columns.some(
          (column) =>
            column.table_name === edge.table_name &&
            column.name === name &&
            column.required,
        ),
      );
      lines.push(
        `  ${edge.parent_table} ${required ? "||" : "|o"}--${unique ? "o|" : "o{"} ${edge.table_name} : "${edge.columns.join(", ")}"`,
      );
    }
    diagrams.push(`## ${module}\n\n\`\`\`mermaid\n${lines.join("\n")}\n\`\`\``);
  }
  await writeFile(
    path.join(root(), "docs/DATABASE_ERD.md"),
    "# Database relationships\n\nGenerated from the live PostgreSQL foreign keys. Exact nullability, composite keys, partial unique indexes and checks are listed in [the schema reference](DATABASE_SCHEMA.md). Logical service-level links are described there separately.\n\n" +
      diagrams.join("\n\n") +
      "\n",
  );

  const doc = [
    "# Complete database schema",
    "The current application uses the private `ibvs` schema in Supabase project `utokgrudjgnvypzxufcx`. This reference and the SQL file are generated from a consistent, read-only snapshot of the live database.",
    `**Inventory:** ${tables.length} tables, ${constraints.filter((constraint) => constraint.kind === "f").length} foreign keys, ${indexes.length + constraints.filter((constraint) => ["p", "u"].includes(constraint.kind)).length} indexes, ${functions.length} trigger functions, ${triggers.length} triggers, and PostGIS geography.`,
    "## Files and installation",
    "- [Repeatable setup SQL](../db/schema.sql): run in Supabase SQL Editor as `postgres` for a new or existing installation. Completed migrations are skipped and existing records are preserved. The result is `ready` with table and migration counts.\n- [Fresh-install DDL snapshot](../db/schema-fresh.sql): final table definitions for an empty schema only; its guard deliberately rejects an existing database.\n- [ER diagrams](DATABASE_ERD.md): relationships grouped by workflow.\n- [Supabase connection setup](SUPABASE_SETUP.md): credentials, verified TLS and runtime configuration.\n- [Portable upgrades](../db/migrations/): source migrations used by the repeatable setup and migration runner.",
    "The connected project already has this schema; no reinstall is needed. For a new Supabase project, run `db/schema.sql` in its SQL Editor as `postgres`. The script creates the restricted `ibvs_app` role without embedding a password. Configure its password separately with secure administrative tooling, then set the server-only `DATABASE_URL`, `DATABASE_SCHEMA=ibvs` and TLS certificate settings. Initialize the actual organization and real accounts using administrative provisioning; `npm run db:bootstrap` creates only the internal no-login workspace actor. No sample inventory, workers, assignments or evidence is seeded.",
    "To refresh these artifacts from the connected database, run `npm run db:schema:export`. This reads schema metadata only; it does not dump users, password hashes, sessions, photos or business data.",
    "## End-to-end data flow",
    "Organization and user membership → physical structure → billboard face → immutable imported coordinate → worker assignment → capture challenge/inspection → resumable photo parts → server receipt → image analysis and versioned risk assessment → human review decision → explicit reference enrollment or withdrawal/resurvey → audit history.",
    "Original image bytes live in the configured private evidence directory. `media_evidence` and `evidence_parts` store private object keys, byte counts and hashes; the schema does not pretend to store the JPEG bytes in PostgreSQL.",
    "## Access and integrity",
    "Application tables are outside the public Data API. The server's `ibvs_app` role has explicit grants; it cannot create schema objects or delete immutable source/audit records. API services enforce administrator/worker and organization scope. This is a trusted-server access model, not Supabase Auth JWT/RLS authorization. Better Auth identities in `ibvs.user` are separate from `auth.users`.",
    "Primary/foreign/unique keys, coordinate ranges, upload limits and status checks are database constraints. The twelve triggers protect imported coordinates, face identity, received inspections/photos, analysis records, decisions, baseline records and audit events. Atomic service transactions, operation IDs, payload hashes and versions implement replay protection and concurrency checks.",
    "`review_cases.assessment_id` and `challenges.consumed_by` are logical service links rather than foreign-key constraints. `reference_photos.original_hash` and other hash fields preserve original identities without being table references. The dictionary below lists the actual database constraints without inventing extra relationships.",
  ];
  for (const [module, entries] of Object.entries(modules)) {
    doc.push(`## ${module}`);
    for (const [table, purpose] of Object.entries(entries)) {
      doc.push(
        `### ${table}\n\n${purpose}\n\n| Column | Type | Nullable | Default / generated expression |\n| --- | --- | --- | --- |\n` +
          columns
            .filter((column) => column.table_name === table)
            .map(
              (column) =>
                `| ${code(column.name)} | ${code(column.data_type)} | ${column.required ? "No" : "Yes"} | ${column.expression ? (column.generated ? "Generated: " : "") + code(column.expression) : "—"} |`,
            )
            .join("\n"),
      );
      const tableConstraints = constraints.filter(
        (constraint) => constraint.table_name === table,
      );
      doc.push(
        "Constraints:\n\n" +
          tableConstraints
            .map(
              (constraint) =>
                `- ${code(constraint.name)}: ${code(constraint.definition)}`,
            )
            .join("\n"),
      );
      const tableIndexes = indexes.filter(
        (index) => index.table_name === table,
      );
      if (tableIndexes.length)
        doc.push(
          "Additional indexes:\n\n" +
            tableIndexes
              .map((index) => `- ${code(index.definition)}`)
              .join("\n"),
        );
      const tableTriggers = triggers.filter(
        (trigger) => trigger.table_name === table,
      );
      if (tableTriggers.length)
        doc.push(
          "Triggers:\n\n" +
            tableTriggers
              .map((trigger) => `- ${code(trigger.definition)}`)
              .join("\n"),
        );
    }
  }
  await writeFile(
    path.join(root(), "docs/DATABASE_SCHEMA.md"),
    doc.join("\n\n") + "\n",
  );
  console.log(
    `Exported db/schema.sql, db/schema-fresh.sql, docs/DATABASE_SCHEMA.md and docs/DATABASE_ERD.md from ${tables.length} live tables.`,
  );
} finally {
  await closeDb();
}
