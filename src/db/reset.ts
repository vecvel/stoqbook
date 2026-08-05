/**
 * Drops and recreates the public schema. Destructive — development only.
 * Run with: npm run db:reset
 */
import "dotenv/config";

import { sql } from "drizzle-orm";

import { db, pool } from "./index";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset the database with NODE_ENV=production.");
  }

  const url = process.env.DATABASE_URL ?? "";
  console.log(`Resetting schema on ${url.replace(/:[^:@]*@/, ":***@")}`);

  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);

  console.log("Schema reset. Run `npm run db:push` next.");
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
