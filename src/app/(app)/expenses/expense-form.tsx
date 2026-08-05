"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

/**
 * Inline expense entry. Kept on the list page so recording a cost is a
 * two-field task rather than a navigation.
 */
export function ExpenseForm({
  categories,
  currencySymbol: currency,
  saveAction,
}: {
  categories: { id: string; name: string }[];
  currencySymbol: string;
  saveAction: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveAction(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    { ok: true },
  );

  const symbol = currencySymbol(currency);

  if (!open) {
    return (
      <div>
        <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Record expense
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-xs border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Record expense</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          <X className="size-3.5" />
          Cancel
        </Button>
      </header>

      <form action={action} className="flex flex-col gap-3 px-4 py-4">
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={2}>
          <Field
            label="Description"
            htmlFor="title"
            error={state.errors?.title}
            required
          >
            <Input
              id="title"
              name="title"
              placeholder="Monthly shop rent"
              required
              autoFocus
            />
          </Field>
          <Field label="Category" htmlFor="category_id">
            <select
              id="category_id"
              name="category_id"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">Uncategorised</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={4}>
          <Field
            label={`Amount (${symbol})`}
            htmlFor="amount"
            error={state.errors?.amount}
            required
          >
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              className="text-right"
              required
            />
          </Field>
          <Field label={`Tax (${symbol})`} htmlFor="tax_amount">
            <Input
              id="tax_amount"
              name="tax_amount"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              className="text-right"
            />
          </Field>
          <Field label="Date" htmlFor="expense_date">
            <Input
              id="expense_date"
              name="expense_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Paid by" htmlFor="method">
            <select
              id="method"
              name="method"
              defaultValue="cash"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="card">Card</option>
              <option value="upi">UPI</option>
              <option value="cheque">Cheque</option>
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={2}>
          <Field label="Reference" htmlFor="reference">
            <Input
              id="reference"
              name="reference"
              placeholder="Invoice or receipt number"
            />
          </Field>
          <Field label="Note" htmlFor="note">
            <Textarea id="note" name="note" rows={1} />
          </Field>
        </FieldRow>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
            Record expense
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
