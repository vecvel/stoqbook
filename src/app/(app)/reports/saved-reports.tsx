"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { removeScheduledReport, runDueSchedules } from "./schedule-actions";

export interface SavedReportView {
  id: string;
  name: string;
  reportKey: string;
  reportName: string;
  schedule: string;
  scheduleHour: number;
  recipients: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isShared: boolean;
}

export function SavedReportsPanel({
  reports,
  canSchedule,
}: {
  reports: SavedReportView[];
  canSchedule: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const scheduled = reports.filter((r) => r.schedule !== "none");

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeScheduledReport(id);
      if (result.ok) toast.success(result.message ?? "Deleted.");
      else toast.error(result.message ?? "Could not delete.");
    });
  }

  function runDue() {
    startTransition(async () => {
      const result = await runDueSchedules();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? "Could not run the schedules.");
    });
  }

  return (
    <section className="overflow-hidden rounded-xs border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Saved reports</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A saved report keeps its filters. A scheduled one also notifies its
            recipients when it runs.
          </p>
        </div>
        {canSchedule && scheduled.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={runDue}
          >
            Run due now
          </Button>
        ) : null}
      </header>

      {reports.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing saved yet. Open a report, set its filters and choose Save.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {reports.map((report) => (
            <li
              key={report.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <Link
                  href={`/reports/${report.reportKey}`}
                  className="text-sm font-medium hover:text-accent hover:underline"
                >
                  {report.name}
                </Link>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {report.reportName}
                  {report.lastRunAt ? ` · last run ${report.lastRunAt}` : ""}
                </span>
              </span>

              {report.isShared ? (
                <Badge variant="soft-neutral">Shared</Badge>
              ) : null}

              {report.schedule === "none" ? (
                <Badge variant="soft-neutral">On demand</Badge>
              ) : (
                <span className="flex items-center gap-2">
                  <Badge variant="soft-accent">
                    {report.schedule} at {String(report.scheduleHour).padStart(2, "0")}
                    :00
                  </Badge>
                  {report.nextRunAt ? (
                    <span className="text-[11px] text-muted-foreground">
                      next {report.nextRunAt}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    {report.recipients > 0
                      ? `${report.recipients} recipient(s)`
                      : "role default"}
                  </span>
                </span>
              )}

              {canSchedule ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => remove(report.id)}
                >
                  Delete
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canSchedule && scheduled.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          A due schedule runs on the next queue sweep. Press this to sweep now
          instead of waiting.
        </p>
      ) : null}
    </section>
  );
}
