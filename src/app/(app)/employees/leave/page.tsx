import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { FilterBar, SelectFilter } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { leaveRequests, leaveTypes, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate } from "@/lib/format";
import { tzDateKey } from "@/lib/timezone";

import { LeaveDecisionButtons, RequestLeaveForm } from "./leave-panel";

export const metadata: Metadata = { title: "Leave" };

type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export default async function LeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("employees.leave", {
    feature: "employees.leave",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const todayKey = tzDateKey(new Date(), ctx.business.timezone);

  const filters = [eq(leaveRequests.tenant_id, ctx.business.id)];
  if (query.filters.status) {
    filters.push(eq(leaveRequests.status, query.filters.status as LeaveStatus));
  }
  if (query.filters.employee) {
    filters.push(eq(leaveRequests.user_id, query.filters.employee));
  }
  const where = and(...filters);

  const [rows, totalRow, summary, staff, types] = await Promise.all([
    db
      .select({
        id: leaveRequests.id,
        startDate: leaveRequests.start_date,
        endDate: leaveRequests.end_date,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        decidedAt: leaveRequests.decided_at,
        decisionNote: leaveRequests.decision_note,
        userId: leaveRequests.user_id,
        employeeName: users.full_name,
        employeeCode: users.employee_code,
        leaveTypeName: leaveTypes.name,
        isPaid: leaveTypes.is_paid,
      })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.user_id))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leave_type_id))
      .where(where)
      .orderBy(desc(leaveRequests.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(leaveRequests).where(where),

    db
      .select({
        pending: sql<number>`count(*) filter (where ${leaveRequests.status} = 'pending')::int`,
        approved: sql<number>`count(*) filter (where ${leaveRequests.status} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${leaveRequests.status} = 'rejected')::int`,
        daysApproved: sql<string>`coalesce(sum(${leaveRequests.days})
          filter (where ${leaveRequests.status} = 'approved'), 0)`,
      })
      .from(leaveRequests)
      .where(eq(leaveRequests.tenant_id, ctx.business.id)),

    db
      .select({ id: users.id, name: users.full_name })
      .from(users)
      .where(
        and(
          eq(users.tenant_id, ctx.business.id),
          eq(users.status, "active"),
          isNull(users.deleted_at),
        ),
      )
      .orderBy(asc(users.full_name)),

    db
      .select({ id: leaveTypes.id, name: leaveTypes.name })
      .from(leaveTypes)
      .where(
        and(
          eq(leaveTypes.tenant_id, ctx.business.id),
          eq(leaveTypes.is_active, true),
        ),
      )
      .orderBy(asc(leaveTypes.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = summary[0];
  // Deciding on leave and requesting it are both employees.leave today; the
  // distinction that matters is whether the row belongs to the current user.
  const canDecide = hasPermission(ctx, "employees.leave");

  return (
    <div className="page">
      <PageHeader
        title="Leave"
        description="Requests flow employee → manager → attendance. Approving one marks every day it covers as leave."
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Leave" },
        ]}
        actions={
          <Link
            href="/employees/attendance"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Attendance register
          </Link>
        }
      />

      <StatGrid>
        <StatTile
          label="Awaiting approval"
          value={String(stats?.pending ?? 0)}
          tone={(stats?.pending ?? 0) > 0 ? "warning" : "neutral"}
          icon="ClipboardList"
        />
        <StatTile
          label="Approved"
          value={String(stats?.approved ?? 0)}
          tone="success"
          icon="CircleCheck"
        />
        <StatTile
          label="Rejected"
          value={String(stats?.rejected ?? 0)}
          icon="CircleX"
        />
        <StatTile
          label="Days granted"
          value={String(Number(stats?.daysApproved ?? 0))}
          icon="CalendarDays"
        />
      </StatGrid>

      <FilterBar>
        <SelectFilter
          paramName="employee"
          label="Employee"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Employee</TH>
            <TH>Type</TH>
            <TH>Dates</TH>
            <TH align="right">Days</TH>
            <TH>Reason</TH>
            <TH align="right">Status</TH>
            <TH align="right" />
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>
                No leave requests. Submit one below.
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link
                      href={`/employees/${row.userId}`}
                      className="font-medium hover:text-accent hover:underline"
                    >
                      {row.employeeName}
                    </Link>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {row.employeeCode}
                    </div>
                  </TD>
                  <TD>
                    {row.leaveTypeName}
                    <div className="text-[11px] text-muted-foreground">
                      {row.isPaid ? "Paid" : "Unpaid"}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDate(row.startDate)}
                    {" → "}
                    {formatDate(row.endDate)}
                  </TD>
                  <TD align="right" className="tabular">
                    {Number(row.days)}
                  </TD>
                  <TD className="max-w-[220px] truncate text-muted-foreground">
                    {row.reason ?? "—"}
                    {row.decisionNote ? (
                      <div className="truncate text-[11px]">
                        Decision: {row.decisionNote}
                      </div>
                    ) : null}
                  </TD>
                  <TD align="right">
                    {row.status === "approved" ? (
                      <Badge variant="soft-success">Approved</Badge>
                    ) : (
                      <StatusBadge status={row.status} />
                    )}
                  </TD>
                  <TD align="right">
                    {row.status === "pending" ? (
                      <LeaveDecisionButtons
                        leaveRequestId={row.id}
                        employeeName={row.employeeName}
                        canDecide={canDecide && row.userId !== ctx.user.id}
                        canWithdraw={row.userId === ctx.user.id}
                      />
                    ) : null}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        <Pagination
          page={query.page}
          limit={query.limit}
          total={total}
          baseParams={{
            status: query.filters.status,
            employee: query.filters.employee,
          }}
        />
      </TableShell>

      <RequestLeaveForm
        employees={staff}
        leaveTypes={types}
        canRequestForOthers={canDecide}
        today={todayKey}
      />
    </div>
  );
}
