"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import { clockIn, clockOut, setAttendance } from "../hr-actions";

export interface AttendanceOption {
  id: string;
  name: string;
}

/** Clock in / clock out for the signed-in user. */
export function ClockPanel({
  shifts,
  checkedIn,
  checkedOut,
}: {
  shifts: AttendanceOption[];
  checkedIn: boolean;
  checkedOut: boolean;
}) {
  const [inState, inAction] = useActionState<ActionResult, FormData>(clockIn, {
    ok: true,
  });
  const [outState, outAction] = useActionState<ActionResult, FormData>(clockOut, {
    ok: true,
  });

  useEffect(() => {
    if (inState.ok && inState.message) toast.success(inState.message);
    if (!inState.ok) toast.error(inState.message ?? "Could not check in.");
  }, [inState]);

  useEffect(() => {
    if (outState.ok && outState.message) toast.success(outState.message);
    if (!outState.ok) toast.error(outState.message ?? "Could not check out.");
  }, [outState]);

  return (
    <div className="rounded-xs border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Your day</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {checkedOut
              ? "You have checked out for today."
              : checkedIn
                ? "You are checked in."
                : "You have not checked in yet."}
          </p>
        </div>

        {!checkedIn ? (
          <form action={inAction} className="flex items-end gap-2">
            {shifts.length > 0 ? (
              <Field label="Shift" htmlFor="shift_id">
                <select
                  id="shift_id"
                  name="shift_id"
                  className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
                >
                  <option value="">No shift</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <SubmitButton variant="accent" size="sm" pendingLabel="Checking in…">
              Check in
            </SubmitButton>
          </form>
        ) : !checkedOut ? (
          <form action={outAction}>
            <SubmitButton variant="outline" size="sm" pendingLabel="Checking out…">
              Check out
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}

/** Manager correction: set any employee's status for a given day. */
export function RecordAttendanceForm({
  employees,
  today,
}: {
  employees: AttendanceOption[];
  today: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setAttendance,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <FormSection
        title="Record attendance"
        description="Correct or backfill a day. Approved leave is written automatically and does not need recording here."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={4}>
          <Field label="Employee" htmlFor="user_id" required>
            <select
              id="user_id"
              name="user_id"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              required
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="work_date" required>
            <Input
              id="work_date"
              name="work_date"
              type="date"
              defaultValue={today}
              max={today}
              required
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue="present"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="half_day">Half day</option>
              <option value="leave">Leave</option>
              <option value="holiday">Holiday</option>
            </select>
          </Field>
          <Field label="Hours worked" htmlFor="worked_hours">
            <Input
              id="worked_hours"
              name="worked_hours"
              type="number"
              step="0.25"
              min="0"
              max="24"
              placeholder="0"
              className="text-right"
            />
          </Field>
        </FieldRow>

        <Field label="Note" htmlFor="note">
          <Textarea id="note" name="note" rows={2} placeholder="Optional" />
        </Field>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
            Record attendance
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}
