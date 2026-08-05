"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { attendance, shifts } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { auditEvent } from "@/lib/services/audit";
import {
  cancelLeave,
  checkIn,
  checkOut,
  decideLeave,
  markAttendance,
  requestLeave,
  type AttendanceStatus,
} from "@/lib/services/hr";
import {
  bool,
  failure,
  num,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export async function clockIn(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.attendance", {
      feature: "employees.attendance",
    });

    // Blank means "me", so an employee can clock themselves in without holding
    // the permission to record attendance for anyone else.
    const userId = uuid(form, "user_id") ?? ctx.user.id;
    const result = await checkIn(ctx, {
      userId,
      shiftId: uuid(form, "shift_id"),
      note: optionalStr(form, "note") ?? undefined,
    });

    revalidate("/employees/attendance", "/dashboard");
    return success(
      undefined,
      result.status === "late" ? "Checked in — marked late." : "Checked in.",
    );
  });
}

export async function clockOut(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.attendance", {
      feature: "employees.attendance",
    });

    const userId = uuid(form, "user_id") ?? ctx.user.id;
    const result = await checkOut(ctx, { userId });

    revalidate("/employees/attendance", "/dashboard");
    return success(
      undefined,
      `Checked out after ${(result.workedMinutes / 60).toFixed(2)} hours.`,
    );
  });
}

export async function setAttendance(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.attendance", {
      feature: "employees.attendance",
    });

    const userId = uuid(form, "user_id");
    if (!userId) return failure("Select an employee.");

    const dateRaw = str(form, "work_date");
    if (!dateRaw) return failure("Select a date.");

    await markAttendance(ctx, {
      userId,
      date: new Date(dateRaw),
      status: (str(form, "status") || "present") as AttendanceStatus,
      workedMinutes: Math.round(num(form, "worked_hours", 0) * 60),
      note: optionalStr(form, "note") ?? undefined,
    });

    revalidate("/employees/attendance");
    return success(undefined, "Attendance recorded.");
  });
}

/* -------------------------------------------------------------------------- */
/* Leave                                                                      */
/* -------------------------------------------------------------------------- */

export async function submitLeaveRequest(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.leave", {
      feature: "employees.leave",
    });

    const userId = uuid(form, "user_id") ?? ctx.user.id;
    const leaveTypeId = uuid(form, "leave_type_id");
    if (!leaveTypeId) return failure("Select a leave type.");

    const startRaw = str(form, "start_date");
    const endRaw = str(form, "end_date");
    if (!startRaw || !endRaw) return failure("Select both dates.");

    const result = await requestLeave(ctx, {
      userId,
      leaveTypeId,
      startDate: new Date(startRaw),
      endDate: new Date(endRaw),
      reason: optionalStr(form, "reason") ?? undefined,
    });

    revalidate("/employees/leave", "/notifications");
    return success(
      undefined,
      `Leave requested for ${result.days} day(s). Awaiting approval.`,
    );
  });
}

export async function decideLeaveRequest(
  leaveRequestId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.leave", {
      feature: "employees.leave",
    });

    await decideLeave(ctx, { leaveRequestId, decision, note });

    revalidate("/employees/leave", "/employees/attendance");
    return success(
      undefined,
      decision === "approved"
        ? "Leave approved — the attendance register has been updated."
        : "Leave rejected.",
    );
  });
}

export async function withdrawLeaveRequest(
  leaveRequestId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.leave", {
      feature: "employees.leave",
    });
    await cancelLeave(ctx, leaveRequestId);
    revalidate("/employees/leave");
    return success(undefined, "Leave request cancelled.");
  });
}

/* -------------------------------------------------------------------------- */
/* Shifts                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Normalises to HH:MM. Accepts "9:00", "09:00" and "09:00:00" — the last
 * because Postgres returns `time` values with seconds, so an edit form
 * round-trips that format straight back to us.
 */
function normaliseTime(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export async function saveShift(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.update", {
      feature: "employees.shifts",
    });

    const name = str(form, "name").trim();
    if (!name) return failure("Name is required.", { name: ["Required."] });

    const startTime = normaliseTime(str(form, "start_time"));
    const endTime = normaliseTime(str(form, "end_time"));
    if (!startTime) {
      return failure("Enter a start time as HH:MM.", {
        start_time: ["Use 24-hour HH:MM."],
      });
    }
    if (!endTime) {
      return failure("Enter an end time as HH:MM.", {
        end_time: ["Use 24-hour HH:MM."],
      });
    }

    const values = {
      name,
      start_time: startTime,
      end_time: endTime,
      break_minutes: Math.max(0, num(form, "break_minutes", 0)),
      grace_minutes: Math.max(0, num(form, "grace_minutes", 0)),
      is_active: bool(form, "is_active"),
    };

    const id = uuid(form, "id");
    if (id) {
      await db
        .update(shifts)
        .set({ ...values, updated_at: new Date() })
        .where(and(eq(shifts.id, id), eq(shifts.tenant_id, ctx.business.id)));
    } else {
      await db.insert(shifts).values({ ...values, tenant_id: ctx.business.id });
    }

    await auditEvent(ctx, {
      event: "ShiftUpdated",
      moduleSlug: "employees",
      entityType: "shift",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} shift ${name} (${startTime}–${endTime})`,
    });

    revalidate("/employees/shifts", "/employees/attendance");
    return success(undefined, "Shift saved.");
  });
}

export async function deleteShift(shiftId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.delete", {
      feature: "employees.shifts",
    });

    // Attendance rows point at the shift; removing it would orphan history.
    const used = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(eq(attendance.shift_id, shiftId))
      .limit(1);

    if (used.length > 0) {
      return failure(
        "This shift is referenced by attendance records. Deactivate it instead.",
      );
    }

    await db
      .delete(shifts)
      .where(and(eq(shifts.id, shiftId), eq(shifts.tenant_id, ctx.business.id)));

    await auditEvent(ctx, {
      event: "ShiftUpdated",
      moduleSlug: "employees",
      entityType: "shift",
      entityId: shiftId,
      summary: "Shift deleted",
    });

    revalidate("/employees/shifts");
    return success(undefined, "Shift deleted.");
  });
}
