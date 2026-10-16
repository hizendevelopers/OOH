import { PGlite } from "@electric-sql/pglite";
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  CompiledQuery,
  type Dialect,
  type Driver,
  type DatabaseConnection,
  type QueryResult,
} from "kysely";

/** Development-only PostgreSQL dialect. Every Kysely connection is serialized;
 * production uses pg's real pool. No CLI/codegen dependencies in the runtime. */
export function mutex() {
  let tail = Promise.resolve();
  return async () => {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = tail;
    tail = next;
    await previous;
    return release;
  };
}
export function localDialect(
  pg: PGlite,
  acquire: ReturnType<typeof mutex>,
): Dialect {
  const unlock = new WeakMap<DatabaseConnection, () => void>();
  const driver: Driver = {
    async init() {
      await pg.waitReady;
    },
    async acquireConnection() {
      const release = await acquire();
      const connection: DatabaseConnection = {
        async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
          const result = await pg.query<R>(query.sql, [...query.parameters]);
          return {
            rows: result.rows,
            numAffectedRows:
              result.affectedRows === undefined
                ? undefined
                : BigInt(result.affectedRows),
          };
        },
        async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
          throw new Error(
            "Streaming is unavailable on the development database",
          );
        },
      };
      unlock.set(connection, release);
      return connection;
    },
    async releaseConnection(connection) {
      unlock.get(connection)?.();
      unlock.delete(connection);
    },
    async beginTransaction(connection) {
      await connection.executeQuery(CompiledQuery.raw("BEGIN"));
    },
    async commitTransaction(connection) {
      await connection.executeQuery(CompiledQuery.raw("COMMIT"));
    },
    async rollbackTransaction(connection) {
      await connection.executeQuery(CompiledQuery.raw("ROLLBACK"));
    },
    async destroy() {
      /* Lifecycle is owned by closeDb, not each auth configuration. */
    },
  };
  return {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createQueryCompiler: () => new PostgresQueryCompiler(),
    createIntrospector: (db) => new PostgresIntrospector(db),
  };
}
