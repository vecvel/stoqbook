"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

import { addPayment, submitReturn, voidSale } from "../actions";

export interface ReturnableItem {
  id: string;
  name: string;
  sku: string;
  quantity: string;
  returned: string;
  unitPrice: string;
}

/**
 * Invoice actions menu.
 *
 * Takes no `status`: the caller already folds invoice state into each `can*`
 * flag, and a second status check in here could only ever disagree with it.
 */
export function InvoiceActions({
  invoiceId,
  outstanding,
  currency,
  canReturn,
  canCancel,
  canTakePayment,
  items,
}: {
  invoiceId: string;
  outstanding: string;
  currency: string;
  canReturn: boolean;
  canCancel: boolean;
  canTakePayment: boolean;
  items: ReturnableItem[];
}) {
  const [dialog, setDialog] = useState<"payment" | "return" | "cancel" | null>(
    null,
  );

  if (!canReturn && !canCancel && !canTakePayment) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Invoice actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canTakePayment ? (
            <DropdownMenuItem onSelect={() => setDialog("payment")}>
              Record payment
            </DropdownMenuItem>
          ) : null}
          {canReturn ? (
            <DropdownMenuItem onSelect={() => setDialog("return")}>
              Process return
            </DropdownMenuItem>
          ) : null}
          {canCancel ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDialog("cancel")}
              >
                Cancel invoice
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PaymentDialog
        open={dialog === "payment"}
        onClose={() => setDialog(null)}
        invoiceId={invoiceId}
        outstanding={outstanding}
        currency={currency}
      />
      <ReturnDialog
        open={dialog === "return"}
        onClose={() => setDialog(null)}
        invoiceId={invoiceId}
        currency={currency}
        items={items}
      />
      <CancelDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        invoiceId={invoiceId}
      />
    </>
  );
}

function PaymentDialog({
  open,
  onClose,
  invoiceId,
  outstanding,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  outstanding: string;
  currency: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(addPayment, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    }
    // onClose is stable for the lifetime of the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Outstanding {formatMoney(outstanding, { currency })}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          {!state.ok ? <FormError message={state.message} /> : null}

          <Field label="Amount" htmlFor="amount" required>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={Number(outstanding)}
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
              defaultValue="cash"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>

          <Field label="Reference" htmlFor="reference">
            <Input id="reference" name="reference" placeholder="Optional" />
          </Field>

          <SubmitButton variant="accent" size="sm" pendingLabel="Recording…">
            Record payment
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({
  open,
  onClose,
  invoiceId,
  currency,
  items,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  currency: string;
  items: ReturnableItem[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(submitReturn, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const returnable = items.filter(
    (i) => Number(i.quantity) - Number(i.returned) > 0,
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process return</DialogTitle>
          <DialogDescription>
            Enter the quantity being returned for each line. Stock and the refund
            are handled automatically.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="invoice_id" value={invoiceId} />
          {!state.ok ? <FormError message={state.message} /> : null}

          <div className="max-h-60 overflow-y-auto rounded-xs border border-border scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Item
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Returnable
                  </th>
                  <th className="w-24 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Return
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returnable.map((item) => {
                  const remaining =
                    Number(item.quantity) - Number(item.returned);
                  return (
                    <tr key={item.id}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{item.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {item.sku} ·{" "}
                          {formatMoney(item.unitPrice, { currency })}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular text-muted-foreground">
                        {formatQuantity(String(remaining))}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          max={remaining}
                          name={`return[${item.id}]`}
                          placeholder="0"
                          className="h-8 text-right"
                          aria-label={`Return quantity for ${item.name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reason" htmlFor="reason">
              <select
                id="reason"
                name="reason"
                defaultValue="customer_request"
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option value="customer_request">Customer request</option>
                <option value="damaged">Damaged</option>
                <option value="defective">Defective</option>
                <option value="wrong_product">Wrong product</option>
                <option value="exchange">Exchange</option>
              </select>
            </Field>
            <Field label="Refund method" htmlFor="refund_method">
              <select
                id="refund_method"
                name="refund_method"
                defaultValue="cash"
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="store_credit">Store credit</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xs border border-border px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">
                Return to sellable stock
              </span>
              <span className="block text-xs text-muted-foreground">
                Turn off to book the goods as damaged instead.
              </span>
            </span>
            <Switch name="restock" defaultChecked />
          </label>

          <Field label="Note" htmlFor="note">
            <Textarea id="note" name="note" rows={2} placeholder="Optional" />
          </Field>

          <SubmitButton variant="accent" size="sm" pendingLabel="Processing…">
            Complete return
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel this invoice?</DialogTitle>
          <DialogDescription>
            Stock is restored and any receivable released. The invoice is retained
            with a cancelled status — sales history is never deleted.
          </DialogDescription>
        </DialogHeader>

        <Field label="Reason" htmlFor="cancel_reason" required>
          <Textarea
            id="cancel_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this being cancelled?"
            autoFocus
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Keep invoice
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim() || pending}
            onClick={() =>
              startTransition(async () => {
                const result = await voidSale(invoiceId, reason.trim());
                if (result.ok) {
                  toast.success(result.message ?? "Invoice cancelled.");
                  onClose();
                } else {
                  toast.error(result.message ?? "Could not cancel the invoice.");
                }
              })
            }
          >
            Cancel invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
