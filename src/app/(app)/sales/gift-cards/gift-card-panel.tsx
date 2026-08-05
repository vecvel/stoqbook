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

import { deactivateCard, issueCard, topUpCard } from "./actions";

export interface CustomerOption {
  id: string;
  name: string;
}

export function IssueGiftCardForm({
  customers,
  currencySymbol,
}: {
  customers: CustomerOption[];
  currencySymbol: string;
}) {
  const [state, action] = useActionState<ActionResult<{ code: string }>, FormData>(
    issueCard,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <FormSection
        title="Issue a gift card"
        description="Leave the code blank to generate one. An unassigned card is a bearer card — whoever holds the code can spend it."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={4}>
          <Field label={`Value (${currencySymbol})`} htmlFor="amount" required>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="1000"
              className="text-right"
              required
            />
          </Field>
          <Field label="Assign to" htmlFor="customer_id" hint="Optional.">
            <select
              id="customer_id"
              name="customer_id"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">Bearer card</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expires" htmlFor="expires_at" hint="Blank = never.">
            <Input id="expires_at" name="expires_at" type="date" />
          </Field>
          <Field
            label="Code"
            htmlFor="code"
            hint="For pre-printed cards."
          >
            <Input
              id="code"
              name="code"
              placeholder="Auto"
              className="font-mono uppercase"
            />
          </Field>
        </FieldRow>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Issuing…">
            Issue card
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}

export function GiftCardRowActions({
  giftCardId,
  code,
  isActive,
  canTopUp,
  canDeactivate,
}: {
  giftCardId: string;
  code: string;
  isActive: boolean;
  canTopUp: boolean;
  canDeactivate: boolean;
}) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [killOpen, setKillOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await topUpCard(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setTopUpOpen(false);
      }
      return result;
    },
    { ok: true },
  );

  if (!isActive) {
    return <span className="text-[11px] text-muted-foreground">Closed</span>;
  }

  function kill() {
    startTransition(async () => {
      const result = await deactivateCard(giftCardId, reason.trim() || undefined);
      if (result.ok) {
        toast.success(result.message ?? "Deactivated.");
        setKillOpen(false);
        setReason("");
      } else {
        toast.error(result.message ?? "Could not deactivate the card.");
      }
    });
  }

  return (
    <>
      <div className="flex justify-end gap-1.5">
        {canTopUp ? (
          <Button variant="outline" size="xs" onClick={() => setTopUpOpen(true)}>
            Top up
          </Button>
        ) : null}
        {canDeactivate ? (
          <Button
            variant="ghost"
            size="xs"
            className="text-destructive"
            onClick={() => setKillOpen(true)}
          >
            Close
          </Button>
        ) : null}
      </div>

      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Top up {code}</DialogTitle>
            <DialogDescription>
              The amount is added to the card&apos;s balance and recorded in its
              ledger.
            </DialogDescription>
          </DialogHeader>

          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="gift_card_id" value={giftCardId} />
            {!state.ok ? <FormError message={state.message} /> : null}

            <Field label="Amount" htmlFor={`topup_${giftCardId}`} required>
              <Input
                id={`topup_${giftCardId}`}
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                className="text-right"
                required
                autoFocus
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTopUpOpen(false)}
              >
                Cancel
              </Button>
              <SubmitButton variant="accent" size="sm" pendingLabel="Adding…">
                Add value
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={killOpen} onOpenChange={setKillOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close {code}?</DialogTitle>
            <DialogDescription>
              Any remaining balance is written off as a ledger entry, so the
              money stays traceable. The card can no longer be spent.
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor={`reason_${giftCardId}`}>
            <Textarea
              id={`reason_${giftCardId}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reported lost by the customer."
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setKillOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              onClick={kill}
            >
              Close card
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
