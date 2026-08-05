"use client";

import { useActionState, useState } from "react";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney, formatTime } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

import { closeSession, openSession } from "./actions";

export interface SessionSummary {
  id: string;
  number: string;
  openedAt: string;
  openingCash: string;
  expectedCash: string;
  totalSales: string;
  totalRefunds: string;
  transactionCount: number;
}

export function SessionPanel({
  warehouseId,
  session,
  currency,
  canOpen,
  canClose,
}: {
  warehouseId: string;
  session: SessionSummary | null;
  currency: string;
  canOpen: boolean;
  canClose: boolean;
}) {
  if (session) {
    return canClose ? (
      <CloseSessionDialog session={session} currency={currency} />
    ) : (
      <Badge variant="soft-success">Session {session.number}</Badge>
    );
  }

  return canOpen ? <OpenSessionDialog warehouseId={warehouseId} /> : null;
}

function OpenSessionDialog({ warehouseId }: { warehouseId: string }) {
  const [open, setOpen] = useState(false);
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await openSession(prev, form);
      if (result.ok && result.message) setOpen(false);
      return result;
    },
    { ok: true },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm">
          Open cash session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open cash session</DialogTitle>
          <DialogDescription>
            Record the float in the drawer so it can be reconciled at close.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="warehouse_id" value={warehouseId} />
          {!state.ok ? <FormError message={state.message} /> : null}
          <Field label="Opening cash float" htmlFor="opening_cash" required>
            <Input
              id="opening_cash"
              name="opening_cash"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
              autoFocus
              className="text-right"
            />
          </Field>
          <SubmitButton variant="accent" size="sm" pendingLabel="Opening…">
            Open session
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseSessionDialog({
  session,
  currency,
}: {
  session: SessionSummary;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState("");
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await closeSession(prev, form);
      if (result.ok && result.message) setOpen(false);
      return result;
    },
    { ok: true },
  );

  // Expected drawer contents: the float plus cash taken during the session.
  const expected = Number(session.openingCash) + Number(session.expectedCash);
  const variance = counted === "" ? null : Number(counted) - expected;

  return (
    <div className="flex items-center gap-2">
      <Badge variant="soft-success">
        {session.number} · {session.transactionCount} bills
      </Badge>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Close session
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close cash session</DialogTitle>
            <DialogDescription>
              Opened at {formatTime(session.openedAt)} · {session.transactionCount}{" "}
              transaction{session.transactionCount === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>

          <dl className="divide-y divide-border rounded-xs border border-border text-sm">
            <Line label="Opening float" value={formatMoney(session.openingCash, { currency })} />
            <Line label="Cash taken" value={formatMoney(session.expectedCash, { currency })} />
            <Line
              label="Total sales"
              value={formatMoney(session.totalSales, { currency })}
            />
            {Number(session.totalRefunds) > 0 ? (
              <Line
                label="Refunds"
                value={formatMoney(session.totalRefunds, { currency })}
              />
            ) : null}
            <Line
              label="Expected in drawer"
              value={formatMoney(expected, { currency })}
              strong
            />
          </dl>

          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="session_id" value={session.id} />
            {!state.ok ? <FormError message={state.message} /> : null}

            <Field label="Counted cash" htmlFor="closing_cash" required>
              <Input
                id="closing_cash"
                name="closing_cash"
                type="number"
                step="0.01"
                min="0"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder={expected.toFixed(2)}
                autoFocus
                className="text-right text-lg"
                required
              />
            </Field>

            {variance !== null ? (
              <div
                className={
                  Math.abs(variance) < 0.005
                    ? "rounded-xs bg-success/10 px-3 py-2 text-sm text-success"
                    : "rounded-xs bg-destructive/10 px-3 py-2 text-sm text-destructive"
                }
              >
                {Math.abs(variance) < 0.005
                  ? "Drawer balances exactly."
                  : `${variance > 0 ? "Over" : "Short"} by ${formatMoney(Math.abs(variance), { currency })}.`}
              </div>
            ) : null}

            <Field label="Note" htmlFor="note">
              <Textarea
                id="note"
                name="note"
                rows={2}
                placeholder="Explain any variance."
              />
            </Field>

            <SubmitButton variant="accent" size="sm" pendingLabel="Closing…">
              Close session
            </SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className={strong ? "font-medium" : "text-muted-foreground"}>{label}</dt>
      <dd className={strong ? "font-semibold tabular" : "tabular"}>{value}</dd>
    </div>
  );
}
