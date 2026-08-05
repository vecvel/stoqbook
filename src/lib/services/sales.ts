import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  giftCards,
  giftCardTransactions,
  posSessions,
  products,
  salePayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturnItems,
  salesReturns,
  taxGroups,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/context";
import { BusinessRuleError, ValidationError } from "@/lib/authz/errors";
import {
  add,
  dec,
  gt,
  gte,
  isPositive,
  isZero,
  lt,
  mul,
  sub,
  sum,
} from "@/lib/money";
import { auditEvent } from "./audit";
import { postMovements } from "./inventory";
import { emit } from "./notifications";
import { nextNumber } from "./numbering";
import {
  assertCreditAllowed,
  calculateLoyaltyPoints,
  postCustomerLedger,
  postLoyalty,
  recordCustomerPurchase,
} from "./partners";
import {
  computeDocument,
  computeLine,
  maxDiscountPercent,
  withinDiscountLimit,
  type DiscountType,
  type LineTotals,
} from "./pricing";
import { loadSettings, readBoolean, readNumber } from "./settings";

/**
 * Sales service.
 *
 * A completed invoice reduces inventory, records payments, updates customer
 * receivables and loyalty, and writes an audit entry — all in one transaction
 * (10-sales-pos.md § Business Rules).
 */

export type PaymentMethod =
  | "cash"
  | "card"
  | "upi"
  | "bank_transfer"
  | "cheque"
  | "wallet"
  | "gift_card"
  | "store_credit"
  | "credit"
  | "online";

export interface SaleLineInput {
  productId: string;
  quantity: string;
  /** Omit to use the product's effective price. */
  unitPrice?: string;
  discountType?: DiscountType;
  discountValue?: string;
}

export interface SalePaymentInput {
  method: PaymentMethod;
  amount: string;
  reference?: string;
  tenderedAmount?: string;
  /** Required when method is gift_card. */
  giftCardCode?: string;
}

export interface CreateSaleInput {
  customerId?: string | null;
  warehouseId: string;
  lines: SaleLineInput[];
  payments?: SalePaymentInput[];
  discountType?: DiscountType;
  discountValue?: string;
  channel?:
    | "pos_counter"
    | "online"
    | "phone_order"
    | "whatsapp"
    | "walk_in"
    | "wholesale"
    | "internal";
  posSessionId?: string | null;
  /** Points the customer wants to redeem on this sale. */
  redeemLoyaltyPoints?: string;
  note?: string;
  dueDate?: Date | null;
}

export interface CreateSaleResult {
  invoiceId: string;
  invoiceNumber: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  changeAmount: string;
  loyaltyEarned: string;
}

export async function createSale(
  ctx: BusinessContext,
  input: CreateSaleInput,
): Promise<CreateSaleResult> {
  if (!input.lines || input.lines.length === 0) {
    throw ValidationError("A sale must contain at least one item.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }

  const storeId = ctx.activeStore.id;
  const settings = await loadSettings({
    businessId: ctx.business.id,
    storeId,
    userId: ctx.user.id,
  });

  const allowNegative = readBoolean(settings, "inventory.allow_negative_stock");
  const roundOff = readBoolean(settings, "sales.round_off");
  const discountsAllowed = readBoolean(settings, "sales.allow_discounts");
  const maxDiscount = readNumber(settings, "sales.max_discount_percent", 100);
  const loyaltyEnabled = readBoolean(settings, "sales.loyalty_enabled");
  const pointsPerHundred = readNumber(
    settings,
    "sales.loyalty_points_per_currency",
    1,
  );

  /* ---- Load and validate products ------------------------------------- */

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const productRows = await db
    .select({
      product: products,
      taxRate: taxGroups.rate,
      taxMode: taxGroups.mode,
    })
    .from(products)
    .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id))
    .where(
      and(eq(products.tenant_id, ctx.business.id), inArray(products.id, productIds)),
    );

  const byId = new Map(productRows.map((r) => [r.product.id, r]));

  for (const id of productIds) {
    const row = byId.get(id);
    if (!row) throw ValidationError("One or more products no longer exist.");
    // Archived and inactive products cannot be sold (07-products.md).
    if (row.product.status === "archived" || row.product.status === "inactive") {
      throw BusinessRuleError(
        `${row.product.name} is ${row.product.status} and cannot be sold.`,
        "PRODUCT_NOT_SELLABLE",
      );
    }
    if (row.product.status === "discontinued") {
      throw BusinessRuleError(
        `${row.product.name} has been discontinued.`,
        "PRODUCT_DISCONTINUED",
      );
    }
  }

  /* ---- Customer -------------------------------------------------------- */

  let customer: typeof customers.$inferSelect | null = null;
  if (input.customerId) {
    const [row] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!row) throw ValidationError("Customer not found.");
    customer = row;
  }

  const useWholesale =
    customer?.type === "wholesale" || input.channel === "wholesale";

  /* ---- Line maths ------------------------------------------------------ */

  const computed: {
    line: SaleLineInput;
    product: typeof products.$inferSelect;
    taxRate: string;
    totals: LineTotals;
    unitPrice: string;
    unitCost: string;
  }[] = [];

  for (const line of input.lines) {
    if (!isPositive(line.quantity)) {
      throw ValidationError("Quantity must be greater than zero.");
    }

    const row = byId.get(line.productId)!;
    const unitPrice =
      line.unitPrice !== undefined
        ? dec(line.unitPrice)
        : effectiveUnitPrice(row.product, useWholesale);

    if (lt(unitPrice, "0")) {
      throw ValidationError("Unit price cannot be negative.");
    }

    const discountType = discountsAllowed ? (line.discountType ?? "none") : "none";
    const taxRate = dec(String(row.taxRate ?? "0"));

    const totals = computeLine({
      quantity: line.quantity,
      unitPrice,
      discountType,
      discountValue: line.discountValue ?? "0",
      taxRate,
      taxMode: (row.taxMode ?? "exclusive") as "inclusive" | "exclusive",
    });

    computed.push({
      line,
      product: row.product,
      taxRate,
      totals,
      unitPrice,
      // Average cost snapshot is taken inside the transaction, below.
      unitCost: "0.0000",
    });
  }

  const documentDiscountType = discountsAllowed
    ? (input.discountType ?? "none")
    : "none";

  const totals = computeDocument({
    lines: computed.map((c) => c.totals),
    discountType: documentDiscountType,
    discountValue: input.discountValue ?? "0",
    roundOff,
  });

  /* ---- Discount authorisation ------------------------------------------ */

  const appliedDiscount = maxDiscountPercent(
    computed.map((c) => ({
      subtotal: c.totals.subtotal,
      discountAmount: c.totals.discountAmount,
    })),
    totals.documentDiscount,
    computed.reduce((acc, c) => add(acc, c.totals.total), "0"),
  );

  if (
    !withinDiscountLimit(appliedDiscount, maxDiscount) &&
    !hasPermission(ctx, "sales.discount_override")
  ) {
    throw BusinessRuleError(
      `Discount of ${appliedDiscount}% exceeds the ${maxDiscount}% limit. ` +
        "Manager approval is required.",
      "DISCOUNT_LIMIT_EXCEEDED",
    );
  }

  /* ---- Loyalty redemption --------------------------------------------- */

  const redeemPoints =
    loyaltyEnabled && customer && input.redeemLoyaltyPoints
      ? dec(input.redeemLoyaltyPoints)
      : "0.0000";

  if (isPositive(redeemPoints)) {
    if (!customer) throw ValidationError("Select a customer to redeem points.");
    if (gt(redeemPoints, String(customer.loyalty_points))) {
      throw BusinessRuleError(
        `Customer has only ${dec(String(customer.loyalty_points))} points.`,
        "LOYALTY_INSUFFICIENT",
      );
    }
  }

  /* ---- Payments -------------------------------------------------------- */

  const payments = input.payments ?? [];
  const paidAmount = sum(payments, (p) => p.amount);

  if (gt(paidAmount, add(totals.grandTotal, "0.01"))) {
    throw ValidationError("Payments exceed the invoice total.");
  }

  const balanceAmount = sub(totals.grandTotal, paidAmount);
  const isCredit = isPositive(balanceAmount);

  if (isCredit) {
    if (!customer) {
      throw BusinessRuleError(
        "A credit sale requires a registered customer.",
        "CREDIT_REQUIRES_CUSTOMER",
      );
    }
    if (!hasPermission(ctx, "sales.credit")) {
      throw BusinessRuleError(
        "You are not permitted to create credit sales.",
        "CREDIT_NOT_PERMITTED",
      );
    }
    assertCreditAllowed(customer, balanceAmount, {
      canOverride: hasPermission(ctx, "sales.credit_override"),
    });
  }

  // Cash change is informational only; it never affects the recorded amount.
  const cashTendered = sum(
    payments.filter((p) => p.method === "cash"),
    (p) => p.tenderedAmount ?? p.amount,
  );
  const cashRecorded = sum(
    payments.filter((p) => p.method === "cash"),
    (p) => p.amount,
  );
  const changeAmount = gt(cashTendered, cashRecorded)
    ? sub(cashTendered, cashRecorded)
    : "0.0000";

  /* ---- Persist --------------------------------------------------------- */

  const result = await db.transaction(async (tx) => {
    const invoiceNumber = await nextNumber(ctx.business.id, "sales_invoice", {
      storeId,
      client: tx,
    });

    const paymentStatus = isZero(paidAmount)
      ? "unpaid"
      : isPositive(balanceAmount)
        ? "partially_paid"
        : "paid";

    const [invoice] = await tx
      .insert(salesInvoices)
      .values({
        tenant_id: ctx.business.id,
        branch_id: storeId,
        warehouse_id: input.warehouseId,
        customer_id: customer?.id ?? null,
        pos_session_id: input.posSessionId ?? null,
        invoice_number: invoiceNumber,
        status: "completed",
        channel: input.channel ?? "pos_counter",
        due_date: input.dueDate ?? null,
        customer_name: customer?.name ?? "Walk-in customer",
        customer_phone: customer?.phone ?? null,
        subtotal: totals.subtotal,
        discount_type: documentDiscountType,
        discount_value: dec(input.discountValue ?? "0"),
        discount_amount: totals.discountAmount,
        tax_amount: totals.taxAmount,
        round_off: totals.roundOff,
        grand_total: totals.grandTotal,
        paid_amount: dec(paidAmount),
        balance_amount: dec(balanceAmount),
        payment_status: paymentStatus,
        loyalty_points_redeemed: redeemPoints,
        cashier_id: ctx.user.id,
        note: input.note ?? null,
        created_by: ctx.user.id,
      })
      .returning();

    /* Items, with the cost snapshot taken from current average cost. */
    let totalCost = "0.0000";

    for (const c of computed) {
      const snapshotCost = await currentAverageCost(
        tx,
        ctx.business.id,
        input.warehouseId,
        c.product.id,
        String(c.product.cost_price),
      );
      const lineCost = mul(snapshotCost, c.line.quantity);
      totalCost = add(totalCost, lineCost);

      await tx.insert(salesInvoiceItems).values({
        invoice_id: invoice.id,
        product_id: c.product.id,
        product_name: c.product.name,
        product_sku: c.product.sku,
        quantity: dec(c.line.quantity),
        unit_price: c.unitPrice,
        unit_cost: snapshotCost,
        discount_type: (c.line.discountType ?? "none") as DiscountType,
        discount_value: dec(c.line.discountValue ?? "0"),
        discount_amount: c.totals.discountAmount,
        tax_group_id: c.product.tax_group_id,
        tax_rate: c.taxRate,
        tax_amount: c.totals.taxAmount,
        line_subtotal: c.totals.subtotal,
        line_total: c.totals.total,
      });
    }

    await tx
      .update(salesInvoices)
      .set({
        total_cost: totalCost,
        gross_profit: sub(sub(totals.grandTotal, totals.taxAmount), totalCost),
      })
      .where(eq(salesInvoices.id, invoice.id));

    /* Inventory: a completed sale reduces stock immediately. */
    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative },
      computed
        .filter((c) => c.product.track_inventory)
        .map((c) => ({
          productId: c.product.id,
          storeId,
          warehouseId: input.warehouseId,
          type: "sale" as const,
          quantity: mul(c.line.quantity, "-1"),
          unitCost: c.unitCost,
          referenceType: "sales_invoice",
          referenceId: invoice.id,
          referenceNumber: invoiceNumber,
          reason: "Sale",
        })),
    );

    /* Payments. */
    for (const payment of payments) {
      if (payment.method === "gift_card") {
        await redeemGiftCard(tx, ctx, payment, invoice.id);
      }
      if (payment.method === "store_credit" && customer) {
        if (gt(payment.amount, String(customer.store_credit))) {
          throw BusinessRuleError(
            "Insufficient store credit.",
            "STORE_CREDIT_INSUFFICIENT",
          );
        }
        await tx
          .update(customers)
          .set({
            store_credit: sub(String(customer.store_credit), payment.amount),
          })
          .where(eq(customers.id, customer.id));
      }

      await tx.insert(salePayments).values({
        tenant_id: ctx.business.id,
        branch_id: storeId,
        invoice_id: invoice.id,
        customer_id: customer?.id ?? null,
        method: payment.method,
        amount: dec(payment.amount),
        tendered_amount: payment.tenderedAmount
          ? dec(payment.tenderedAmount)
          : null,
        change_amount: payment.method === "cash" ? changeAmount : null,
        reference: payment.reference ?? null,
        created_by: ctx.user.id,
      });
    }

    /* Receivable for the unpaid balance. */
    if (customer) {
      if (isPositive(balanceAmount)) {
        await postCustomerLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
          customerId: customer.id,
          storeId,
          amount: balanceAmount,
          kind: "invoice",
          referenceType: "sales_invoice",
          referenceId: invoice.id,
          referenceNumber: invoiceNumber,
        });
      }
      await recordCustomerPurchase(
        tx,
        customer.id,
        totals.grandTotal,
        invoice.invoice_date,
      );
    }

    /* Loyalty: redeem first, then earn on the net total. */
    let loyaltyEarned = "0.0000";
    if (customer && loyaltyEnabled) {
      if (isPositive(redeemPoints)) {
        await postLoyalty(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
          customerId: customer.id,
          points: mul(redeemPoints, "-1"),
          kind: "redeem",
          referenceType: "sales_invoice",
          referenceId: invoice.id,
        });
      }
      loyaltyEarned = calculateLoyaltyPoints(totals.grandTotal, pointsPerHundred);
      if (isPositive(loyaltyEarned)) {
        await postLoyalty(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
          customerId: customer.id,
          points: loyaltyEarned,
          kind: "earn",
          referenceType: "sales_invoice",
          referenceId: invoice.id,
        });
        await tx
          .update(salesInvoices)
          .set({ loyalty_points_earned: loyaltyEarned })
          .where(eq(salesInvoices.id, invoice.id));
      }
    }

    /* POS session running totals. */
    if (input.posSessionId) {
      await tx
        .update(posSessions)
        .set({
          total_sales: sql`${posSessions.total_sales} + ${totals.grandTotal}`,
          expected_cash: sql`${posSessions.expected_cash} + ${cashRecorded}`,
          transaction_count: sql`${posSessions.transaction_count} + 1`,
          updated_at: new Date(),
        })
        .where(eq(posSessions.id, input.posSessionId));
    }

    await auditEvent(
      ctx,
      {
        event: "SaleCompleted",
        moduleSlug: "sales",
        entityType: "sales_invoice",
        entityId: invoice.id,
        summary: `Sale ${invoiceNumber} for ${totals.grandTotal}`,
        payload: {
          invoice_number: invoiceNumber,
          grand_total: totals.grandTotal,
          items: computed.length,
          customer: customer?.name ?? "Walk-in",
          discount_percent: appliedDiscount,
        },
        storeId,
      },
      tx,
    );

    return {
      invoiceId: invoice.id,
      invoiceNumber,
      grandTotal: totals.grandTotal,
      paidAmount: dec(paidAmount),
      balanceAmount: dec(balanceAmount),
      changeAmount,
      loyaltyEarned,
    };
  });

  // Notifications are emitted after commit so a delivery failure cannot roll
  // back a completed sale.
  await notifyLowStockAfterSale(ctx, computed.map((c) => c.product.id), input.warehouseId);

  return result;
}

function effectiveUnitPrice(
  product: typeof products.$inferSelect,
  useWholesale: boolean,
): string {
  const now = new Date();
  if (product.discount_price && isPositive(String(product.discount_price))) {
    const startsOk =
      !product.discount_starts_at || product.discount_starts_at <= now;
    const endsOk = !product.discount_ends_at || product.discount_ends_at >= now;
    if (startsOk && endsOk) return dec(String(product.discount_price));
  }
  if (
    useWholesale &&
    product.wholesale_price &&
    isPositive(String(product.wholesale_price))
  ) {
    return dec(String(product.wholesale_price));
  }
  return dec(String(product.selling_price));
}

async function currentAverageCost(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  warehouseId: string,
  productId: string,
  fallback: string,
): Promise<string> {
  const { stockFor } = await import("./inventory");
  const snapshot = await stockFor(businessId, warehouseId, productId, tx);
  return isPositive(snapshot.averageCost) ? snapshot.averageCost : dec(fallback);
}

async function redeemGiftCard(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ctx: BusinessContext,
  payment: SalePaymentInput,
  invoiceId: string,
): Promise<void> {
  if (!payment.giftCardCode) {
    throw ValidationError("Gift card code is required.");
  }

  const [card] = await tx
    .select()
    .from(giftCards)
    .where(
      and(
        eq(giftCards.tenant_id, ctx.business.id),
        eq(giftCards.code, payment.giftCardCode),
        eq(giftCards.is_active, true),
      ),
    )
    .limit(1)
    .for("update");

  if (!card) throw ValidationError("Gift card not found.");
  if (card.expires_at && card.expires_at < new Date()) {
    throw BusinessRuleError("Gift card has expired.", "GIFT_CARD_EXPIRED");
  }
  // Balance may never go negative (10-sales-pos.md § Business Rules).
  if (gt(payment.amount, String(card.balance))) {
    throw BusinessRuleError(
      `Gift card balance is ${dec(String(card.balance))}.`,
      "GIFT_CARD_INSUFFICIENT",
    );
  }

  const balanceAfter = sub(String(card.balance), payment.amount);
  await tx
    .update(giftCards)
    .set({ balance: balanceAfter, updated_at: new Date() })
    .where(eq(giftCards.id, card.id));

  await tx.insert(giftCardTransactions).values({
    tenant_id: ctx.business.id,
    gift_card_id: card.id,
    amount: mul(payment.amount, "-1"),
    balance_after: balanceAfter,
    kind: "redeem",
    reference_type: "sales_invoice",
    reference_id: invoiceId,
    created_by: ctx.user.id,
  });
}

async function notifyLowStockAfterSale(
  ctx: BusinessContext,
  productIds: string[],
  warehouseId: string,
): Promise<void> {
  try {
    const settings = await loadSettings({ businessId: ctx.business.id });
    if (!readBoolean(settings, "inventory.low_stock_alerts")) return;

    const { stockMap } = await import("./inventory");
    const [levels, productRows] = await Promise.all([
      stockMap(ctx.business.id, warehouseId, productIds),
      db
        .select({ id: products.id, name: products.name, min: products.min_stock })
        .from(products)
        .where(inArray(products.id, productIds)),
    ]);

    for (const p of productRows) {
      const snapshot = levels.get(p.id);
      if (!snapshot) continue;
      const min = String(p.min);
      if (!isPositive(min)) continue;
      if (gte(min, snapshot.available)) {
        await emit({
          businessId: ctx.business.id,
          event: "LowStockDetected",
          moduleSlug: "inventory",
          storeId: ctx.activeStore?.id ?? null,
          title: "Low stock",
          body: `${p.name} is down to ${dec(snapshot.available)} (minimum ${dec(min)}).`,
          actionUrl: "/inventory?filter=low_stock",
          priority: "high",
          fallbackPermission: "inventory.adjust",
        });
      }
    }
  } catch (error) {
    // A notification problem must never surface as a failed sale.
    console.error("[sales] low stock notification failed", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Additional payment against an existing invoice                             */
/* -------------------------------------------------------------------------- */

export async function recordSalePayment(
  ctx: BusinessContext,
  input: {
    invoiceId: string;
    method: PaymentMethod;
    amount: string;
    reference?: string;
    note?: string;
  },
): Promise<{ paidAmount: string; balanceAmount: string }> {
  if (!isPositive(input.amount)) {
    throw ValidationError("Payment amount must be greater than zero.");
  }

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.id, input.invoiceId),
          eq(salesInvoices.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!invoice) throw ValidationError("Invoice not found.");
    if (invoice.status === "cancelled") {
      throw BusinessRuleError(
        "Cannot record a payment against a cancelled invoice.",
        "INVOICE_CANCELLED",
      );
    }

    const balance = String(invoice.balance_amount);
    if (gt(input.amount, balance)) {
      throw ValidationError(
        `Payment exceeds the outstanding balance of ${dec(balance)}.`,
      );
    }

    const paidAmount = add(String(invoice.paid_amount), input.amount);
    const balanceAmount = sub(String(invoice.grand_total), paidAmount);

    await tx.insert(salePayments).values({
      tenant_id: ctx.business.id,
      branch_id: invoice.branch_id,
      invoice_id: invoice.id,
      customer_id: invoice.customer_id,
      method: input.method,
      amount: dec(input.amount),
      reference: input.reference ?? null,
      note: input.note ?? null,
      created_by: ctx.user.id,
    });

    await tx
      .update(salesInvoices)
      .set({
        paid_amount: paidAmount,
        balance_amount: balanceAmount,
        payment_status: isZero(balanceAmount) ? "paid" : "partially_paid",
        updated_at: new Date(),
      })
      .where(eq(salesInvoices.id, invoice.id));

    if (invoice.customer_id) {
      await postCustomerLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
        customerId: invoice.customer_id,
        storeId: invoice.branch_id,
        amount: mul(input.amount, "-1"),
        kind: "payment",
        referenceType: "sales_invoice",
        referenceId: invoice.id,
        referenceNumber: invoice.invoice_number,
      });
    }

    await auditEvent(
      ctx,
      {
        event: "PaymentReceived",
        moduleSlug: "sales",
        entityType: "sales_invoice",
        entityId: invoice.id,
        summary: `Payment of ${dec(input.amount)} on ${invoice.invoice_number}`,
        payload: { method: input.method, amount: dec(input.amount) },
      },
      tx,
    );

    return { paidAmount, balanceAmount };
  });
}

/* -------------------------------------------------------------------------- */
/* Returns                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReturnLineInput {
  invoiceItemId: string;
  quantity: string;
}

export async function createSalesReturn(
  ctx: BusinessContext,
  input: {
    invoiceId: string;
    lines: ReturnLineInput[];
    reason?: string;
    refundMethod?: PaymentMethod;
    restock?: boolean;
    note?: string;
  },
): Promise<{ returnId: string; returnNumber: string; refundAmount: string }> {
  if (!input.lines?.length) {
    throw ValidationError("Select at least one item to return.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }

  const settings = await loadSettings({ businessId: ctx.business.id });
  const loyaltyEnabled = readBoolean(settings, "sales.loyalty_enabled");
  const restock = input.restock ?? true;

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.id, input.invoiceId),
          eq(salesInvoices.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!invoice) throw ValidationError("Invoice not found.");
    if (invoice.status === "cancelled") {
      throw BusinessRuleError(
        "Cannot return against a cancelled invoice.",
        "INVOICE_CANCELLED",
      );
    }

    const items = await tx
      .select()
      .from(salesInvoiceItems)
      .where(eq(salesInvoiceItems.invoice_id, invoice.id));
    const byId = new Map(items.map((i) => [i.id, i]));

    const returnNumber = await nextNumber(ctx.business.id, "sales_return", {
      storeId: invoice.branch_id,
      client: tx,
    });

    let subtotal = "0.0000";
    let taxTotal = "0.0000";
    const movements: Parameters<typeof postMovements>[2] = [];
    const lineRows: (typeof salesReturnItems.$inferInsert)[] = [];

    for (const line of input.lines) {
      const item = byId.get(line.invoiceItemId);
      if (!item) throw ValidationError("Invoice line not found.");
      if (!isPositive(line.quantity)) {
        throw ValidationError("Return quantity must be greater than zero.");
      }

      const alreadyReturned = String(item.quantity_returned);
      const remaining = sub(String(item.quantity), alreadyReturned);
      if (gt(line.quantity, remaining)) {
        throw BusinessRuleError(
          `Only ${dec(remaining)} of ${item.product_name} remains returnable.`,
          "RETURN_QUANTITY_EXCEEDED",
        );
      }

      // Refund proportionally to what was actually charged for the line.
      const unitNet = Number(item.quantity) === 0
        ? "0.0000"
        : dec(Number(item.line_total) / Number(item.quantity));
      const lineTotal = mul(unitNet, line.quantity);
      const unitTax = Number(item.quantity) === 0
        ? "0.0000"
        : dec(Number(item.tax_amount) / Number(item.quantity));
      const lineTax = mul(unitTax, line.quantity);

      subtotal = add(subtotal, sub(lineTotal, lineTax));
      taxTotal = add(taxTotal, lineTax);

      lineRows.push({
        return_id: "", // set after the parent insert
        invoice_item_id: item.id,
        product_id: item.product_id,
        quantity: dec(line.quantity),
        unit_price: String(item.unit_price),
        unit_cost: String(item.unit_cost),
        tax_rate: String(item.tax_rate),
        tax_amount: lineTax,
        line_total: lineTotal,
      });

      await tx
        .update(salesInvoiceItems)
        .set({ quantity_returned: add(alreadyReturned, line.quantity) })
        .where(eq(salesInvoiceItems.id, item.id));

      // Returned goods come back as sellable stock, or as damaged when not.
      movements.push({
        productId: item.product_id,
        storeId: invoice.branch_id,
        warehouseId: invoice.warehouse_id,
        type: "sale_return",
        state: restock ? "available" : "damaged",
        quantity: dec(line.quantity),
        unitCost: String(item.unit_cost),
        referenceType: "sales_return",
        referenceNumber: returnNumber,
        reason: input.reason ?? "Sales return",
      });
    }

    const grandTotal = add(subtotal, taxTotal);

    const [returnRow] = await tx
      .insert(salesReturns)
      .values({
        tenant_id: ctx.business.id,
        branch_id: invoice.branch_id,
        warehouse_id: invoice.warehouse_id,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        return_number: returnNumber,
        status: "completed",
        reason: input.reason ?? "customer_request",
        subtotal,
        tax_amount: taxTotal,
        grand_total: grandTotal,
        refund_method: input.refundMethod ?? "cash",
        refund_amount: grandTotal,
        restock,
        note: input.note ?? null,
        posted_at: new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    await tx
      .insert(salesReturnItems)
      .values(lineRows.map((r) => ({ ...r, return_id: returnRow.id })));

    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: true },
      movements.map((m) => ({ ...m, referenceId: returnRow.id })),
    );

    /* Refund cannot exceed what was paid (10-sales-pos.md). */
    const refundable = sub(String(invoice.paid_amount), String(invoice.refunded_amount));
    const cashRefund = gt(grandTotal, refundable) ? refundable : grandTotal;
    const creditRelief = sub(grandTotal, cashRefund);

    if (isPositive(cashRefund)) {
      await tx.insert(salePayments).values({
        tenant_id: ctx.business.id,
        branch_id: invoice.branch_id,
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        method: input.refundMethod ?? "cash",
        amount: mul(cashRefund, "-1"),
        is_refund: true,
        reference: returnNumber,
        created_by: ctx.user.id,
      });
    }

    // Any part of the return covering an unpaid balance reduces the receivable.
    if (isPositive(creditRelief) && invoice.customer_id) {
      await postCustomerLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
        customerId: invoice.customer_id,
        storeId: invoice.branch_id,
        amount: mul(creditRelief, "-1"),
        kind: "refund",
        referenceType: "sales_return",
        referenceId: returnRow.id,
        referenceNumber: returnNumber,
      });
    }

    const returnedTotal = add(String(invoice.refunded_amount), grandTotal);
    const fullyReturned = gte(returnedTotal, String(invoice.grand_total));

    await tx
      .update(salesInvoices)
      .set({
        refunded_amount: returnedTotal,
        balance_amount: isPositive(creditRelief)
          ? sub(String(invoice.balance_amount), creditRelief)
          : String(invoice.balance_amount),
        status: fullyReturned ? "returned" : "partially_returned",
        updated_at: new Date(),
      })
      .where(eq(salesInvoices.id, invoice.id));

    /* Loyalty earned on the original sale is reversed proportionally. */
    if (invoice.customer_id && loyaltyEnabled && isPositive(String(invoice.loyalty_points_earned))) {
      const proportion = Number(invoice.grand_total) === 0
        ? 0
        : Number(grandTotal) / Number(invoice.grand_total);
      const reverse = dec(
        Math.floor(Number(invoice.loyalty_points_earned) * proportion),
      );
      if (isPositive(reverse)) {
        await postLoyalty(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
          customerId: invoice.customer_id,
          points: mul(reverse, "-1"),
          kind: "reverse",
          referenceType: "sales_return",
          referenceId: returnRow.id,
          note: "Reversed on return",
        });
      }
    }

    if (invoice.pos_session_id) {
      await tx
        .update(posSessions)
        .set({
          total_refunds: sql`${posSessions.total_refunds} + ${grandTotal}`,
          updated_at: new Date(),
        })
        .where(eq(posSessions.id, invoice.pos_session_id));
    }

    await auditEvent(
      ctx,
      {
        event: "SaleReturned",
        moduleSlug: "sales",
        entityType: "sales_return",
        entityId: returnRow.id,
        summary: `Return ${returnNumber} against ${invoice.invoice_number}`,
        payload: { grand_total: grandTotal, restock, reason: input.reason },
      },
      tx,
    );

    return { returnId: returnRow.id, returnNumber, refundAmount: grandTotal };
  });
}

/* -------------------------------------------------------------------------- */
/* Cancellation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Cancels an invoice and reverses its stock movements.
 * The invoice row is retained — history is never deleted.
 */
export async function cancelSale(
  ctx: BusinessContext,
  invoiceId: string,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(salesInvoices)
      .where(
        and(
          eq(salesInvoices.id, invoiceId),
          eq(salesInvoices.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!invoice) throw ValidationError("Invoice not found.");
    if (invoice.status === "cancelled") {
      throw BusinessRuleError("Invoice is already cancelled.", "ALREADY_CANCELLED");
    }
    if (invoice.status === "returned" || invoice.status === "partially_returned") {
      throw BusinessRuleError(
        "This invoice has returns against it and cannot be cancelled.",
        "HAS_RETURNS",
      );
    }

    const items = await tx
      .select()
      .from(salesInvoiceItems)
      .where(eq(salesInvoiceItems.invoice_id, invoice.id));

    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: true },
      items.map((i) => ({
        productId: i.product_id,
        storeId: invoice.branch_id,
        warehouseId: invoice.warehouse_id,
        type: "sale_return" as const,
        quantity: dec(String(i.quantity)),
        unitCost: String(i.unit_cost),
        referenceType: "sales_invoice_cancellation",
        referenceId: invoice.id,
        referenceNumber: invoice.invoice_number,
        reason: "Invoice cancelled",
      })),
    );

    // Release the receivable created by the sale.
    if (invoice.customer_id && isPositive(String(invoice.balance_amount))) {
      await postCustomerLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
        customerId: invoice.customer_id,
        storeId: invoice.branch_id,
        amount: mul(String(invoice.balance_amount), "-1"),
        kind: "adjustment",
        referenceType: "sales_invoice",
        referenceId: invoice.id,
        referenceNumber: invoice.invoice_number,
        note: "Invoice cancelled",
      });
    }

    await tx
      .update(salesInvoices)
      .set({
        status: "cancelled",
        payment_status: "cancelled",
        balance_amount: "0",
        cancelled_at: new Date(),
        cancel_reason: reason,
        updated_at: new Date(),
      })
      .where(eq(salesInvoices.id, invoice.id));

    await auditEvent(
      ctx,
      {
        event: "SaleCancelled",
        moduleSlug: "sales",
        entityType: "sales_invoice",
        entityId: invoice.id,
        summary: `Cancelled ${invoice.invoice_number}`,
        payload: { reason },
      },
      tx,
    );
  });
}
