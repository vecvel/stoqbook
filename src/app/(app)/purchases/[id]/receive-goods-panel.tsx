"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { currencySymbol, formatMoney, formatQuantity } from "@/lib/format";
import { apportion, div, mul, sub } from "@/lib/money";
import type { ActionResult } from "@/lib/actions";

import { submitGoodsReceipt } from "../actions";

export interface ReceivableItem {
  id: string;
  name: string;
  sku: string;
  unit: string;
  ordered: string;
  received: string;
  unitPrice: string;
  trackBatches: boolean;
}

/**
 * Goods receipt entry. The panel previews the landed cost per line — base cost
 * plus its share of freight — which is exactly what the server will post.
 */
export function ReceiveGoodsPanel({
  orderId,
  currency,
  items,
  batchesEnabled,
}: {
  orderId: string;
  currency: string;
  items: ReceivableItem[];
  batchesEnabled: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    submitGoodsReceipt,
    { ok: true },
  );

  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, String(Number(i.ordered) - Number(i.received))]),
    ),
  );
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});
  const [charges, setCharges] = useState("");

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const symbol = currencySymbol(currency);

  /* Apportion freight by line value, mirroring the server calculation. */
  const landed = useMemo(() => {
    const weights = items.map((i) =>
      mul(i.unitPrice, quantities[i.id] || "0"),
    );
    const shares =
      Number(charges) > 0 ? apportion(charges, weights) : items.map(() => "0");

    return items.map((item, index) => {
      const qty = quantities[item.id] || "0";
      const share = shares[index];
      const unitLanded =
        Number(qty) > 0
          ? String(Number(item.unitPrice) + Number(div(share, qty)))
          : item.unitPrice;
      return {
        id: item.id,
        unitLanded,
        lineTotal: mul(unitLanded, qty),
      };
    });
  }, [items, quantities, charges]);

  const totalCost = landed.reduce((acc, l) => acc + Number(l.lineTotal), 0);
  const anyQuantity = items.some(
    (i) => Number(quantities[i.id] || 0) > 0 || Number(rejected[i.id] || 0) > 0,
  );

  return (
    <section className="rounded-xs border-2 border-accent/40 bg-card">
      <header className="border-b border-border bg-accent/5 px-4 py-3">
        <h2 className="text-sm font-semibold">Receive goods</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Posting a receipt is what increases stock. Rejected quantities are held
          out of sellable inventory pending return.
        </p>
      </header>

      <form action={action} className="flex flex-col gap-3 px-4 py-4">
        <input type="hidden" name="order_id" value={orderId} />
        {!state.ok ? <FormError message={state.message} /> : null}

        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <Th>Product</Th>
                <Th align="right">Outstanding</Th>
                <Th align="right">Receiving</Th>
                <Th align="right">Rejected</Th>
                {batchesEnabled ? <Th>Batch</Th> : null}
                {batchesEnabled ? <Th>Expires</Th> : null}
                <Th align="right">Landed cost</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, index) => {
                const outstanding = sub(item.ordered, item.received);
                return (
                  <tr key={item.id}>
                    <td className="px-2 py-2">
                      <div className="font-medium">{item.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {item.sku}
                      </div>
                      <input
                        type="hidden"
                        name={`lines[${index}][order_item_id]`}
                        value={item.id}
                      />
                      <input
                        type="hidden"
                        name={`lines[${index}][unit_cost]`}
                        value={item.unitPrice}
                      />
                    </td>
                    <td className="px-2 py-2 text-right tabular text-muted-foreground">
                      {formatQuantity(outstanding, { unit: item.unit })}
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        name={`lines[${index}][quantity_received]`}
                        value={quantities[item.id] ?? ""}
                        onChange={(e) =>
                          setQuantities((q) => ({
                            ...q,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="h-8 w-24 text-right"
                        aria-label={`Receiving quantity for ${item.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        name={`lines[${index}][quantity_rejected]`}
                        value={rejected[item.id] ?? ""}
                        onChange={(e) =>
                          setRejected((r) => ({ ...r, [item.id]: e.target.value }))
                        }
                        placeholder="0"
                        className="h-8 w-20 text-right"
                        aria-label={`Rejected quantity for ${item.name}`}
                      />
                    </td>
                    {batchesEnabled ? (
                      <td className="px-2 py-2">
                        <Input
                          name={`lines[${index}][batch_number]`}
                          value={batches[item.id] ?? ""}
                          onChange={(e) =>
                            setBatches((b) => ({ ...b, [item.id]: e.target.value }))
                          }
                          placeholder={item.trackBatches ? "Required" : "Optional"}
                          className="h-8 w-28"
                          aria-label={`Batch number for ${item.name}`}
                        />
                      </td>
                    ) : null}
                    {batchesEnabled ? (
                      <td className="px-2 py-2">
                        <Input
                          type="date"
                          name={`lines[${index}][expires_on]`}
                          value={expiry[item.id] ?? ""}
                          onChange={(e) =>
                            setExpiry((x) => ({ ...x, [item.id]: e.target.value }))
                          }
                          className="h-8 w-36"
                          aria-label={`Expiry for ${item.name}`}
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-2 text-right tabular">
                      <div className="font-medium">
                        {formatMoney(landed[index]?.unitLanded ?? item.unitPrice, {
                          currency,
                        })}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatMoney(landed[index]?.lineTotal ?? 0, { currency })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <FieldRow cols={3}>
          <Field label="Receipt date" htmlFor="receipt_date">
            <Input
              id="receipt_date"
              name="receipt_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Supplier challan" htmlFor="challan_number">
            <Input
              id="challan_number"
              name="challan_number"
              placeholder="Delivery note reference"
            />
          </Field>
          <Field
            label={`Freight / charges (${symbol})`}
            htmlFor="additional_charges"
            hint="Apportioned across lines by value."
          >
            <Input
              id="additional_charges"
              name="additional_charges"
              type="number"
              step="0.01"
              min="0"
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
              placeholder="0"
              className="text-right"
            />
          </Field>
        </FieldRow>

        <Field label="Note" htmlFor="receipt_note">
          <Textarea
            id="receipt_note"
            name="note"
            rows={2}
            placeholder="Condition on arrival, discrepancies, etc."
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Total landed cost </span>
            <span className="font-semibold tabular">
              {formatMoney(totalCost, { currency })}
            </span>
          </div>
          <SubmitButton
            variant="accent"
            size="sm"
            disabled={!anyQuantity}
            pendingLabel="Posting receipt…"
          >
            Post goods receipt
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
