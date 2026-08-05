import type { Metadata } from "next";
import { and, asc, eq, sql } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { attendance, shifts } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";

import { deleteShift, saveShift } from "../hr-actions";

export const metadata: Metadata = { title: "Shifts" };

/** Postgres returns `time` as HH:MM:SS; the seconds are never meaningful here. */
function hhmm(value: string): string {
  return value.slice(0, 5);
}

/** "22:00" → "07:00" spans midnight; worth showing plainly. */
function spansMidnight(start: string, end: string): boolean {
  return end <= start;
}

export default async function ShiftsPage() {
  const ctx = await requirePermission("employees.update", {
    feature: "employees.shifts",
  });

  const rows = await db
    .select({
      id: shifts.id,
      name: shifts.name,
      startTime: shifts.start_time,
      endTime: shifts.end_time,
      breakMinutes: shifts.break_minutes,
      graceMinutes: shifts.grace_minutes,
      isActive: shifts.is_active,
      usage: db.$count(attendance, eq(attendance.shift_id, shifts.id)),
    })
    .from(shifts)
    .where(eq(shifts.tenant_id, ctx.business.id))
    .orderBy(asc(shifts.start_time));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      start_time: hhmm(row.startTime),
      end_time: hhmm(row.endTime),
      break_minutes: String(row.breakMinutes),
      grace_minutes: String(row.graceMinutes),
      is_active: row.isActive,
    },
    // A shift already stamped on attendance is history and must not vanish.
    deleteBlockedReason:
      row.usage > 0 ? `Used by ${row.usage} attendance record(s)` : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {spansMidnight(row.startTime, row.endTime) ? (
            <span className="text-[11px] text-muted-foreground">
              overnight
            </span>
          ) : null}
        </span>
      ),
      hours: (
        <span className="font-mono text-xs">
          {hhmm(row.startTime)} – {hhmm(row.endTime)}
        </span>
      ),
      breakMinutes: `${row.breakMinutes} min`,
      graceMinutes: `${row.graceMinutes} min`,
      usage: row.usage,
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  const [busiest] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        sql`${attendance.shift_id} is not null`,
      ),
    );

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="Shifts"
        description="Working patterns used to judge lateness and to net off unpaid breaks when attendance is recorded."
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Shifts" },
        ]}
      />

      <Notice tone="info" title="How a shift affects attendance">
        Checking in later than the start time plus its grace period is marked
        late. Break minutes are subtracted from the hours worked at check-out. An
        employee with no shift is never marked late.
        {Number(busiest?.total ?? 0) > 0
          ? ` ${busiest?.total} attendance record(s) currently reference a shift.`
          : ""}
      </Notice>

      <CrudPanel
        title="Shift patterns"
        description={`${rows.length} shift${rows.length === 1 ? "" : "s"} defined`}
        addLabel="Add shift"
        emptyMessage="No shifts defined. Attendance will still record, but nobody can be marked late."
        columns={[
          { key: "name", label: "Shift" },
          { key: "hours", label: "Hours" },
          { key: "breakMinutes", label: "Break", align: "right" },
          { key: "graceMinutes", label: "Grace", align: "right" },
          { key: "usage", label: "In use", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "name",
            label: "Name",
            placeholder: "Morning",
            required: true,
          },
          {
            name: "start_time",
            label: "Starts",
            placeholder: "09:00",
            required: true,
            hint: "24-hour clock.",
          },
          {
            name: "end_time",
            label: "Ends",
            placeholder: "18:00",
            required: true,
            hint: "Earlier than the start means it runs past midnight.",
          },
          {
            name: "break_minutes",
            label: "Unpaid break (minutes)",
            type: "number",
            defaultValue: "45",
          },
          {
            name: "grace_minutes",
            label: "Grace period (minutes)",
            type: "number",
            defaultValue: "10",
          },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveShift}
        deleteAction={deleteShift}
        canWrite={hasPermission(ctx, "employees.update")}
        canDelete={hasPermission(ctx, "employees.delete")}
      />
    </div>
  );
}
