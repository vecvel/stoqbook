"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
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
import { currencySymbol, formatMoney } from "@/lib/format";
import { computeDocument, computeLine } from "@/lib/services/pricing";
import type { ActionResult } from "@/lib/actions";

import { submitPurchaseOrder } from "../actions";

interface Line {
  key: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountValue: string;
  taxRate: string;
}

export function PurchaseOrderForm({
  suppliers,
  warehouses,
  currency,
  approvalRequired,
  approvalThreshold,
}: {
  suppliers: { id: string; name: string; creditDays: number; terms: string | null }[];
  warehouses: { id: string; name: string }[];
  currency: string;
  approvalRequired: boolean;
  approvalThreshold: number;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    submitPurchaseOrder,
    { ok: true },
  );

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([]);
  const [shipping, setShipping] = useState("");
  const [otherCharges, setOtherCharges] = useState("");

  const supplier = suppliers.find((s) => s.id === supplierId);
  const symbol = currencySymbol(currency);

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
          quantity: "1",
          // Default to the last known cost — the buyer confirms or overrides it.
          unitPrice: String(Number(product.costPrice)),
          discountValue: "",
          taxRate: product.taxRate,
        },
      ];
    });
  }

  function update(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  const totals = useMemo(() => {
    const computed = lines.map((line) =>
      computeLine({
        quantity: line.quantity || "0",
        unitPrice: line.unitPrice || "0",
        discountType: line.discountValue ? "percentage" : "none",
        discountValue: line.discountValue || "0",
        taxRate: line.taxRate,
      }),
    );
    return {
      perLine: computed,
      document: computeDocument({
        lines: computed,
        shippingAmount: shipping || "0",
        otherCharges: otherCharges || "0",
      }),
    };
  }, [lines, shipping, otherCharges]);

  const needsApproval =
    approvalRequired &&
    (approvalThreshold === 0 ||
      Number(totals.document.grandTotal) >= approvalThreshold);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <input type="hidden" name="warehouse_id" value={warehouseId} />

      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection title="Order details">
        <FieldRow cols={2}>
          <Field label="Supplier" htmlFor="supplier" required>
            <select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Receive into"
            htmlFor="warehouse"
            hint="Where the goods will be booked in."
            required
          >
            <select
              id="warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>

        <FieldRow cols={2}>
          <Field label="Expected delivery" htmlFor="expected_date">
            <Input id="expected_date" name="expected_date" type="date" />
          </Field>
          <Field label="Payment terms" htmlFor="payment_terms">
            <Input
              id="payment_terms"
              name="payment_terms"
              defaultValue={supplier?.terms ?? ""}
              placeholder={
                supplier ? `Net ${supplier.creditDays}` : "Net 30"
              }
            />
          </Field>
        </FieldRow>

        <Field label="Note" htmlFor="note">
          <Textarea id="note" name="note" rows={2} placeholder="Optional" />
        </Field>
      </FormSection>

      <FormSection
        title="Items"
        description="Unit price is the purchase cost, before tax."
      >
        <ProductSearch
          onSelect={addProduct}
          placeholder="Search a product to order…"
          currency={currency}
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
                  <Th>Product</Th>
                  <Th align="right">Qty</Th>
                  <Th align="right">Unit cost</Th>
                  <Th align="right">Disc %</Th>
                  <Th align="right">Tax</Th>
                  <Th align="right">Total</Th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line, index) => (
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
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        name={`lines[${index}][quantity]`}
                        value={line.quantity}
                        onChange={(e) =>
                          update(line.key, { quantity: e.target.value })
                        }
                        className="h-8 w-20 text-right"
                        aria-label={`Quantity for ${line.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        name={`lines[${index}][unit_price]`}
                        value={line.unitPrice}
                        onChange={(e) =>
                          update(line.key, { unitPrice: e.target.value })
                        }
                        className="h-8 w-24 text-right"
                        aria-label={`Unit cost for ${line.name}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        name={`lines[${index}][discount_value]`}
                        value={line.discountValue}
                        onChange={(e) =>
                          update(line.key, { discountValue: e.target.value })
                        }
                        placeholder="0"
                        className="h-8 w-16 text-right"
                        aria-label={`Discount for ${line.name}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                      {Number(line.taxRate) > 0
                        ? `${Number(line.taxRate)}%`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular">
                      {formatMoney(totals.perLine[index]?.total ?? 0, {
                        currency,
                      })}
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FormSection>

      <FormSection
        title="Charges and total"
        description="Freight and other charges are apportioned across lines at receipt to give a true landed cost."
      >
        <FieldRow cols={2}>
          <Field label={`Shipping / freight (${symbol})`} htmlFor="shipping_amount">
            <Input
              id="shipping_amount"
              name="shipping_amount"
              type="number"
              step="0.01"
              min="0"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              placeholder="0"
              className="text-right"
            />
          </Field>
          <Field label={`Other charges (${symbol})`} htmlFor="other_charges">
            <Input
              id="other_charges"
              name="other_charges"
              type="number"
              step="0.01"
              min="0"
              value={otherCharges}
              onChange={(e) => setOtherCharges(e.target.value)}
              placeholder="0"
              className="text-right"
            />
          </Field>
        </FieldRow>

        <dl className="divide-y divide-border rounded-xs border border-border text-sm">
          <Total label="Subtotal" value={formatMoney(totals.document.subtotal, { currency })} />
          {Number(totals.document.discountAmount) > 0 ? (
            <Total
              label="Discount"
              value={`− ${formatMoney(totals.document.discountAmount, { currency })}`}
            />
          ) : null}
          <Total label="Tax" value={formatMoney(totals.document.taxAmount, { currency })} />
          {Number(totals.document.shippingAmount) > 0 ? (
            <Total
              label="Shipping"
              value={formatMoney(totals.document.shippingAmount, { currency })}
            />
          ) : null}
          {Number(totals.document.otherCharges) > 0 ? (
            <Total
              label="Other charges"
              value={formatMoney(totals.document.otherCharges, { currency })}
            />
          ) : null}
          <Total
            label="Grand total"
            value={formatMoney(totals.document.grandTotal, { currency })}
            strong
          />
        </dl>

        {needsApproval ? (
          <p className="rounded-xs border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            This order requires approval before goods can be received.
          </p>
        ) : null}
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href="/purchases">Cancel</Link>
        </Button>
        <SubmitButton
          variant="accent"
          size="sm"
          disabled={lines.length === 0 || !supplierId}
          pendingLabel="Creating…"
        >
          {needsApproval ? "Submit for approval" : "Create order"}
        </SubmitButton>
      </FormActions>
    </form>
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

function Total({
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
      <dd className={strong ? "text-base font-semibold tabular" : "tabular"}>
        {value}
      </dd>
    </div>
  );
}
