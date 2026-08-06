import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

/**
 * Normalizes connection string and detects SSL requirements for cloud database providers
 * (e.g. Neon, Supabase, Render, Railway, Aiven, AWS RDS, CockroachDB, etc.)
 */
function getPoolConfig(rawUrl: string): PoolConfig {
  let urlStr = rawUrl.trim();

  // On Windows, 'localhost' often resolves to IPv6 (::1) while local Postgres listens on IPv4.
  // Replace @localhost with @127.0.0.1 for local connections to prevent connection hanging.
  urlStr = urlStr
    .replace("@localhost:", "@127.0.0.1:")
    .replace("@localhost/", "@127.0.0.1/");

  let sslRequired = false;

  if (process.env.DATABASE_SSL === "true" || process.env.DATABASE_SSL === "1") {
    sslRequired = true;
  } else if (process.env.DATABASE_SSL === "false" || process.env.DATABASE_SSL === "0") {
    sslRequired = false;
  } else {
    try {
      const parsed = new URL(urlStr);
      const sslMode = parsed.searchParams.get("sslmode");
      const sslParam = parsed.searchParams.get("ssl");
      const host = parsed.hostname.toLowerCase();

      const isLocalHost =
        host === "127.0.0.1" ||
        host === "localhost" ||
        host === "db" ||
        host === "postgres" ||
        host === "host.docker.internal" ||
        host === "0.0.0.0";

      if (
        sslMode === "require" ||
        sslMode === "no-verify" ||
        sslMode === "prefer" ||
        sslParam === "true" ||
        sslParam === "1"
      ) {
        sslRequired = true;
      } else if (sslMode === "disable" || sslParam === "false" || sslParam === "0") {
        sslRequired = false;
      } else if (!isLocalHost) {
        sslRequired = true;
      }
    } catch {
      if (
        urlStr.includes("sslmode=require") ||
        urlStr.includes("ssl=true") ||
        urlStr.includes("neon.tech") ||
        urlStr.includes("supabase") ||
        urlStr.includes("render.com") ||
        urlStr.includes("railway.app") ||
        urlStr.includes("aivencloud.com")
      ) {
        sslRequired = true;
      }
    }
  }

  const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true";

  return {
    connectionString: urlStr,
    ssl: sslRequired ? { rejectUnauthorized } : undefined,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 10_000),
  };
}

/**
 * A single pool per process. Next dev recompiles modules, so the pool is cached
 * on globalThis to avoid exhausting Postgres connections on hot reload.
 */
const globalForDb = globalThis as unknown as { __stoqbookPool?: Pool };

const pool =
  globalForDb.__stoqbookPool ??
  new Pool(getPoolConfig(process.env.DATABASE_URL));

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

