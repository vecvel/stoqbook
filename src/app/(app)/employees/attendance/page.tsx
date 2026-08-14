import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, gte, isNull, sql } from "drizzle-orm";

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
import { db } from "@/db";
import { attendance, stores, shifts, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatTime } from "@/lib/format";
import { tzDateKey } from "@/lib/timezone";

import { ClockPanel, RecordAttendanceForm } from "./attendance-panel";

export const metadata: Metadata = { title: "Attendance" };

type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "leave"
  | "holiday";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("employees.attendance", {
    feature: "employees.attendance",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const todayKey = tzDateKey(new Date(), ctx.business.timezone);
  const today = new Date(`${todayKey}T00:00:00.000Z`);
  const monthStart = new Date(`${todayKey.slice(0, 7)}-01T00:00:00.000Z`);

  const filters = [eq(attendance.tenant_id, ctx.business.id)];
  if (query.filters.status) {
    filters.push(eq(attendance.status, query.filters.status as AttendanceStatus));
  }
  if (query.filters.employee) {
    filters.push(eq(attendance.user_id, query.filters.employee));
  }
  const where = and(...filters);

  const [rows, totalRow, todayStats, staff, shiftRows, mine] = await Promise.all([
    db
      .select({
        id: attendance.id,
        workDate: attendance.work_date,
        checkIn: attendance.check_in,
        checkOut: attendance.check_out,
        workedMinutes: attendance.worked_minutes,
        status: attendance.status,
        note: attendance.note,
        userId: attendance.user_id,
        employeeName: users.full_name,
        employeeCode: users.employee_code,
        shiftName: shifts.name,
        storeName: stores.name,
      })
      .from(attendance)
      .innerJoin(users, eq(users.id, attendance.user_id))
      .leftJoin(shifts, eq(shifts.id, attendance.shift_id))
      .leftJoin(stores, eq(stores.id, attendance.store_id))
      .where(where)
      .orderBy(desc(attendance.work_date), asc(users.full_name))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(attendance).where(where),

    db
      .select({
        present: sql<number>`count(*) filter (where ${attendance.status} in ('present','late','half_day'))::int`,
        absent: sql<number>`count(*) filter (where ${attendance.status} = 'absent')::int`,
        late: sql<number>`count(*) filter (where ${attendance.status} = 'late')::int`,
        onLeave: sql<number>`count(*) filter (where ${attendance.status} = 'leave')::int`,
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.tenant_id, ctx.business.id),
          eq(attendance.work_date, today),
        ),
      ),

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
      .select({ id: shifts.id, name: shifts.name })
      .from(shifts)
      .where(
        and(eq(shifts.tenant_id, ctx.business.id), eq(shifts.is_active, true)),
      )
      .orderBy(asc(shifts.name)),

    db
      .select({ checkIn: attendance.check_in, checkOut: attendance.check_out })
      .from(attendance)
      .where(
        and(
          eq(attendance.tenant_id, ctx.business.id),
          eq(attendance.user_id, ctx.user.id),
          eq(attendance.work_date, today),
        ),
      )
      .limit(1),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = todayStats[0];
  const canRecord = hasPermission(ctx, "employees.attendance");
  const myRow = mine[0];

  /* Month-to-date hours, so the register is useful without a payroll module. */
  const [monthTotals] = await db
    .select({
      hours: sql<string>`coalesce(round(sum(${attendance.worked_minutes})::numeric / 60, 2), 0)`,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        gte(attendance.work_date, monthStart),
      ),
    );

  return (
    <div className="page">
      <PageHeader
        title="Attendance"
        description="The daily register. Days are cut in the business time zone, so a late shift still belongs to the day it started."
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Attendance" },
        ]}
        actions={
          <Link
            href="/employees/leave"
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Leave requests
          </Link>
        }
      />

      <StatGrid>
        <StatTile
          label="Present today"
          value={String(stats?.present ?? 0)}
          sublabel={`of ${staff.length} active`}
          tone="success"
          icon="UserCheck"
        />
        <StatTile
          label="Absent"
          value={String(stats?.absent ?? 0)}
          tone={(stats?.absent ?? 0) > 0 ? "danger" : "neutral"}
          icon="UserX"
        />
        <StatTile
          label="Late"
          value={String(stats?.late ?? 0)}
          tone={(stats?.late ?? 0) > 0 ? "warning" : "neutral"}
          icon="Clock"
        />
        <StatTile
          label="On leave"
          value={String(stats?.onLeave ?? 0)}
          icon="Plane"
          href="/employees/leave"
        />
        <StatTile
          label="Hours this month"
          value={monthTotals?.hours ?? "0"}
          sublabel="All employees"
          icon="Hourglass"
        />
      </StatGrid>

      <ClockPanel
        shifts={shiftRows}
        checkedIn={Boolean(myRow?.checkIn)}
        checkedOut={Boolean(myRow?.checkOut)}
      />

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
            { value: "present", label: "Present" },
            { value: "absent", label: "Absent" },
            { value: "late", label: "Late" },
            { value: "half_day", label: "Half day" },
            { value: "leave", label: "Leave" },
            { value: "holiday", label: "Holiday" },
          ]}
        />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Date</TH>
            <TH>Employee</TH>
            <TH>Shift</TH>
            <TH>In</TH>
            <TH>Out</TH>
            <TH align="right">Hours</TH>
            <TH align="right">Status</TH>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>
                Nothing recorded yet. Check in above, or record a day below.
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap">
                    {formatDate(row.workDate)}
                  </TD>
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
                  <TD className="text-muted-foreground">
                    {row.shiftName ?? "—"}
                    {row.storeName ? (
                      <div className="text-[11px]">{row.storeName}</div>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">
                    {row.checkIn ? formatTime(row.checkIn) : "—"}
                  </TD>
                  <TD className="text-muted-foreground">
                    {row.checkOut ? formatTime(row.checkOut) : "—"}
                  </TD>
                  <TD align="right" className="tabular">
                    {row.workedMinutes > 0
                      ? (row.workedMinutes / 60).toFixed(2)
                      : "—"}
                  </TD>
                  <TD align="right">
                    <StatusBadge status={row.status} />
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

      {canRecord ? (
        <RecordAttendanceForm employees={staff} today={todayKey} />
      ) : null}
    </div>
  );
}
