"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

import {
  adjustLoyaltyPoints,
  deleteCustomer,
  recordCustomerReceipt,
} from "../actions";

export function CustomerPanels({
  customerId,
  customerName,
  outstanding,
  loyaltyPoints,
  currency,
  canRecordReceipt,
  canAdjustLoyalty,
  canDelete,
}: {
  customerId: string;
  customerName: string;
  outstanding: string;
  loyaltyPoints: string;
  currency: string;
  canRecordReceipt: boolean;
  canAdjustLoyalty: boolean;
  canDelete: boolean;
}) {
  const [dialog, setDialog] = useState<"receipt" | "loyalty" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canRecordReceipt && !canAdjustLoyalty && !canDelete) return null;

  return (
    <>
      {canRecordReceipt && Number(outstanding) > 0 ? (
        <Button variant="accent" size="sm" onClick={() => setDialog("receipt")}>
          Record receipt
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Customer actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canRecordReceipt ? (
            <DropdownMenuItem onSelect={() => setDialog("receipt")}>
              Record receipt
            </DropdownMenuItem>
          ) : null}
          {canAdjustLoyalty ? (
            <DropdownMenuItem onSelect={() => setDialog("loyalty")}>
              Adjust loyalty points
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Delete customer
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReceiptDialog
        open={dialog === "receipt"}
        onClose={() => setDialog(null)}
        customerId={customerId}
        outstanding={outstanding}
        currency={currency}
      />

      <LoyaltyDialog
        open={dialog === "loyalty"}
        onClose={() => setDialog(null)}
        customerId={customerId}
        balance={loyaltyPoints}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {customerName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Customers with sales history cannot be deleted — the request will be
              refused so historical invoices always resolve. Set the status to
              archived to hide them from lists instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteCustomer(customerId);
                  if (!result.ok) {
                    toast.error(result.message ?? "Could not delete.");
                  }
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReceiptDialog({
  open,
  onClose,
  customerId,
  outstanding,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  outstanding: string;
  currency: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    recordCustomerReceipt,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record receipt</DialogTitle>
          <DialogDescription>
            Outstanding {formatMoney(outstanding, { currency })}. This posts a
            credit to the customer&apos;s account ledger.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="customer_id" value={customerId} />
          {!state.ok ? <FormError message={state.message} /> : null}

          <Field label="Amount received" htmlFor="amount" required>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={Number(outstanding).toFixed(2)}
              autoFocus
              className="text-right"
              required
            />
          </Field>

          <Field label="Note" htmlFor="receipt_note">
            <Textarea
              id="receipt_note"
              name="note"
              rows={2}
              placeholder="Cheque number, transfer reference, etc."
            />
          </Field>

          <SubmitButton variant="accent" size="sm" pendingLabel="Recording…">
            Record receipt
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoyaltyDialog({
  open,
  onClose,
  customerId,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  balance: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    adjustLoyaltyPoints,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust loyalty points</DialogTitle>
          <DialogDescription>
            Current balance {Number(balance)} points. Use a negative number to
            deduct.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="customer_id" value={customerId} />
          {!state.ok ? <FormError message={state.message} /> : null}

          <Field label="Points" htmlFor="points" required>
            <Input
              id="points"
              name="points"
              type="number"
              step="1"
              placeholder="e.g. 100 or -50"
              autoFocus
              className="text-right"
              required
            />
          </Field>

          <Field label="Reason" htmlFor="loyalty_note">
            <Textarea id="loyalty_note" name="note" rows={2} />
          </Field>

          <SubmitButton variant="accent" size="sm" pendingLabel="Adjusting…">
            Adjust balance
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
