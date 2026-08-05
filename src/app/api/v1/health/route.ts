import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";

/**
 * GET /api/v1/health — unauthenticated liveness and readiness probe.
 * Reports database reachability without exposing any tenant data.
 */
export async function GET() {
  const started = Date.now();

  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      {
        success: true,
        status: "ok",
        checks: { database: "ok" },
        latencyMs: Date.now() - started,
        version: process.env.npm_package_version ?? "1.0.0",
        timestamp: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        status: "degraded",
        checks: { database: "unreachable" },
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
