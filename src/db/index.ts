import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

/**
 * A single pool per process. Next dev recompiles modules, so the pool is cached
 * on globalThis to avoid exhausting Postgres connections on hot reload.
 */
const globalForDb = globalThis as unknown as { __stoqbookPool?: Pool };

const pool =
  globalForDb.__stoqbookPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__stoqbookPool = pool;
}

export const db = drizzle(pool, { schema });
export { pool, schema };

/** Transaction type used throughout the service layer. */
export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Either the root db handle or an open transaction. */
export type DbClient = Database | Transaction;
