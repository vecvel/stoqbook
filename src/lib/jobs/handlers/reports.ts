import "server-only";

import { and, eq, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { savedReports } from "@/db/schema";
import { emit } from "@/lib/services/notifications";
import { REPORT_BY_KEY } from "@/lib/registry";
import {
  nextRunAt,
  recordRun,
  toReportFilters,
  type ReportSchedule,
} from "@/lib/services/report-schedules";
import { IMPLEMENTED_REPORTS, runReport } from "@/lib/services/reports";

import { registerJob } from "../runner";
import { PermanentJobFailure } from "../types";
import { enqueue } from "../queue";

/**
 * Scheduled reports (14-reporting.md § Scheduled Reports).
 *
 * `runDueReports()` in the report-schedules service was effectively a
 * hand-rolled single-purpose queue — claim, run, notify. This folds that into
 * the real one: the sweep finds what is due and enqueues one job per report, so
 * a slow report cannot delay the others and a failure retries on the standard
 * backoff.
 */

interface RunScheduledPayload {
  savedReportId: string;
}

registerJob<RunScheduledPayload>("report.run_scheduled", async (payload, ctx) => {
  const [saved] = await db
    .select()
    .from(savedReports)
    .where(
      and(
        eq(savedReports.id, payload.savedReportId),
        eq(savedReports.tenant_id, ctx.businessId),
      ),
    )
    .limit(1);

  if (!saved) {
    throw new PermanentJobFailure("Saved report no longer exists.");
  }
  if (saved.schedule === "none") {
    // Unscheduled between the sweep and now. Not an error.
    return;
  }
  if (!IMPLEMENTED_REPORTS.has(saved.report_key)) {
    throw new PermanentJobFailure(
      `Report "${saved.report_key}" has no implementation.`,
    );
  }

  /* The report runner needs a full BusinessContext for its permission-aware
     store scoping. A scheduled run has no session, so one is assembled from the
     saved report's author — which is also what keeps a schedule from returning
     data its owner could not see themselves. */
  const ctxForRun = await contextForSavedReport(ctx.businessId, saved.user_id);

  const startedAt = Date.now();
  const result = await runReport(
    ctxForRun,
    saved.report_key,
    toReportFilters(saved.filters),
  );
  const durationMs = Date.now() - startedAt;

  await recordRun(ctxForRun, {
    reportKey: saved.report_key,
    filters: saved.filters,
    rowCount: result.rowCount,
    durationMs,
  });

  const definition = REPORT_BY_KEY[saved.report_key];
  await emit({
    businessId: ctx.businessId,
    event: "ScheduledReportReady",
    moduleSlug: "reports",
    priority: "low",
    title: `${saved.name} is ready`,
    body: `${result.rowCount} row(s) as at ${new Date().toDateString()}.`,
    actionUrl: `/reports/${saved.report_key}`,
    userIds: saved.recipient_user_ids.length
      ? saved.recipient_user_ids
      : undefined,
    fallbackPermission: definition?.permission ?? "reports.view",
    variables: {
      report: saved.name,
      rows: result.rowCount,
      date: new Date().toDateString(),
    },
  });
});

/**
 * Finds every schedule that has come due and enqueues one job each.
 *
 * Claims by advancing `next_run_at` **before** enqueueing, so two concurrent
 * sweeps cannot both dispatch the same report.
 */
export async function sweepDueReports(
  businessId: string,
  now: Date = new Date(),
): Promise<number> {
  const { tenants } = await import("@/db/schema");
  const [business] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, businessId))
    .limit(1);
  if (!business) return 0;

  const due = await db
    .select()
    .from(savedReports)
    .where(
      and(
        eq(savedReports.tenant_id, businessId),
        or(lte(savedReports.next_run_at, now), isNull(savedReports.next_run_at)),
      ),
    );

  let dispatched = 0;

  for (const saved of due) {
    if (saved.schedule === "none") continue;

    const advanced = nextRunAt(
      saved.schedule as ReportSchedule,
      saved.schedule_hour,
      business.timezone,
      now,
    );

    const claimed = await db
      .update(savedReports)
      .set({ next_run_at: advanced, last_run_at: now, updated_at: now })
      .where(
        and(
          eq(savedReports.id, saved.id),
          saved.next_run_at
            ? lte(savedReports.next_run_at, now)
            : isNull(savedReports.next_run_at),
        ),
      )
      .returning({ id: savedReports.id });

    if (claimed.length === 0) continue;

    await enqueue({
      businessId,
      kind: "report.run_scheduled",
      payload: { savedReportId: saved.id },
      priority: 150,
    });
    dispatched += 1;
  }

  return dispatched;
}

/**
 * Builds a context for an unattended run.
 *
 * Uses the schedule's author when they are still active, so their permissions
 * bound what the report can see. When they are gone, the Owner stands in —
 * otherwise a departing manager would silently break every schedule they made.
 */
async function contextForSavedReport(businessId: string, authorId: string | null) {
  const { buildSystemContext } = await import("@/lib/authz/system-context");
  return buildSystemContext(businessId, authorId);
}
