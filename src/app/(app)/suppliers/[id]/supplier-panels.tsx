"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
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

import { deleteSupplier, paySupplier } from "../actions";

export function SupplierPanels({
  supplierId,
  supplierName,
  outstanding,
  currency,
  canPay,
  canDelete,
}: {
  supplierId: string;
  supplierName: string;
  outstanding: string;
  currency: string;
  canPay: boolean;
  canDelete: boolean;
}) {
  const [payOpen, setPayOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canPay && !canDelete) return null;

  return (
    <>
      {canPay && Number(outstanding) > 0 ? (
        <Button variant="accent" size="sm" onClick={() => setPayOpen(true)}>
          Record payment
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Supplier actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canPay ? (
            <DropdownMenuItem onSelect={() => setPayOpen(true)}>
              Record payment
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Delete supplier
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        supplierId={supplierId}
        outstanding={outstanding}
        currency={currency}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {supplierName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Suppliers with purchase history cannot be deleted — the request will
              be refused so historical orders always resolve. Set the status to
              archived instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteSupplier(supplierId);
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

function PaymentDialog({
  open,
  onClose,
  supplierId,
  outstanding,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  outstanding: string;
  currency: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(paySupplier, {
    ok: true,
  });

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
          <DialogTitle>Record supplier payment</DialogTitle>
          <DialogDescription>
            Payable {formatMoney(outstanding, { currency })}. This posts a credit
            to the supplier&apos;s account ledger.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="supplier_id" value={supplierId} />
          {!state.ok ? <FormError message={state.message} /> : null}

          <FieldRow cols={2}>
            <Field label="Amount" htmlFor="amount" required>
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
            <Field label="Method" htmlFor="method">
              <select
                id="method"
                name="method"
                defaultValue="bank_transfer"
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
              </select>
            </Field>
          </FieldRow>

          <Field label="Reference" htmlFor="reference">
            <Input
              id="reference"
              name="reference"
              placeholder="UTR, cheque number…"
            />
          </Field>

          <Field label="Note" htmlFor="payment_note">
            <Textarea id="payment_note" name="note" rows={2} />
          </Field>

          <SubmitButton variant="accent" size="sm" pendingLabel="Recording…">
            Record payment
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
