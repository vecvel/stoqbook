"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import { decideExpense } from "./actions";

export function ExpenseApprovalButtons({
  expenseId,
  expenseNumber,
  ownedByMe,
}: {
  expenseId: string;
  expenseNumber: string;
  ownedByMe: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  // Self-approval is refused by the action; saying so up front is kinder than
  // letting the click fail.
  if (ownedByMe) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Awaiting someone else
      </span>
    );
  }

  function decide(decision: "approved" | "rejected", withReason?: string) {
    startTransition(async () => {
      const result = await decideExpense(expenseId, decision, withReason);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setRejectOpen(false);
        setReason("");
      } else {
        toast.error(result.message ?? "Could not record the decision.");
      }
    });
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
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
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reject {expenseNumber}?</DialogTitle>
            <DialogDescription>
              The reason is stored against the expense and shown to whoever
              recorded it.
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor="expense_reject_reason" required>
            <Textarea
              id="expense_reject_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="No receipt attached — please resubmit with one."
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
              disabled={!reason.trim() || pending}
              onClick={() => decide("rejected", reason.trim())}
            >
              Reject expense
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
