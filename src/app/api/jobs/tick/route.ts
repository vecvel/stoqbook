import { timingSafeEqual } from "node:crypto";

import { type NextRequest } from "next/server";

import { db } from "@/db";
import { tenants } from "@/db/schema";
import { drain, enqueueRecurring } from "@/lib/jobs";

/**
 * Drives the queue from outside the app (28-job-queue.md § Running the worker).
 *
 * Mode 3 of the three supported options: an external cron POSTs here. That suits
 * hosts which offer nothing but cron, and it is the honest interim — it is
 * exactly what the "Run due now" button did by hand, minus the human.
 *
 * Deliberately not session-authenticated: cron has no cookie. It is guarded by a
 * shared secret instead, and does nothing at all if that secret is unset.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.JOB_TICK_SECRET;

  // No secret configured means the endpoint is closed, not open. An unguarded
  // tick endpoint is a denial-of-service handle.
  if (!expected) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "NOT_CONFIGURED",
          message: "JOB_TICK_SECRET is not set, so this endpoint is disabled.",
        },
      },
      { status: 503 },
    );
  }

  if (!authorized(request, expected)) {
    return Response.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "Invalid token." } },
      { status: 401 },
    );
  }

  // One business per installation, so there is nothing to iterate — but the
  // queue is scoped by business anyway, which keeps the schema forward-
  // compatible in the same way the rest of the system is.
  const [business] = await db.select({ id: tenants.id }).from(tenants).limit(1);

  if (!business) {
    return Response.json({
      ok: true,
      message: "Not set up yet; nothing to do.",
      data: null,
    });
  }

  await enqueueRecurring(business.id);
  const result = await drain({ batchSize: 5, maxBatches: 20 });

  return Response.json({
    ok: true,
    message:
      result.claimed === 0
        ? "Nothing was due."
        : `${result.completed} completed, ${result.retrying} retrying, ${result.failed} failed.`,
    data: result,
  });
}

/** Constant-time comparison, so the secret cannot be discovered by timing. */
function authorized(request: NextRequest, expected: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : (request.headers.get("x-job-token") ?? "");

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
