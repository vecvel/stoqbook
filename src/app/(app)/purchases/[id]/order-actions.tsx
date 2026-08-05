"use client";

import { useState, useTransition } from "react";
import { Check, MoreHorizontal, X } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

import { decidePurchaseOrder, voidPurchaseOrder } from "../actions";

export function OrderActions({
  orderId,
  status,
  approvalStatus,
  canApprove,
  canCancel,
}: {
  orderId: string;
  status: string;
  approvalStatus: string;
  canApprove: boolean;
  canCancel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const isPending = approvalStatus === "pending";
  // Once goods are received a return is required rather than a cancellation.
  const cancellable =
    canCancel &&
    status !== "cancelled" &&
    status !== "completed" &&
    status !== "partially_received";

  function decide(decision: "approved" | "rejected") {
    startTransition(async () => {
      const result = await decidePurchaseOrder(orderId, decision);
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? "Could not record the decision.");
    });
  }

  if (isPending && canApprove) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => decide("rejected")}
        >
          <X className="size-3.5" />
          Reject
        </Button>
        <Button
          variant="success"
          size="sm"
          disabled={pending}
          onClick={() => decide("approved")}
        >
          <Check className="size-3.5" />
          Approve
        </Button>
      </div>
    );
  }

  if (!cancellable) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Order actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setCancelOpen(true)}
          >
            Cancel order
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel this purchase order?</DialogTitle>
            <DialogDescription>
              Only orders with no goods received can be cancelled. The record is
              retained for audit.
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor="cancel_reason" required>
            <Textarea
              id="cancel_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              autoFocus
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!reason.trim() || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await voidPurchaseOrder(orderId, reason.trim());
                  if (result.ok) {
                    toast.success(result.message ?? "Order cancelled.");
                    setCancelOpen(false);
                  } else {
                    toast.error(result.message ?? "Could not cancel the order.");
                  }
                })
              }
            >
              Cancel order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
