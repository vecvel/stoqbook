import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  goodsReceiptItems,
  goodsReceipts,
  inventoryBatches,
  products,
  purchaseInvoices,
  purchaseOrderItems,
  purchaseOrders,
  purchaseReturnItems,
  purchaseReturns,
  supplierPayments,
  suppliers,
  taxGroups,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { BusinessRuleError, ValidationError } from "@/lib/authz/errors";
import {
  add,
  apportion,
  dec,
  div,
  gt,
  gte,
  isPositive,
  isZero,
  mul,
  sub,
} from "@/lib/money";
import { auditEvent } from "./audit";
import { postMovements } from "./inventory";
import { emit } from "./notifications";
import { nextNumber } from "./numbering";
import {
  assertSupplierOrderable,
  postSupplierLedger,
  recordSupplierPurchase,
} from "./partners";
import { computeDocument, computeLine, type DiscountType, type LineTotals } from "./pricing";
import { loadSettings, readBoolean, readNumber } from "./settings";

/**
 * Purchasing service.
 *
 * A purchase order never touches inventory. Stock only increases when a goods
 * receipt is posted (09-purchases.md § Business Rules).
 */

export interface PurchaseLineInput {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountType?: DiscountType;
  discountValue?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  lines: PurchaseLineInput[];
  orderDate?: Date;
  expectedDate?: Date | null;
  paymentTerms?: string;
  discountType?: DiscountType;
  discountValue?: string;
  shippingAmount?: string;
  otherCharges?: string;
  note?: string;
}

export async function createPurchaseOrder(
  ctx: BusinessContext,
  input: CreatePurchaseOrderInput,
): Promise<{ orderId: string; orderNumber: string; grandTotal: string; requiresApproval: boolean }> {
  if (!input.lines?.length) {
    throw ValidationError("A purchase order must contain at least one item.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }

  const storeId = ctx.activeStore.id;
  const settings = await loadSettings({ businessId: ctx.business.id, storeId });
  const approvalRequired = readBoolean(settings, "purchases.approval_required");
  const approvalThreshold = readNumber(settings, "purchases.approval_threshold", 0);

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.id, input.supplierId),
        eq(suppliers.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);
  if (!supplier) throw ValidationError("Supplier not found.");
  assertSupplierOrderable(supplier);

  const { computed, totals } = await priceLines(ctx, input.lines, {
    discountType: input.discountType,
    discountValue: input.discountValue,
    shippingAmount: input.shippingAmount,
    otherCharges: input.otherCharges,
  });

  // Approval is needed when enabled and the total crosses the threshold
  // (a threshold of 0 means every order needs approval).
  const requiresApproval =
    approvalRequired &&
    (approvalThreshold === 0 || gte(totals.grandTotal, String(approvalThreshold)));

  return db.transaction(async (tx) => {
    const orderNumber = await nextNumber(ctx.business.id, "purchase_order", {
      storeId,
      client: tx,
    });

    const [order] = await tx
      .insert(purchaseOrders)
      .values({
        tenant_id: ctx.business.id,
        store_id: storeId,
        warehouse_id: input.warehouseId,
        supplier_id: supplier.id,
        order_number: orderNumber,
        status: requiresApproval ? "pending_approval" : "approved",
        approval_status: requiresApproval ? "pending" : "not_required",
        order_date: input.orderDate ?? new Date(),
        expected_date: input.expectedDate ?? null,
        payment_terms:
          input.paymentTerms ?? supplier.payment_terms ?? null,
        subtotal: totals.subtotal,
        discount_type: input.discountType ?? "none",
        discount_value: dec(input.discountValue ?? "0"),
        discount_amount: totals.discountAmount,
        tax_amount: totals.taxAmount,
        shipping_amount: totals.shippingAmount,
        other_charges: totals.otherCharges,
        grand_total: totals.grandTotal,
        note: input.note ?? null,
        approved_by: requiresApproval ? null : ctx.user.id,
        approved_at: requiresApproval ? null : new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    await tx.insert(purchaseOrderItems).values(
      computed.map((c) => ({
        order_id: order.id,
        product_id: c.product.id,
        product_name: c.product.name,
        product_sku: c.product.sku,
        quantity_ordered: dec(c.line.quantity),
        unit_price: dec(c.line.unitPrice),
        discount_type: (c.line.discountType ?? "none") as DiscountType,
        discount_value: dec(c.line.discountValue ?? "0"),
        discount_amount: c.totals.discountAmount,
        tax_group_id: c.product.tax_group_id,
        tax_rate: c.taxRate,
        tax_amount: c.totals.taxAmount,
        line_subtotal: c.totals.subtotal,
        line_total: c.totals.total,
      })),
    );

    await auditEvent(
      ctx,
      {
        event: "PurchaseOrderCreated",
        moduleSlug: "purchases",
        entityType: "purchase_order",
        entityId: order.id,
        summary: `Purchase order ${orderNumber} for ${supplier.company_name}`,
        payload: {
          order_number: orderNumber,
          grand_total: totals.grandTotal,
          requires_approval: requiresApproval,
        },
      },
      tx,
    );

    if (requiresApproval) {
      await emit(
        {
          businessId: ctx.business.id,
          event: "PurchaseOrderCreated",
          moduleSlug: "purchases",
          storeId,
          title: "Purchase order awaiting approval",
          body: `${orderNumber} for ${supplier.company_name} totalling ${totals.grandTotal}.`,
          actionUrl: `/purchases/${order.id}`,
          priority: "high",
          fallbackPermission: "purchases.approve",
        },
        tx,
      );
    }

    return {
      orderId: order.id,
      orderNumber,
      grandTotal: totals.grandTotal,
      requiresApproval,
    };
  });
}

async function priceLines(
  ctx: BusinessContext,
  lines: PurchaseLineInput[],
  document: {
    discountType?: DiscountType;
    discountValue?: string;
    shippingAmount?: string;
    otherCharges?: string;
  },
) {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const rows = await db
    .select({ product: products, taxRate: taxGroups.rate, taxMode: taxGroups.mode })
    .from(products)
    .where(
      and(eq(products.tenant_id, ctx.business.id), inArray(products.id, productIds)),
    )
    .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id));

  const byId = new Map(rows.map((r) => [r.product.id, r]));

  const computed = lines.map((line) => {
    const row = byId.get(line.productId);
    if (!row) throw ValidationError("One or more products no longer exist.");
    if (!isPositive(line.quantity)) {
      throw ValidationError("Quantity must be greater than zero.");
    }

    const taxRate = dec(String(row.taxRate ?? "0"));
    const totals = computeLine({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountType: line.discountType ?? "none",
      discountValue: line.discountValue ?? "0",
      taxRate,
      taxMode: (row.taxMode ?? "exclusive") as "inclusive" | "exclusive",
    });

    return { line, product: row.product, taxRate, totals };
  });

  const totals = computeDocument({
    lines: computed.map((c) => c.totals),
    discountType: document.discountType,
    discountValue: document.discountValue,
    shippingAmount: document.shippingAmount,
    otherCharges: document.otherCharges,
  });

  return { computed, totals };
}

/* -------------------------------------------------------------------------- */
/* Approval                                                                   */
/* -------------------------------------------------------------------------- */

export async function approvePurchaseOrder(
  ctx: BusinessContext,
  orderId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, orderId),
          eq(purchaseOrders.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) throw ValidationError("Purchase order not found.");
    if (order.approval_status !== "pending") {
      throw BusinessRuleError(
        "This order is not awaiting approval.",
        "NOT_PENDING_APPROVAL",
      );
    }

    await tx
      .update(purchaseOrders)
      .set({
        approval_status: decision,
        status: decision === "approved" ? "approved" : "cancelled",
        approved_by: ctx.user.id,
        approved_at: new Date(),
        cancel_reason: decision === "rejected" ? (note ?? "Rejected") : null,
        cancelled_at: decision === "rejected" ? new Date() : null,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, order.id));

    await auditEvent(
      ctx,
      {
        event: decision === "approved" ? "PurchaseOrderApproved" : "PurchaseOrderCancelled",
        moduleSlug: "purchases",
        entityType: "purchase_order",
        entityId: order.id,
        summary: `${order.order_number} ${decision}`,
        payload: { note },
      },
      tx,
    );
  });
}

export async function cancelPurchaseOrder(
  ctx: BusinessContext,
  orderId: string,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, orderId),
          eq(purchaseOrders.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) throw ValidationError("Purchase order not found.");

    // Once goods have been received, a return is required rather than a cancel.
    if (
      order.status === "partially_received" ||
      order.status === "completed"
    ) {
      throw BusinessRuleError(
        "Goods have already been received against this order. Create a purchase return instead.",
        "ALREADY_RECEIVED",
      );
    }
    if (order.status === "cancelled") {
      throw BusinessRuleError("Order is already cancelled.", "ALREADY_CANCELLED");
    }

    await tx
      .update(purchaseOrders)
      .set({
        status: "cancelled",
        cancelled_at: new Date(),
        cancel_reason: reason,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, order.id));

    await auditEvent(
      ctx,
      {
        event: "PurchaseOrderCancelled",
        moduleSlug: "purchases",
        entityType: "purchase_order",
        entityId: order.id,
        summary: `Cancelled ${order.order_number}`,
        payload: { reason },
      },
      tx,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Goods receipt — the only inbound inventory path                             */
/* -------------------------------------------------------------------------- */

export interface ReceiptLineInput {
  orderItemId: string;
  quantityReceived: string;
  quantityRejected?: string;
  /** Overrides the ordered unit price when the landed cost differs. */
  unitCost?: string;
  batchNumber?: string;
  expiresOn?: Date | null;
}

export async function receiveGoods(
  ctx: BusinessContext,
  input: {
    orderId: string;
    lines: ReceiptLineInput[];
    receiptDate?: Date;
    challanNumber?: string;
    /** Freight etc. apportioned across lines to give true landed cost. */
    additionalCharges?: string;
    note?: string;
  },
): Promise<{ receiptId: string; receiptNumber: string; totalCost: string }> {
  if (!input.lines?.length) {
    throw ValidationError("Enter at least one received quantity.");
  }

  const settings = await loadSettings({ businessId: ctx.business.id });
  const allowOverReceipt = readBoolean(settings, "purchases.allow_over_receipt");

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, input.orderId),
          eq(purchaseOrders.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!order) throw ValidationError("Purchase order not found.");
    if (order.status === "cancelled") {
      throw BusinessRuleError(
        "A cancelled purchase order cannot be received.",
        "ORDER_CANCELLED",
      );
    }
    if (order.approval_status === "pending") {
      throw BusinessRuleError(
        "This order is still awaiting approval.",
        "PENDING_APPROVAL",
      );
    }

    const items = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.order_id, order.id));
    const byId = new Map(items.map((i) => [i.id, i]));

    const receiptNumber = await nextNumber(ctx.business.id, "goods_receipt", {
      storeId: order.store_id,
      client: tx,
    });

    /* Validate quantities and resolve base costs. */
    const prepared = input.lines
      .filter((l) => isPositive(l.quantityReceived) || isPositive(l.quantityRejected ?? "0"))
      .map((line) => {
        const item = byId.get(line.orderItemId);
        if (!item) throw ValidationError("Order line not found.");

        const outstanding = sub(
          String(item.quantity_ordered),
          String(item.quantity_received),
        );
        if (!allowOverReceipt && gt(line.quantityReceived, outstanding)) {
          throw BusinessRuleError(
            `Cannot receive ${dec(line.quantityReceived)} of ${item.product_name}; ` +
              `only ${dec(outstanding)} remains on order.`,
            "OVER_RECEIPT",
          );
        }

        // Net-of-discount unit price is the true purchase cost per unit.
        const netLine = sub(String(item.line_subtotal), String(item.discount_amount));
        const derivedUnitCost = isPositive(String(item.quantity_ordered))
          ? div(netLine, String(item.quantity_ordered))
          : dec(String(item.unit_price));

        return {
          line,
          item,
          baseUnitCost: line.unitCost ? dec(line.unitCost) : derivedUnitCost,
        };
      });

    if (prepared.length === 0) {
      throw ValidationError("Enter at least one received quantity.");
    }

    /* Apportion additional charges by line value so landed cost is exact. */
    const charges = dec(input.additionalCharges ?? "0");
    const weights = prepared.map((p) =>
      mul(p.baseUnitCost, p.line.quantityReceived),
    );
    const chargeShares = isPositive(charges)
      ? apportion(charges, weights)
      : prepared.map(() => "0.0000");

    let totalCost = "0.0000";
    const [receipt] = await tx
      .insert(goodsReceipts)
      .values({
        tenant_id: ctx.business.id,
        store_id: order.store_id,
        warehouse_id: order.warehouse_id,
        order_id: order.id,
        supplier_id: order.supplier_id,
        receipt_number: receiptNumber,
        receipt_date: input.receiptDate ?? new Date(),
        challan_number: input.challanNumber ?? null,
        note: input.note ?? null,
        received_by: ctx.user.id,
        created_by: ctx.user.id,
      })
      .returning();

    const movements: Parameters<typeof postMovements>[2] = [];

    for (const [index, p] of prepared.entries()) {
      const received = dec(p.line.quantityReceived);
      const rejected = dec(p.line.quantityRejected ?? "0");

      const landedUnitCost = isPositive(received)
        ? add(p.baseUnitCost, div(chargeShares[index], received))
        : p.baseUnitCost;
      const lineCost = mul(landedUnitCost, received);
      totalCost = add(totalCost, lineCost);

      /* Batch tracking. */
      let batchId: string | null = null;
      if (p.line.batchNumber) {
        const [batch] = await tx
          .insert(inventoryBatches)
          .values({
            tenant_id: ctx.business.id,
            product_id: p.item.product_id,
            batch_number: p.line.batchNumber,
            expires_on: p.line.expiresOn ?? null,
            unit_cost: landedUnitCost,
          })
          .onConflictDoUpdate({
            target: [
              inventoryBatches.tenant_id,
              inventoryBatches.product_id,
              inventoryBatches.batch_number,
            ],
            set: { unit_cost: landedUnitCost, updated_at: new Date() },
          })
          .returning();
        batchId = batch?.id ?? null;
      }

      await tx.insert(goodsReceiptItems).values({
        receipt_id: receipt.id,
        order_item_id: p.item.id,
        product_id: p.item.product_id,
        batch_id: batchId,
        quantity_received: received,
        quantity_rejected: rejected,
        unit_cost: landedUnitCost,
        total_cost: lineCost,
        batch_number: p.line.batchNumber ?? null,
        expires_on: p.line.expiresOn ?? null,
      });

      await tx
        .update(purchaseOrderItems)
        .set({
          quantity_received: add(String(p.item.quantity_received), received),
        })
        .where(eq(purchaseOrderItems.id, p.item.id));

      if (isPositive(received)) {
        movements.push({
          productId: p.item.product_id,
          storeId: order.store_id,
          warehouseId: order.warehouse_id,
          type: "purchase",
          quantity: received,
          unitCost: landedUnitCost,
          batchId,
          referenceType: "goods_receipt",
          referenceId: receipt.id,
          referenceNumber: receiptNumber,
          reason: "Goods received",
        });
      }
      // Rejected goods are held out of sellable stock pending return.
      if (isPositive(rejected)) {
        movements.push({
          productId: p.item.product_id,
          storeId: order.store_id,
          warehouseId: order.warehouse_id,
          type: "purchase",
          state: "pending_inspection",
          quantity: rejected,
          unitCost: landedUnitCost,
          batchId,
          referenceType: "goods_receipt",
          referenceId: receipt.id,
          referenceNumber: receiptNumber,
          reason: "Rejected on inspection",
        });
      }
    }

    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: true },
      movements,
    );

    await tx
      .update(goodsReceipts)
      .set({ total_cost: totalCost, posted_at: new Date() })
      .where(eq(goodsReceipts.id, receipt.id));

    /* Roll the order status forward. */
    const refreshed = await tx
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.order_id, order.id));

    const fullyReceived = refreshed.every((i) =>
      gte(String(i.quantity_received), String(i.quantity_ordered)),
    );
    const anyReceived = refreshed.some((i) => isPositive(String(i.quantity_received)));

    await tx
      .update(purchaseOrders)
      .set({
        status: fullyReceived
          ? "completed"
          : anyReceived
            ? "partially_received"
            : order.status,
        updated_at: new Date(),
      })
      .where(eq(purchaseOrders.id, order.id));

    /* Update the product cost so future margins reflect the latest purchase. */
    for (const p of prepared) {
      if (!isPositive(p.line.quantityReceived)) continue;
      await tx
        .update(products)
        .set({ cost_price: p.baseUnitCost, updated_at: new Date() })
        .where(eq(products.id, p.item.product_id));
    }

    await recordSupplierPurchase(tx, order.supplier_id, totalCost, new Date());

    await auditEvent(
      ctx,
      {
        event: "GoodsReceived",
        moduleSlug: "purchases",
        entityType: "goods_receipt",
        entityId: receipt.id,
        summary: `Received ${receiptNumber} against ${order.order_number}`,
        payload: { total_cost: totalCost, lines: prepared.length },
      },
      tx,
    );

    return { receiptId: receipt.id, receiptNumber, totalCost };
  });
}

/* -------------------------------------------------------------------------- */
/* Supplier invoice and payment                                               */
/* -------------------------------------------------------------------------- */

export async function recordPurchaseInvoice(
  ctx: BusinessContext,
  input: {
    supplierId: string;
    orderId?: string | null;
    receiptId?: string | null;
    supplierInvoiceNumber: string;
    invoiceDate?: Date;
    dueDate?: Date | null;
    subtotal: string;
    discountAmount?: string;
    taxAmount?: string;
    freightAmount?: string;
    otherCharges?: string;
    note?: string;
  },
): Promise<{ invoiceId: string; invoiceNumber: string; grandTotal: string }> {
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }
  const storeId = ctx.activeStore.id;

  const grandTotal = add(
    sub(dec(input.subtotal), dec(input.discountAmount ?? "0")),
    add(
      dec(input.taxAmount ?? "0"),
      add(dec(input.freightAmount ?? "0"), dec(input.otherCharges ?? "0")),
    ),
  );

  if (!isPositive(grandTotal)) {
    throw ValidationError("Invoice total must be greater than zero.");
  }

  return db.transaction(async (tx) => {
    const invoiceNumber = await nextNumber(ctx.business.id, "purchase_invoice", {
      storeId,
      client: tx,
    });

    const [invoice] = await tx
      .insert(purchaseInvoices)
      .values({
        tenant_id: ctx.business.id,
        store_id: storeId,
        supplier_id: input.supplierId,
        order_id: input.orderId ?? null,
        receipt_id: input.receiptId ?? null,
        supplier_invoice_number: input.supplierInvoiceNumber,
        invoice_number: invoiceNumber,
        invoice_date: input.invoiceDate ?? new Date(),
        due_date: input.dueDate ?? null,
        subtotal: dec(input.subtotal),
        discount_amount: dec(input.discountAmount ?? "0"),
        tax_amount: dec(input.taxAmount ?? "0"),
        freight_amount: dec(input.freightAmount ?? "0"),
        other_charges: dec(input.otherCharges ?? "0"),
        grand_total: grandTotal,
        balance_amount: grandTotal,
        payment_status: "unpaid",
        note: input.note ?? null,
        created_by: ctx.user.id,
      })
      .returning();

    await postSupplierLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
      supplierId: input.supplierId,
      storeId,
      amount: grandTotal,
      kind: "invoice",
      referenceType: "purchase_invoice",
      referenceId: invoice.id,
      referenceNumber: invoiceNumber,
    });

    await auditEvent(
      ctx,
      {
        event: "PurchaseInvoiceRecorded",
        moduleSlug: "purchases",
        entityType: "purchase_invoice",
        entityId: invoice.id,
        summary: `Supplier invoice ${input.supplierInvoiceNumber} for ${grandTotal}`,
        payload: { grand_total: grandTotal },
      },
      tx,
    );

    return { invoiceId: invoice.id, invoiceNumber, grandTotal };
  });
}

export async function recordSupplierPayment(
  ctx: BusinessContext,
  input: {
    supplierId: string;
    invoiceId?: string | null;
    method:
      | "cash"
      | "card"
      | "upi"
      | "bank_transfer"
      | "cheque"
      | "wallet"
      | "online";
    amount: string;
    reference?: string;
    paidAt?: Date;
    note?: string;
  },
): Promise<{ paymentId: string; paymentNumber: string }> {
  if (!isPositive(input.amount)) {
    throw ValidationError("Payment amount must be greater than zero.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }
  const storeId = ctx.activeStore.id;

  return db.transaction(async (tx) => {
    let invoice: typeof purchaseInvoices.$inferSelect | null = null;

    if (input.invoiceId) {
      const [row] = await tx
        .select()
        .from(purchaseInvoices)
        .where(
          and(
            eq(purchaseInvoices.id, input.invoiceId),
            eq(purchaseInvoices.tenant_id, ctx.business.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) throw ValidationError("Purchase invoice not found.");

      // Overpayment is rejected (09-purchases.md § Business Rules).
      if (gt(input.amount, String(row.balance_amount))) {
        throw ValidationError(
          `Payment exceeds the outstanding balance of ${dec(String(row.balance_amount))}.`,
        );
      }
      invoice = row;
    }

    const paymentNumber = await nextNumber(ctx.business.id, "supplier_payment", {
      storeId,
      client: tx,
    });

    const [payment] = await tx
      .insert(supplierPayments)
      .values({
        tenant_id: ctx.business.id,
        store_id: storeId,
        supplier_id: input.supplierId,
        invoice_id: invoice?.id ?? null,
        payment_number: paymentNumber,
        method: input.method,
        amount: dec(input.amount),
        reference: input.reference ?? null,
        paid_at: input.paidAt ?? new Date(),
        note: input.note ?? null,
        created_by: ctx.user.id,
      })
      .returning();

    if (invoice) {
      const paid = add(String(invoice.paid_amount), input.amount);
      const balance = sub(String(invoice.grand_total), paid);
      await tx
        .update(purchaseInvoices)
        .set({
          paid_amount: paid,
          balance_amount: balance,
          payment_status: isZero(balance) ? "paid" : "partially_paid",
          updated_at: new Date(),
        })
        .where(eq(purchaseInvoices.id, invoice.id));
    }

    await postSupplierLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
      supplierId: input.supplierId,
      storeId,
      amount: mul(input.amount, "-1"),
      kind: "payment",
      referenceType: "supplier_payment",
      referenceId: payment.id,
      referenceNumber: paymentNumber,
    });

    await auditEvent(
      ctx,
      {
        event: "SupplierPaymentRecorded",
        moduleSlug: "purchases",
        entityType: "supplier_payment",
        entityId: payment.id,
        summary: `Paid ${dec(input.amount)} to supplier`,
        payload: { method: input.method, amount: dec(input.amount) },
      },
      tx,
    );

    return { paymentId: payment.id, paymentNumber };
  });
}

/* -------------------------------------------------------------------------- */
/* Purchase returns (debit notes)                                             */
/* -------------------------------------------------------------------------- */

export async function createPurchaseReturn(
  ctx: BusinessContext,
  input: {
    supplierId: string;
    orderId?: string | null;
    warehouseId: string;
    reason?: string;
    lines: { productId: string; quantity: string; unitCost: string; taxRate?: string }[];
    note?: string;
  },
): Promise<{ returnId: string; returnNumber: string; grandTotal: string }> {
  if (!input.lines?.length) {
    throw ValidationError("Select at least one item to return.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }
  const storeId = ctx.activeStore.id;

  const lineTotals: LineTotals[] = input.lines.map((l) =>
    computeLine({
      quantity: l.quantity,
      unitPrice: l.unitCost,
      taxRate: l.taxRate ?? "0",
    }),
  );
  const totals = computeDocument({ lines: lineTotals });

  return db.transaction(async (tx) => {
    const returnNumber = await nextNumber(ctx.business.id, "purchase_return", {
      storeId,
      client: tx,
    });

    const [returnRow] = await tx
      .insert(purchaseReturns)
      .values({
        tenant_id: ctx.business.id,
        store_id: storeId,
        warehouse_id: input.warehouseId,
        supplier_id: input.supplierId,
        order_id: input.orderId ?? null,
        return_number: returnNumber,
        status: "completed",
        reason: input.reason ?? "damaged",
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        grand_total: totals.grandTotal,
        debit_note_number: returnNumber,
        note: input.note ?? null,
        posted_at: new Date(),
        approved_by: ctx.user.id,
        approved_at: new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    await tx.insert(purchaseReturnItems).values(
      input.lines.map((l, i) => ({
        return_id: returnRow.id,
        product_id: l.productId,
        quantity: dec(l.quantity),
        unit_cost: dec(l.unitCost),
        tax_rate: dec(l.taxRate ?? "0"),
        tax_amount: lineTotals[i].taxAmount,
        line_total: lineTotals[i].total,
      })),
    );

    // Returning goods to a supplier reduces stock.
    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: false },
      input.lines.map((l) => ({
        productId: l.productId,
        storeId,
        warehouseId: input.warehouseId,
        type: "purchase_return" as const,
        quantity: mul(l.quantity, "-1"),
        unitCost: dec(l.unitCost),
        referenceType: "purchase_return",
        referenceId: returnRow.id,
        referenceNumber: returnNumber,
        reason: input.reason ?? "Purchase return",
      })),
    );

    // A debit note reduces what we owe the supplier.
    await postSupplierLedger(tx, { businessId: ctx.business.id, userId: ctx.user.id }, {
      supplierId: input.supplierId,
      storeId,
      amount: mul(totals.grandTotal, "-1"),
      kind: "debit_note",
      referenceType: "purchase_return",
      referenceId: returnRow.id,
      referenceNumber: returnNumber,
    });

    await auditEvent(
      ctx,
      {
        event: "PurchaseReturned",
        moduleSlug: "purchases",
        entityType: "purchase_return",
        entityId: returnRow.id,
        summary: `Purchase return ${returnNumber}`,
        payload: { grand_total: totals.grandTotal, reason: input.reason },
      },
      tx,
    );

    return {
      returnId: returnRow.id,
      returnNumber,
      grandTotal: totals.grandTotal,
    };
  });
}
