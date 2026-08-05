import "server-only";

import { and, eq, gte, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import { attendance, leaveRequests, leaveTypes, shifts, users } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authz/errors";
import { tzDateKey } from "@/lib/timezone";

import { auditEvent } from "./audit";
import { emit } from "./notifications";

/**
 * Attendance and leave (13-employees.md).
 *
 * The day columns are `timestamp without time zone`, holding midnight of the
 * business day. Keying on the business day rather than a UTC date means a shift
 * that ends after midnight still belongs to the day it started in the
 * business's own zone.
 */

export type AttendanceStatus =
  | "present"
  | "absent"
  | "late"
  | "half_day"
  | "leave"
  | "holiday";

/** Midnight of the business day containing `date`, as a naive timestamp. */
function businessDay(date: Date, timeZone: string): Date {
  return new Date(`${tzDateKey(date, timeZone)}T00:00:00.000Z`);
}

function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface CheckInInput {
  userId: string;
  /** Defaults to now. */
  at?: Date;
  shiftId?: string | null;
  note?: string;
}

export async function checkIn(
  ctx: BusinessContext,
  input: CheckInInput,
): Promise<{ attendanceId: string; status: AttendanceStatus }> {
  const at = input.at ?? new Date();
  const workDate = businessDay(at, ctx.business.timezone);

  const [existing] = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        eq(attendance.user_id, input.userId),
        eq(attendance.work_date, workDate),
      ),
    )
    .limit(1);

  if (existing?.check_in) {
    throw ConflictError("This employee has already checked in today.");
  }

  /* Lateness is judged against the assigned shift, allowing its grace period. */
  let status: AttendanceStatus = "present";
  if (input.shiftId) {
    const [shift] = await db
      .select()
      .from(shifts)
      .where(
        and(eq(shifts.id, input.shiftId), eq(shifts.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (shift) {
      const [h, m] = shift.start_time.split(":").map(Number);
      const expected = new Date(at);
      expected.setHours(h ?? 0, (m ?? 0) + (shift.grace_minutes ?? 0), 0, 0);
      if (at > expected) status = "late";
    }
  }

  const values = {
    tenant_id: ctx.business.id,
    user_id: input.userId,
    branch_id: ctx.activeStore?.id ?? null,
    shift_id: input.shiftId ?? null,
    work_date: workDate,
    check_in: at,
    status,
    note: input.note ?? null,
  };

  let attendanceId: string;
  if (existing) {
    const [updated] = await db
      .update(attendance)
      .set({ ...values, updated_at: new Date() })
      .where(eq(attendance.id, existing.id))
      .returning();
    attendanceId = updated.id;
  } else {
    const [created] = await db.insert(attendance).values(values).returning();
    attendanceId = created.id;
  }

  await auditEvent(ctx, {
    event: "AttendanceCheckedIn",
    moduleSlug: "employees",
    entityType: "attendance",
    entityId: attendanceId,
    summary: `Checked in for ${dayLabel(workDate)}${status === "late" ? " (late)" : ""}`,
  });

  return { attendanceId, status };
}

export async function checkOut(
  ctx: BusinessContext,
  input: { userId: string; at?: Date },
): Promise<{ workedMinutes: number }> {
  const at = input.at ?? new Date();
  const workDate = businessDay(at, ctx.business.timezone);

  const [row] = await db
    .select()
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        eq(attendance.user_id, input.userId),
        eq(attendance.work_date, workDate),
      ),
    )
    .limit(1);

  if (!row?.check_in) {
    throw ValidationError("There is no check-in recorded for today.");
  }
  if (row.check_out) throw ConflictError("Already checked out today.");

  const grossMinutes = Math.max(
    0,
    Math.round((at.getTime() - row.check_in.getTime()) / 60_000),
  );

  // Unpaid break time is excluded from worked minutes.
  let breakMinutes = 0;
  if (row.shift_id) {
    const [shift] = await db
      .select({ breakMinutes: shifts.break_minutes })
      .from(shifts)
      .where(eq(shifts.id, row.shift_id))
      .limit(1);
    breakMinutes = shift?.breakMinutes ?? 0;
  }
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  await db
    .update(attendance)
    .set({ check_out: at, worked_minutes: workedMinutes, updated_at: new Date() })
    .where(eq(attendance.id, row.id));

  await auditEvent(ctx, {
    event: "AttendanceCheckedOut",
    moduleSlug: "employees",
    entityType: "attendance",
    entityId: row.id,
    summary: `Checked out after ${(workedMinutes / 60).toFixed(2)} h`,
  });

  return { workedMinutes };
}

/** Records or corrects a day's attendance directly, for a manager. */
export async function markAttendance(
  ctx: BusinessContext,
  input: {
    userId: string;
    date: Date;
    status: AttendanceStatus;
    workedMinutes?: number;
    note?: string;
  },
): Promise<void> {
  const workDate = businessDay(input.date, ctx.business.timezone);

  const [existing] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        eq(attendance.user_id, input.userId),
        eq(attendance.work_date, workDate),
      ),
    )
    .limit(1);

  const values = {
    tenant_id: ctx.business.id,
    user_id: input.userId,
    branch_id: ctx.activeStore?.id ?? null,
    work_date: workDate,
    status: input.status,
    worked_minutes: input.workedMinutes ?? 0,
    note: input.note ?? null,
  };

  if (existing) {
    await db
      .update(attendance)
      .set({ ...values, updated_at: new Date() })
      .where(eq(attendance.id, existing.id));
  } else {
    await db.insert(attendance).values(values);
  }

  await auditEvent(ctx, {
    event: "AttendanceMarked",
    moduleSlug: "employees",
    entityType: "attendance",
    summary: `${dayLabel(workDate)} marked ${input.status}`,
    payload: { user_id: input.userId, status: input.status },
  });
}

/* -------------------------------------------------------------------------- */
/* Leave                                                                      */
/* -------------------------------------------------------------------------- */

export interface RequestLeaveInput {
  userId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export async function requestLeave(
  ctx: BusinessContext,
  input: RequestLeaveInput,
): Promise<{ leaveRequestId: string; days: number }> {
  const start = businessDay(input.startDate, ctx.business.timezone);
  const end = businessDay(input.endDate, ctx.business.timezone);

  if (end < start) {
    throw ValidationError("The end date cannot be before the start date.");
  }

  const [type] = await db
    .select()
    .from(leaveTypes)
    .where(
      and(
        eq(leaveTypes.id, input.leaveTypeId),
        eq(leaveTypes.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);
  if (!type) throw NotFoundError("Leave type not found.");

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  // An overlapping request that is still live would double-count the quota.
  const overlapping = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.tenant_id, ctx.business.id),
        eq(leaveRequests.user_id, input.userId),
        ne(leaveRequests.status, "rejected"),
        ne(leaveRequests.status, "cancelled"),
        lte(leaveRequests.start_date, end),
        gte(leaveRequests.end_date, start),
      ),
    )
    .limit(1);

  if (overlapping.length > 0) {
    throw ConflictError(
      "This employee already has a leave request covering those dates.",
    );
  }

  const [created] = await db
    .insert(leaveRequests)
    .values({
      tenant_id: ctx.business.id,
      user_id: input.userId,
      leave_type_id: input.leaveTypeId,
      start_date: start,
      end_date: end,
      days: String(days),
      reason: input.reason ?? null,
      status: "pending",
    })
    .returning();

  const [employee] = await db
    .select({ name: users.full_name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  await emit({
    businessId: ctx.business.id,
    event: "LeaveRequested",
    moduleSlug: "employees",
    priority: "medium",
    title: "Leave request awaiting approval",
    body: `${employee?.name ?? "An employee"} requested ${days} day(s) of ${type.name}.`,
    actionUrl: "/employees/leave",
    fallbackPermission: "employees.leave",
    payload: { leave_request_id: created.id },
    // Named so a template can reword this without touching code.
    variables: {
      employee: employee?.name ?? "An employee",
      days,
      type: type.name,
      from: dayLabel(start),
      to: dayLabel(end),
    },
  });

  await auditEvent(ctx, {
    event: "LeaveRequested",
    moduleSlug: "employees",
    entityType: "leave_request",
    entityId: created.id,
    summary: `${days} day(s) of ${type.name} requested`,
  });

  return { leaveRequestId: created.id, days };
}

/**
 * Approves or rejects a leave request.
 *
 * Approval writes `leave` onto every attendance day it covers, so the
 * attendance register and the leave register can never disagree.
 */
export async function decideLeave(
  ctx: BusinessContext,
  input: {
    leaveRequestId: string;
    decision: "approved" | "rejected";
    note?: string;
  },
): Promise<void> {
  const [request] = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.id, input.leaveRequestId),
        eq(leaveRequests.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);
  if (!request) throw NotFoundError("Leave request not found.");
  if (request.status !== "pending") {
    throw ConflictError(`This request has already been ${request.status}.`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({
        status: input.decision,
        decided_by: ctx.user.id,
        decided_at: new Date(),
        decision_note: input.note ?? null,
        updated_at: new Date(),
      })
      .where(eq(leaveRequests.id, request.id));

    if (input.decision !== "approved") return;

    for (
      let day = new Date(request.start_date);
      day <= request.end_date;
      day = new Date(day.getTime() + 86_400_000)
    ) {
      const [existing] = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(
            eq(attendance.tenant_id, ctx.business.id),
            eq(attendance.user_id, request.user_id),
            eq(attendance.work_date, day),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(attendance)
          .set({ status: "leave", updated_at: new Date() })
          .where(eq(attendance.id, existing.id));
      } else {
        await tx.insert(attendance).values({
          tenant_id: ctx.business.id,
          user_id: request.user_id,
          work_date: day,
          status: "leave",
          worked_minutes: 0,
        });
      }
    }
  });

  await auditEvent(ctx, {
    event: input.decision === "approved" ? "LeaveApproved" : "LeaveRejected",
    moduleSlug: "employees",
    entityType: "leave_request",
    entityId: request.id,
    summary: `Leave request ${input.decision}`,
    payload: { note: input.note ?? null },
  });
}

export async function cancelLeave(
  ctx: BusinessContext,
  leaveRequestId: string,
): Promise<void> {
  const [request] = await db
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.id, leaveRequestId),
        eq(leaveRequests.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);
  if (!request) throw NotFoundError("Leave request not found.");
  if (request.status === "approved") {
    throw ConflictError(
      "Approved leave cannot be cancelled here — reject it instead, so the attendance register is corrected too.",
    );
  }

  await db
    .update(leaveRequests)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(eq(leaveRequests.id, leaveRequestId));

  await auditEvent(ctx, {
    event: "LeaveCancelled",
    moduleSlug: "employees",
    entityType: "leave_request",
    entityId: leaveRequestId,
    summary: "Leave request cancelled",
  });
}
