"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Trash2 } from "lucide-react";

import {
  Field,
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

import { submitTransfer } from "../../actions";

interface Line {
  key: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  available: string;
  quantity: string;
  note: string;
}

export function TransferForm({
  warehouses,
}: {
  warehouses: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    submitTransfer,
    { ok: true },
  );

  const [sourceId, setSourceId] = useState(warehouses[0]?.id ?? "");
  const [destinationId, setDestinationId] = useState(warehouses[1]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);

  const sameWarehouse = sourceId === destinationId;

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
          available: product.available ?? "0",
          quantity: "",
          note: "",
        },
      ];
    });
  }

  const overAvailable = lines.filter(
    (l) => Number(l.quantity) > Number(l.available),
  );
  const hasQuantities = lines.some((l) => Number(l.quantity) > 0);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="source_warehouse_id" value={sourceId} />
      <input
        type="hidden"
        name="destination_warehouse_id"
        value={destinationId}
      />

      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection title="Route">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From warehouse" htmlFor="source" className="min-w-[200px] flex-1">
            <select
              id="source"
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                // Availability is per warehouse, so clear stale lines.
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

          <ArrowRight className="mb-2.5 size-4 shrink-0 text-muted-foreground" />

          <Field
            label="To warehouse"
            htmlFor="destination"
            className="min-w-[200px] flex-1"
            error={sameWarehouse ? "Must differ from the source." : undefined}
          >
            <select
              id="destination"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Note" htmlFor="note">
          <Textarea
            id="note"
            name="note"
            rows={2}
            placeholder="Reason for the transfer, carrier details, etc."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Items"
        description="Quantities are checked against availability at the source when the transfer is dispatched."
      >
        <ProductSearch
          warehouseId={sourceId}
          onSelect={addProduct}
          placeholder="Search a product to transfer…"
        />

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No items yet. Search above to add products.
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
                    Available
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Transfer
                  </th>
                  <th className="px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Note
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, index) => {
                  const over = Number(line.quantity) > Number(line.available);
                  return (
                    <tr key={line.key} className={cn(over && "bg-destructive/5")}>
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
                      </td>
                      <td className="px-2 py-2 text-right tabular text-muted-foreground">
                        {formatQuantity(line.available, { unit: line.unit })}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          name={`lines[${index}][quantity]`}
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((c) =>
                              c.map((l) =>
                                l.key === line.key
                                  ? { ...l, quantity: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          className="h-8 text-right"
                          placeholder="0"
                          aria-label={`Transfer quantity for ${line.name}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          name={`lines[${index}][note]`}
                          value={line.note}
                          onChange={(e) =>
                            setLines((c) =>
                              c.map((l) =>
                                l.key === line.key
                                  ? { ...l, note: e.target.value }
                                  : l,
                              ),
                            )
                          }
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
                          onClick={() =>
                            setLines((c) => c.filter((l) => l.key !== line.key))
                          }
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

        {overAvailable.length > 0 ? (
          <p className="rounded-xs border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            {overAvailable.map((l) => l.name).join(", ")} exceed available stock at
            the source. Dispatch will be refused unless negative stock is enabled.
          </p>
        ) : null}
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href="/inventory/transfers">Cancel</Link>
        </Button>
        <SubmitButton
          variant="accent"
          size="sm"
          disabled={!hasQuantities || sameWarehouse}
          pendingLabel="Creating…"
        >
          Create transfer
        </SubmitButton>
      </FormActions>
    </form>
  );
}
