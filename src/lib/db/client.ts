import "server-only";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __busExPgPool: Pool | undefined;
}

function getPool(): Pool {
  // Deliberately does not validate DATABASE_URL here -- the `pg` Pool
  // constructor doesn't connect eagerly, so this stays safe to import
  // during `next build`'s page-data collection (which has no real
  // database). A missing/invalid connection string only surfaces as an
  // error on the first actual query, at request time.
  if (!global.__busExPgPool) {
    global.__busExPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: true },
      max: 5,
    });
  }
  return global.__busExPgPool;
}

export const db = drizzle(getPool(), { schema });

/**
 * Runs `fn` inside a single Postgres transaction on a dedicated client, for
 * operations (like trade execution) that need `SELECT ... FOR UPDATE` row
 * locks across multiple statements. Always commits/rolls back explicitly
 * and releases the client back to the pool.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
