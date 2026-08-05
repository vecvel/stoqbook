"use server";

import { requirePermission } from "@/lib/authz/guard";
import { REPORT_BY_KEY } from "@/lib/registry";
import { auditEvent } from "@/lib/services/audit";
import { drain, sweepDueReports } from "@/lib/jobs";
import {
  deleteSavedReport,
  saveReport,
  type ReportSchedule,
} from "@/lib/services/report-schedules";
import { IMPLEMENTED_REPORTS } from "@/lib/services/reports";
import {
  bool,
  failure,
  num,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

const SCHEDULES: ReportSchedule[] = ["none", "daily", "weekly", "monthly"];

export async function saveScheduledReport(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("reports.schedule", {
      feature: "reports.scheduled",
    });

    const reportKey = str(form, "report_key");
    const definition = REPORT_BY_KEY[reportKey];
    if (!definition || !IMPLEMENTED_REPORTS.has(reportKey)) {
      return failure("That report does not exist.");
    }

    // Scheduling a report must not become a way to receive data the schedule's
    // author cannot see themselves.
    await requirePermission(definition.permission, {
      feature: definition.feature,
    });

    const name = str(form, "name").trim();
    if (!name) return failure("Give the schedule a name.", { name: ["Required."] });

    const scheduleRaw = str(form, "schedule") || "none";
    const schedule = (SCHEDULES.includes(scheduleRaw as ReportSchedule)
      ? scheduleRaw
      : "none") as ReportSchedule;

    /* Filters are carried across verbatim so a schedule reproduces exactly the
       view the author was looking at when they saved it. */
    const filters: Record<string, unknown> = {};
    for (const key of ["from", "to", "store", "warehouse", "category", "status"]) {
      const value = str(form, `filter_${key}`);
      if (value) filters[key] = value;
    }

    const result = await saveReport(ctx, {
      id: uuid(form, "id") ?? undefined,
      reportKey,
      name,
      filters,
      isFavorite: bool(form, "is_favorite"),
      isShared: bool(form, "is_shared"),
      schedule,
      scheduleHour: num(form, "schedule_hour", 7),
      recipientUserIds: form.getAll("recipients").map(String).filter(Boolean),
    });

    await auditEvent(ctx, {
      event: "ReportScheduled",
      moduleSlug: "reports",
      entityType: "saved_report",
      entityId: result.id,
      summary: `${name} saved (${schedule})`,
    });

    revalidate("/reports", `/reports/${reportKey}`);
    return success(
      undefined,
      schedule === "none"
        ? "Report saved. Run it whenever you need it."
        : `Report saved. Next run ${result.nextRunAt?.toLocaleString() ?? "unscheduled"}.`,
    );
  });
}

export async function removeScheduledReport(
  savedReportId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("reports.schedule", {
      feature: "reports.scheduled",
    });

    await deleteSavedReport(ctx, savedReportId);

    await auditEvent(ctx, {
      event: "ReportScheduled",
      moduleSlug: "reports",
      entityType: "saved_report",
      entityId: savedReportId,
      summary: "Saved report deleted",
    });

    revalidate("/reports");
    return success(undefined, "Saved report deleted.");
  });
}

/**
 * Runs every schedule that has come due, now.
 *
 * The sweep enqueues one job per due report and this then drains the queue, so
 * the outcome is the same as waiting for the worker — just immediate. It stays
 * on the reports page because that is where somebody notices a schedule has not
 * arrived, and it is the fallback for an installation running no worker at all.
 */
export async function runDueSchedules(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("reports.schedule", {
      feature: "reports.scheduled",
    });

    const dispatched = await sweepDueReports(ctx.business.id);
    if (dispatched === 0) {
      return success(undefined, "Nothing is due yet.");
    }

    const result = await drain({ batchSize: 5, maxBatches: 20 });

    revalidate("/reports", "/notifications");
    return success(
      undefined,
      result.failed > 0
        ? `${dispatched} report(s) run; ${result.failed} failed — see Admin › Jobs.`
        : `${dispatched} report(s) run and delivered.`,
    );
  });
}
