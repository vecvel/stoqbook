import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Icon } from "@/components/layout/icon";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { and, asc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import { savedReports } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { visibleReports } from "@/lib/navigation";
import {
  MODULE_BY_SLUG,
  REPORT_BY_KEY,
  REPORT_GROUPS,
} from "@/lib/registry";
import { formatDateTime } from "@/lib/format";
import { IMPLEMENTED_REPORTS } from "@/lib/services/reports";

import { SavedReportsPanel, type SavedReportView } from "./saved-reports";

export const metadata: Metadata = { title: "Reports" };

/**
 * The reports index is generated from the module registry, filtered by licence
 * and permission — so a module that is not licensed contributes no reports.
 */
export default async function ReportsPage() {
  const ctx = await requirePermission("reports.view");

  const available = visibleReports(ctx).filter((r) =>
    IMPLEMENTED_REPORTS.has(r.key),
  );
  const allowedKeys = new Set(available.map((r) => r.key));

  /* Own reports plus anything shared. A saved report whose underlying report the
     user may no longer run is hidden, so a share cannot widen access. */
  const canSchedule =
    hasPermission(ctx, "reports.schedule") &&
    ctx.entitlements.features.has("reports.scheduled");

  const savedRows = await db
    .select()
    .from(savedReports)
    .where(
      and(
        eq(savedReports.tenant_id, ctx.business.id),
        or(
          eq(savedReports.user_id, ctx.user.id),
          eq(savedReports.is_shared, true),
        ),
      ),
    )
    .orderBy(asc(savedReports.name));

  const saved: SavedReportView[] = savedRows
    .filter((r) => allowedKeys.has(r.report_key))
    .map((r) => ({
      id: r.id,
      name: r.name,
      reportKey: r.report_key,
      reportName: REPORT_BY_KEY[r.report_key]?.name ?? r.report_key,
      schedule: r.schedule,
      scheduleHour: r.schedule_hour,
      recipients: r.recipient_user_ids.length,
      nextRunAt: r.next_run_at ? formatDateTime(r.next_run_at) : null,
      lastRunAt: r.last_run_at ? formatDateTime(r.last_run_at) : null,
      isShared: r.is_shared,
    }));

  const grouped = REPORT_GROUPS.map((group) => ({
    ...group,
    reports: available.filter((r) => r.group === group.group),
  })).filter((g) => g.reports.length > 0);

  if (available.length === 0) {
    return (
      <div className="page">
        <PageHeader title="Reports" />
        <EmptyState
          icon="ChartColumn"
          title="No reports available"
          description="Reports appear here based on your enabled modules and permissions. Ask an administrator to review your access."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Reports"
        description={`${available.length} report${available.length === 1 ? "" : "s"} available to you. Reports never modify data and always respect store and module access.`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((group) => (
          <section
            key={group.group}
            className="overflow-hidden rounded-xs border border-border bg-card"
          >
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">{group.label}</h2>
              <p className="text-[11px] text-muted-foreground">
                {group.reports.length} report
                {group.reports.length === 1 ? "" : "s"}
              </p>
            </header>
            <ul className="divide-y divide-border">
              {group.reports.map((report) => {
                const owner = MODULE_BY_SLUG[report.moduleSlug];
                return (
                  <li key={report.key}>
                    <Link
                      href={`/reports/${report.key}`}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <Icon
                        name={owner?.icon}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">
                          {report.name}
                        </span>
                        {report.description ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {report.description}
                          </span>
                        ) : null}
                      </span>
                      {report.feature ? (
                        <Badge variant="soft-neutral">
                          {owner?.name ?? report.moduleSlug}
                        </Badge>
                      ) : null}
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {saved.length > 0 || canSchedule ? (
        <SavedReportsPanel reports={saved} canSchedule={canSchedule} />
      ) : null}
    </div>
  );
}
