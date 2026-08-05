import type { Metadata } from "next";

import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { listJobs, queueStats, registeredKinds } from "@/lib/jobs";

import { JobRowActions, QueueControls } from "./queue-controls";

export const metadata: Metadata = { title: "Background jobs" };

/** Above this, the queue is not keeping up and something needs attention. */
const BACKLOG_WARNING_SECONDS = 900;

export default async function JobsPage() {
  const ctx = await requireAdmin("admin.panel");

  const [stats, jobs] = await Promise.all([
    queueStats(ctx.business.id),
    listJobs(ctx.business.id, { limit: 60 }),
  ]);

  const backlogStale = stats.oldestPendingSeconds > BACKLOG_WARNING_SECONDS;

  return (
    <div className="page">
      <PageHeader
        title="Background jobs"
        description="Notification delivery, scheduled reports and ledger checks run here rather than during a save, so a slow email never holds up a sale."
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Jobs" }]}
        actions={<QueueControls completedCount={stats.completed24h} />}
      />

      <StatGrid>
        <StatTile
          label="Pending"
          value={formatNumber(stats.pending)}
          sublabel="Waiting to run"
          icon="Clock"
          tone={stats.pending > 0 ? "accent" : "neutral"}
        />
        <StatTile
          label="Running"
          value={formatNumber(stats.running)}
          sublabel="Claimed by a worker"
          icon="Hourglass"
          tone="neutral"
        />
        <StatTile
          label="Failed"
          value={formatNumber(stats.failed)}
          sublabel="Retries exhausted"
          icon="AlertTriangle"
          tone={stats.failed > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Oldest wait"
          value={
            stats.oldestPendingSeconds === 0
              ? "—"
              : `${Math.round(stats.oldestPendingSeconds / 60)}m`
          }
          sublabel={`${formatNumber(stats.completed24h)} done in 24h`}
          icon="Activity"
          tone={backlogStale ? "warning" : "success"}
        />
      </StatGrid>

      {backlogStale ? (
        <Notice tone="warning">
          The oldest waiting job has been due for{" "}
          {Math.round(stats.oldestPendingSeconds / 60)} minutes. Nothing is
          draining the queue — either start the worker, point a cron at{" "}
          <span className="font-mono text-xs">POST /api/jobs/tick</span>, or use
          Run due now above.
        </Notice>
      ) : null}

      {stats.failed > 0 ? (
        <Notice tone="danger">
          {formatNumber(stats.failed)} job
          {stats.failed === 1 ? " has" : "s have"} used up every retry. Nothing
          is lost — each one is listed below with its error and can be retried
          once the cause is fixed.
        </Notice>
      ) : null}

      <TableShell>
        <Table>
          <THead>
            <TH>Kind</TH>
            <TH>Status</TH>
            <TH align="center">Attempts</TH>
            <TH>Due</TH>
            <TH>Last error</TH>
            <TH align="right">Action</TH>
          </THead>
          <TBody>
            {jobs.length === 0 ? (
              <EmptyRow colSpan={6}>
                Nothing has been queued yet.
              </EmptyRow>
            ) : (
              jobs.map((job) => (
                <TR key={job.id} muted={job.status === "completed"}>
                  <TD>
                    <span className="font-mono text-xs font-medium">
                      {job.kind}
                    </span>
                    {job.priority !== 100 ? (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        priority {job.priority}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <StatusBadge status={job.status} />
                  </TD>
                  <TD align="center">
                    <span
                      className={
                        job.attempts > 1 ? "font-medium text-warning" : undefined
                      }
                    >
                      {job.attempts}/{job.max_attempts}
                    </span>
                  </TD>
                  <TD>
                    <span title={formatDateTime(job.run_after)}>
                      {formatRelative(job.run_after)}
                    </span>
                  </TD>
                  <TD className="max-w-md">
                    {job.last_error ? (
                      <span className="line-clamp-2 text-xs text-destructive">
                        {job.last_error}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD align="right">
                    <JobRowActions jobId={job.id} status={job.status} />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableShell>

      <div className="rounded-xs border border-border bg-card p-3.5">
        <h2 className="text-sm font-semibold">Registered kinds</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          A queued job whose kind is not on this list fails immediately rather
          than burning five retries on work nothing can do.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {registeredKinds().map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {kind}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
