/**
 * Client-side cart preview.
 *
 * This reuses the same pricing engine the server uses, so the figure on screen
 * matches the invoice exactly. The server still recomputes everything on
 * checkout — this is display only, never the source of truth.
 */
import {
  computeDocument,
  computeLine,
  maxDiscountPercent,
  type DiscountType,
  type LineTotals,
} from "@/lib/services/pricing";
import { add as addDecimal, toNumber } from "@/lib/money";

export { add } from "@/lib/money";

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  allowDecimal: boolean;
  quantity: string;
  unitPrice: string;
  /** Original list price, so a manual override is visible. */
  listPrice: string;
  taxRate: string;
  taxMode: "inclusive" | "exclusive";
  discountType: DiscountType;
  discountValue: string;
  available: string | null;
  trackInventory: boolean;
}

export interface CartSummary {
  lines: (LineTotals & { key: string })[];
  subtotal: string;
  lineDiscount: string;
  documentDiscount: string;
  discountAmount: string;
  taxAmount: string;
  roundOff: string;
  grandTotal: string;
  itemCount: number;
  unitCount: string;
  /** Largest discount percentage on the bill, for the approval check. */
  maxDiscountPercent: number;
}

export function computeSummary(
  lines: CartLine[],
  options: {
    discountType: DiscountType;
    discountValue: string;
    roundOff: boolean;
  },
): CartSummary {
  const computed = lines.map((line) => ({
    key: line.key,
    ...computeLine({
      quantity: line.quantity || "0",
      unitPrice: line.unitPrice || "0",
      discountType: line.discountType,
      discountValue: line.discountValue,
      taxRate: line.taxRate,
      taxMode: line.taxMode,
    }),
  }));

  const document = computeDocument({
    lines: computed,
    discountType: options.discountType,
    discountValue: options.discountValue,
    roundOff: options.roundOff,
  });

  const lineTotal = computed.reduce((acc, l) => addDecimal(acc, l.total), "0");
  const appliedDiscount = maxDiscountPercent(
    computed.map((l) => ({
      subtotal: l.subtotal,
      discountAmount: l.discountAmount,
    })),
    document.documentDiscount,
    lineTotal,
  );

  return {
    lines: computed,
    subtotal: document.subtotal,
    lineDiscount: document.lineDiscount,
    documentDiscount: document.documentDiscount,
    discountAmount: document.discountAmount,
    taxAmount: document.taxAmount,
    roundOff: document.roundOff,
    grandTotal: document.grandTotal,
    itemCount: lines.length,
    unitCount: lines.reduce((acc, l) => addDecimal(acc, l.quantity || "0"), "0"),
    maxDiscountPercent: toNumber(appliedDiscount),
  };
}
