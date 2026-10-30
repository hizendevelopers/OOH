import { PGlite } from "@electric-sql/pglite";
import { localDialect, mutex } from "./local-dialect";
import type { Dialect } from "kysely";
import { Pool, type PoolClient } from "pg";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { environment } from "./env";
import { databaseOptions } from "./database-options";

export interface Database {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
}
type Globals = typeof globalThis & {
  ibvsDb?: Promise<Database>;
  ibvsPglite?: PGlite;
  ibvsPool?: Pool;
  ibvsDialect?: Dialect;
};
const globalDb = globalThis as Globals;
export const root = () =>
  process.env.IBVS_ROOT ||
  (process.cwd().endsWith(path.join("apps", "web"))
    ? path.resolve(process.cwd(), "../..")
    : process.cwd());
function pgDatabase(client: Pool | PoolClient): Database {
  return {
    query: async <T>(sql: string, params: unknown[] = []) =>
      (await client.query(sql, params)).rows as T[],
    transaction: async <T>(fn: (db: Database) => Promise<T>) => {
      const connection = !("release" in client)
        ? await (client as Pool).connect()
        : (client as PoolClient);
      try {
        await connection.query("BEGIN");
        const result = await fn(pgDatabase(connection));
        await connection.query("COMMIT");
        return result;
      } catch (e) {
        await connection.query("ROLLBACK");
        throw e;
      } finally {
        if (!("release" in client)) connection.release();
      }
    },
  };
}
export async function getDb(): Promise<Database> {
  if (!globalDb.ibvsDb)
    globalDb.ibvsDb = (async () => {
      const env = environment();
      if (env.DATABASE_URL) {
        globalDb.ibvsPool = new Pool(databaseOptions(env));
        globalDb.ibvsPool.on("error", () => {
          console.error(JSON.stringify({ category: "database_pool_error" }));
        });
        return pgDatabase(globalDb.ibvsPool);
      }
      if (
        process.env.NODE_ENV === "production" &&
        process.env.IBVS_ALLOW_LOCAL_DB !== "true"
      )
        throw new Error("Production requires DATABASE_URL");
      const directory =
        process.env.IBVS_LOCAL_DB || path.join(root(), ".local", "postgres");
      await mkdir(directory, { recursive: true });
      const pg = new PGlite(directory);
      await pg.waitReady;
      const acquire = mutex();
      globalDb.ibvsPglite = pg;
      globalDb.ibvsDialect = localDialect(pg, acquire);
      const wrap = (handle: Pick<PGlite, "query">): Database => ({
        query: async <T>(sql: string, params: unknown[] = []) =>
          (await handle.query(sql, params)).rows as T[],
        transaction: async () => {
          throw new Error("Nested transactions are not supported");
        },
      });
      return {
        query: async <T>(sql: string, params: unknown[] = []) => {
          const release = await acquire();
          try {
            return (await pg.query(sql, params)).rows as T[];
          } finally {
            release();
          }
        },
        transaction: async <T>(fn: (db: Database) => Promise<T>) => {
          const release = await acquire();
          try {
            return await pg.transaction((tx) => fn(wrap(tx)));
          } finally {
            release();
          }
        },
      };
    })();
  return globalDb.ibvsDb;
}
export async function authDatabase() {
  await getDb();
  return (
    globalDb.ibvsPool ?? {
      dialect: globalDb.ibvsDialect!,
      type: "postgres" as const,
    }
  );
}
export async function closeDb() {
  if (globalDb.ibvsPglite) await globalDb.ibvsPglite.close();
  if (globalDb.ibvsPool) await globalDb.ibvsPool.end();
  delete globalDb.ibvsDb;
  delete globalDb.ibvsPglite;
  delete globalDb.ibvsPool;
}
