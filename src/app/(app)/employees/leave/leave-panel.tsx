"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import {
  decideLeaveRequest,
  submitLeaveRequest,
  withdrawLeaveRequest,
} from "../hr-actions";

export interface LeaveOption {
  id: string;
  name: string;
}

export function RequestLeaveForm({
  employees,
  leaveTypes,
  canRequestForOthers,
  today,
}: {
  employees: LeaveOption[];
  leaveTypes: LeaveOption[];
  canRequestForOthers: boolean;
  today: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    submitLeaveRequest,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  if (leaveTypes.length === 0) {
    return (
      <p className="rounded-xs border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        No leave types are configured yet, so leave cannot be requested. Add them
        under Settings first.
      </p>
    );
  }

  return (
    <form action={action}>
      <FormSection
        title="Request leave"
        description="An approved request writes leave onto the attendance register for every day it covers."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={4}>
          {canRequestForOthers ? (
            <Field label="Employee" htmlFor="user_id" hint="Blank means you.">
              <select
                id="user_id"
                name="user_id"
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option value="">Myself</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Leave type" htmlFor="leave_type_id" required>
            <select
              id="leave_type_id"
              name="leave_type_id"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              required
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From" htmlFor="start_date" required>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              defaultValue={today}
              required
            />
          </Field>
          <Field label="To" htmlFor="end_date" required>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              defaultValue={today}
              required
            />
          </Field>
        </FieldRow>

        <Field label="Reason" htmlFor="reason">
          <Textarea id="reason" name="reason" rows={2} placeholder="Optional" />
        </Field>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Submitting…">
            Submit request
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}

export function LeaveDecisionButtons({
  leaveRequestId,
  employeeName,
  canDecide,
  canWithdraw,
}: {
  leaveRequestId: string;
  employeeName: string;
  canDecide: boolean;
  canWithdraw: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  function decide(decision: "approved" | "rejected", withNote?: string) {
    startTransition(async () => {
      const result = await decideLeaveRequest(leaveRequestId, decision, withNote);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setRejectOpen(false);
        setNote("");
      } else {
        toast.error(result.message ?? "Could not record the decision.");
      }
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawLeaveRequest(leaveRequestId);
      if (result.ok) toast.success(result.message ?? "Cancelled.");
      else toast.error(result.message ?? "Could not cancel the request.");
    });
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        {canDecide ? (
          <>
            <Button
              variant="success"
              size="xs"
              disabled={pending}
              onClick={() => decide("approved")}
            >
              Approve
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={pending}
              onClick={() => setRejectOpen(true)}
            >
              Reject
            </Button>
          </>
        ) : canWithdraw ? (
          <Button
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={withdraw}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject {employeeName}&apos;s leave?</DialogTitle>
            <DialogDescription>
              The reason is recorded against the request and shown to the
              employee.
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor="decision_note">
            <Textarea
              id="decision_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Peak trading week — please re-request for later."
              autoFocus
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={() => decide("rejected", note.trim() || undefined)}
            >
              Reject request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
