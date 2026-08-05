"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  Field,
  FieldRow,
  FormActions,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { ProductSearch, type ProductHit } from "@/components/shared/product-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatQuantity } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { submitAdjustment } from "../../actions";

interface Line {
  key: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  onHand: string;
  /** Signed delta the operator entered. */
  quantity: string;
  note: string;
}

const REASONS = [
  { value: "counting_error", label: "Counting error" },
  { value: "damaged", label: "Damaged — write off" },
  { value: "missing", label: "Missing / shrinkage" },
  { value: "found", label: "Found — add back" },
  { value: "expired", label: "Expired — write off" },
  { value: "administrative", label: "Administrative correction" },
];

export function AdjustmentForm({
  warehouses,
  defaultWarehouseId,
  approvalThreshold,
  canApprove,
}: {
  warehouses: { id: string; name: string }[];
  defaultWarehouseId: string;
  approvalThreshold: number;
  canApprove: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    submitAdjustment,
    { ok: true },
  );

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [reason, setReason] = useState("counting_error");
  const [lines, setLines] = useState<Line[]>([]);

  /**
   * Write-off reasons only ever reduce sellable stock, so the sign is fixed for
   * the operator rather than left as a trap.
   */
  const isWriteOff = reason === "damaged" || reason === "expired";
  const isAddBack = reason === "found";

  function addProduct(product: ProductHit) {
    setLines((current) => {
      if (current.some((l) => l.productId === product.id)) return current;
      return [
        ...current,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unitShort,
          onHand: product.available ?? "0",
          quantity: "",
          note: "",
        },
      ];
    });
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function remove(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  const largest = lines.reduce((max, l) => {
    const value = Math.abs(Number(l.quantity) || 0);
    return value > max ? value : max;
  }, 0);
  const needsApproval =
    approvalThreshold > 0 && largest > approvalThreshold && !canApprove;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="warehouse_id" value={warehouseId} />
      <input type="hidden" name="reason" value={reason} />

      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection
        title="Adjustment details"
        description="Every adjustment writes an immutable ledger entry and records a reason."
      >
        <FieldRow>
          <Field label="Warehouse" htmlFor="warehouse" required>
            <select
              id="warehouse"
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                // On-hand figures belong to a warehouse; clear stale lines.
                setLines([]);
              }}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason" htmlFor="reason-select" required>
            <select
              id="reason-select"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <Field label="Note" htmlFor="note">
          <Textarea
            id="note"
            name="note"
            rows={2}
            placeholder="Context for whoever reviews this later."
          />
        </Field>

        {isWriteOff ? (
          <p className="rounded-xs border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Write-offs move stock out of sellable inventory into the{" "}
            {reason === "damaged" ? "damaged" : "expired"} bucket rather than
            deleting it, so the value stays visible in reports.
          </p>
        ) : null}

        {needsApproval ? (
          <p className="rounded-xs border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            The largest line is {largest} units, above the {approvalThreshold}-unit
            threshold. This adjustment will be submitted for approval and will not
            affect stock until approved.
          </p>
        ) : null}
      </FormSection>

      <FormSection
        title="Lines"
        description={
          isWriteOff
            ? "Enter the quantity to write off as a positive number."
            : isAddBack
              ? "Enter the quantity found as a positive number."
              : "Enter a positive number to increase stock, negative to reduce it."
        }
      >
        <ProductSearch
          warehouseId={warehouseId}
          onSelect={addProduct}
          placeholder="Search a product to adjust…"
        />

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No lines yet. Search above to add products.
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Product
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    On hand
                  </th>
                  <th className="w-32 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {isWriteOff || isAddBack ? "Quantity" : "Change"}
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    New balance
                  </th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Note
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, index) => {
                  const entered = Number(line.quantity) || 0;
                  // Normalise the operator's input into a signed delta.
                  const delta = isWriteOff
                    ? -Math.abs(entered)
                    : isAddBack
                      ? Math.abs(entered)
                      : entered;
                  const newBalance = Number(line.onHand) + delta;

                  return (
                    <tr key={line.key}>
                      <td className="px-2 py-2">
                        <div className="font-medium">{line.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {line.sku}
                        </div>
                        <input
                          type="hidden"
                          name={`lines[${index}][product_id]`}
                          value={line.productId}
                        />
                        <input
                          type="hidden"
                          name={`lines[${index}][quantity]`}
                          value={String(delta)}
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular text-muted-foreground">
                        {formatQuantity(line.onHand, { unit: line.unit })}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min={isWriteOff || isAddBack ? "0" : undefined}
                          value={line.quantity}
                          onChange={(e) =>
                            update(line.key, { quantity: e.target.value })
                          }
                          className="h-8 text-right"
                          placeholder="0"
                          aria-label={`Quantity for ${line.name}`}
                        />
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular font-medium",
                          newBalance < 0 && "text-destructive",
                        )}
                      >
                        {formatQuantity(String(newBalance))}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          value={line.note}
                          onChange={(e) => update(line.key, { note: e.target.value })}
                          name={`lines[${index}][note]`}
                          className="h-8"
                          placeholder="Optional"
                          aria-label={`Note for ${line.name}`}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => remove(line.key)}
                          className="text-destructive hover:bg-destructive/10"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href="/inventory/adjustments">Cancel</Link>
        </Button>
        <SubmitButton
          variant="accent"
          size="sm"
          disabled={lines.length === 0}
          pendingLabel="Posting…"
        >
          {needsApproval ? "Submit for approval" : "Post adjustment"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
