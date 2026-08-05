/**
 * Line and document totalling.
 *
 * All arithmetic is exact decimal. Server-side computation is authoritative —
 * clients may send quantities, prices and discounts but never totals.
 */
import {
  add,
  dec,
  div,
  gt,
  isPositive,
  lte,
  mul,
  pct,
  round,
  roundToWhole,
  sub,
} from "@/lib/money";

export type DiscountType = "none" | "percentage" | "fixed";
export type TaxMode = "inclusive" | "exclusive";

export interface LineInput {
  quantity: string;
  unitPrice: string;
  discountType?: DiscountType;
  discountValue?: string;
  taxRate?: string;
  taxMode?: TaxMode;
}

export interface LineTotals {
  /** quantity × unitPrice, before discount. */
  subtotal: string;
  discountAmount: string;
  /** subtotal − discount; the taxable base. */
  taxableAmount: string;
  taxAmount: string;
  /** taxableAmount + tax for exclusive; equals taxableAmount for inclusive. */
  total: string;
}

export function computeLine(input: LineInput): LineTotals {
  const subtotal = mul(input.quantity, input.unitPrice);

  const discountAmount = computeDiscount(
    subtotal,
    input.discountType ?? "none",
    input.discountValue ?? "0",
  );

  const afterDiscount = sub(subtotal, discountAmount);
  const taxRate = input.taxRate ?? "0";
  const mode = input.taxMode ?? "exclusive";

  if (!isPositive(taxRate)) {
    return {
      subtotal: dec(subtotal),
      discountAmount: dec(discountAmount),
      taxableAmount: dec(afterDiscount),
      taxAmount: "0.0000",
      total: dec(afterDiscount),
    };
  }

  if (mode === "inclusive") {
    // Price already contains tax: base = gross × 100 / (100 + rate)
    const base = div(mul(afterDiscount, "100"), add("100", taxRate));
    const tax = sub(afterDiscount, base);
    return {
      subtotal: dec(subtotal),
      discountAmount: dec(discountAmount),
      taxableAmount: dec(base),
      taxAmount: dec(tax),
      total: dec(afterDiscount),
    };
  }

  const tax = pct(afterDiscount, taxRate);
  return {
    subtotal: dec(subtotal),
    discountAmount: dec(discountAmount),
    taxableAmount: dec(afterDiscount),
    taxAmount: dec(tax),
    total: dec(add(afterDiscount, tax)),
  };
}

export function computeDiscount(
  base: string,
  type: DiscountType,
  value: string,
): string {
  if (type === "percentage") {
    // Guard against a >100% discount producing a negative line.
    const capped = gt(value, "100") ? "100" : value;
    return dec(pct(base, capped));
  }
  if (type === "fixed") {
    return gt(value, base) ? dec(base) : dec(value);
  }
  return "0.0000";
}

export interface DocumentInput {
  lines: LineTotals[];
  /** Discount applied to the document as a whole, after line discounts. */
  discountType?: DiscountType;
  discountValue?: string;
  shippingAmount?: string;
  otherCharges?: string;
  /** Round the grand total to a whole currency unit. */
  roundOff?: boolean;
}

export interface DocumentTotals {
  subtotal: string;
  lineDiscount: string;
  documentDiscount: string;
  discountAmount: string;
  taxAmount: string;
  shippingAmount: string;
  otherCharges: string;
  roundOff: string;
  grandTotal: string;
}

export function computeDocument(input: DocumentInput): DocumentTotals {
  const subtotal = input.lines.reduce((acc, l) => add(acc, l.subtotal), "0");
  const lineDiscount = input.lines.reduce(
    (acc, l) => add(acc, l.discountAmount),
    "0",
  );
  const taxAmount = input.lines.reduce((acc, l) => add(acc, l.taxAmount), "0");
  const lineTotal = input.lines.reduce((acc, l) => add(acc, l.total), "0");

  const documentDiscount = computeDiscount(
    lineTotal,
    input.discountType ?? "none",
    input.discountValue ?? "0",
  );

  const shipping = dec(input.shippingAmount ?? "0");
  const other = dec(input.otherCharges ?? "0");

  const beforeRounding = add(
    sub(lineTotal, documentDiscount),
    add(shipping, other),
  );

  const grandTotal = input.roundOff
    ? roundToWhole(beforeRounding)
    : round(beforeRounding, 2);
  const roundOff = sub(grandTotal, beforeRounding);

  return {
    subtotal: dec(subtotal),
    lineDiscount: dec(lineDiscount),
    documentDiscount: dec(documentDiscount),
    discountAmount: dec(add(lineDiscount, documentDiscount)),
    taxAmount: dec(taxAmount),
    shippingAmount: shipping,
    otherCharges: other,
    roundOff: dec(roundOff),
    grandTotal: dec(grandTotal),
  };
}

/**
 * Effective selling price for a product, honouring an active promotional price
 * and wholesale group pricing (07-products.md § Pricing Engine).
 */
export function effectivePrice(
  product: {
    selling_price: string | number;
    wholesale_price?: string | number | null;
    discount_price?: string | number | null;
    discount_starts_at?: Date | null;
    discount_ends_at?: Date | null;
  },
  options: {
    useWholesale?: boolean;
    storePrice?: string | null;
    at?: Date;
  } = {},
): string {
  const now = options.at ?? new Date();

  // A promotional price inside its window wins over everything else.
  if (product.discount_price !== null && product.discount_price !== undefined) {
    const startsOk =
      !product.discount_starts_at || product.discount_starts_at <= now;
    const endsOk = !product.discount_ends_at || product.discount_ends_at >= now;
    if (startsOk && endsOk && isPositive(String(product.discount_price))) {
      return dec(String(product.discount_price));
    }
  }

  if (
    options.useWholesale &&
    product.wholesale_price !== null &&
    product.wholesale_price !== undefined &&
    isPositive(String(product.wholesale_price))
  ) {
    return dec(String(product.wholesale_price));
  }

  if (options.storePrice && isPositive(options.storePrice)) {
    return dec(options.storePrice);
  }

  return dec(String(product.selling_price));
}

/** Highest discount percentage present on a document, for approval checks. */
export function maxDiscountPercent(
  lines: { subtotal: string; discountAmount: string }[],
  documentDiscount: string,
  documentBase: string,
): string {
  let max = "0";
  for (const line of lines) {
    if (!isPositive(line.subtotal)) continue;
    const percent = mul(div(line.discountAmount, line.subtotal), "100");
    if (gt(percent, max)) max = percent;
  }
  if (isPositive(documentBase)) {
    const percent = mul(div(documentDiscount, documentBase), "100");
    if (gt(percent, max)) max = percent;
  }
  return dec(max);
}

/** True when every discount is within the tenant's configured ceiling. */
export function withinDiscountLimit(
  appliedPercent: string,
  maxPercent: number,
): boolean {
  return lte(appliedPercent, String(maxPercent));
}
