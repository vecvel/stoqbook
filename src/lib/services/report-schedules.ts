import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { reportRuns, savedReports } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { tzOffsetMs } from "@/lib/timezone";

import { type ReportFilters } from "./reports";

/**
 * Saved and scheduled reports (14-reporting.md § Scheduled Reports).
 *
 * A schedule stores the next due instant rather than a cron expression, so a
 * run that is missed while the server is down is still claimed afterwards
 * instead of being skipped.
 */

export type ReportSchedule = "none" | "daily" | "weekly" | "monthly";

/**
 * The next time `schedule` is due at `hour` local time, strictly after `after`.
 * Returns null for an unscheduled report.
 */
export function nextRunAt(
  schedule: ReportSchedule,
  hour: number,
  timeZone: string,
  after: Date = new Date(),
): Date | null {
  if (schedule === "none") return null;

  const safeHour = Math.min(23, Math.max(0, Math.trunc(hour)));

  // Work in the business's local clock, then convert back to an instant.
  const localNow = new Date(after.getTime() + tzOffsetMs(after, timeZone));
  const candidate = new Date(localNow);
  candidate.setUTCHours(safeHour, 0, 0, 0);

  if (candidate <= localNow) {
    if (schedule === "daily") candidate.setUTCDate(candidate.getUTCDate() + 1);
    if (schedule === "weekly") candidate.setUTCDate(candidate.getUTCDate() + 7);
    if (schedule === "monthly") candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  } else if (schedule === "weekly" || schedule === "monthly") {
    // Already past today's hour is handled above; otherwise today is the day.
  }

  return new Date(candidate.getTime() - tzOffsetMs(candidate, timeZone));
}

/**
 * Rebuilds `ReportFilters` from the stored JSON.
 *
 * Two things have to be undone: JSON has no Date type, so `from`/`to` come back
 * as strings; and the saved keys use the URL parameter names the report page
 * uses (`store`) rather than the service's field names (`storeId`).
 */
export function toReportFilters(
  stored: Record<string, unknown>,
): ReportFilters {
  const date = (value: unknown): Date | null => {
    if (typeof value !== "string" || value === "") return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const text = (value: unknown): string | null =>
    typeof value === "string" && value !== "" ? value : null;

  return {
    from: date(stored.from),
    to: date(stored.to),
    storeId: text(stored.store ?? stored.storeId),
    warehouseId: text(stored.warehouse ?? stored.warehouseId),
    categoryId: text(stored.category ?? stored.categoryId),
  };
}

export interface SaveReportInput {
  id?: string;
  reportKey: string;
  name: string;
  filters?: Record<string, unknown>;
  isFavorite?: boolean;
  isShared?: boolean;
  schedule?: ReportSchedule;
  scheduleHour?: number;
  recipientUserIds?: string[];
}

export async function saveReport(
  ctx: BusinessContext,
  input: SaveReportInput,
): Promise<{ id: string; nextRunAt: Date | null }> {
  const schedule = input.schedule ?? "none";
  const hour = input.scheduleHour ?? 7;
  const next = nextRunAt(schedule, hour, ctx.business.timezone);

  const values = {
    report_key: input.reportKey,
    name: input.name,
    filters: input.filters ?? {},
    is_favorite: input.isFavorite ?? false,
    is_shared: input.isShared ?? false,
    schedule,
    schedule_hour: hour,
    recipient_user_ids: input.recipientUserIds ?? [],
    next_run_at: next,
  };

  if (input.id) {
    const [updated] = await db
      .update(savedReports)
      .set({ ...values, updated_at: new Date() })
      .where(
        and(
          eq(savedReports.id, input.id),
          eq(savedReports.tenant_id, ctx.business.id),
        ),
      )
      .returning({ id: savedReports.id });
    return { id: updated.id, nextRunAt: next };
  }

  const [created] = await db
    .insert(savedReports)
    .values({
      ...values,
      tenant_id: ctx.business.id,
      user_id: ctx.user.id,
    })
    .returning({ id: savedReports.id });

  return { id: created.id, nextRunAt: next };
}

export async function deleteSavedReport(
  ctx: BusinessContext,
  id: string,
): Promise<void> {
  await db
    .delete(savedReports)
    .where(
      and(eq(savedReports.id, id), eq(savedReports.tenant_id, ctx.business.id)),
    );
}

/** Records that a report was run, for the usage history. */
export async function recordRun(
  ctx: BusinessContext,
  input: {
    reportKey: string;
    filters?: Record<string, unknown>;
    rowCount: number;
    durationMs: number;
    exportFormat?: string | null;
  },
): Promise<void> {
  await db.insert(reportRuns).values({
    tenant_id: ctx.business.id,
    user_id: ctx.user.id,
    report_key: input.reportKey,
    filters: input.filters ?? {},
    export_format: input.exportFormat ?? undefined,
    row_count: input.rowCount,
    duration_ms: input.durationMs,
  });
}

/*
 * Dispatching due schedules lives in the job queue, not here.
 *
 * This module used to own a `runDueReports()` that claimed, ran and notified in
 * one loop — a single-purpose queue sitting next to the real one. It is now
 * `sweepDueReports()` plus the `report.run_scheduled` handler in
 * `src/lib/jobs/handlers/reports.ts`, which gets retries, backoff and a failure
 * list for free. The claim logic is unchanged: `next_run_at` is advanced before
 * the work is dispatched.
 */
