"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/authz/guard";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  createPurchaseOrder,
  receiveGoods,
  recordPurchaseInvoice,
  recordSupplierPayment,
  type ReceiptLineInput,
} from "@/lib/services/purchases";
import {
  dateOrNull,
  decimalStr,
  failure,
  revalidate,
  rows,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

export async function submitPurchaseOrder(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.create");

    const supplierId = uuid(form, "supplier_id");
    const warehouseId = uuid(form, "warehouse_id");
    if (!supplierId) return failure("Select a supplier.");
    if (!warehouseId) return failure("Select a receiving warehouse.");

    const lines = rows(form, "lines")
      .filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.product_id,
        quantity: r.quantity,
        unitPrice: r.unit_price || "0",
        discountType: (r.discount_value && Number(r.discount_value) > 0
          ? "percentage"
          : "none") as "percentage" | "none",
        discountValue: r.discount_value || "0",
      }));

    if (lines.length === 0) {
      return failure("Add at least one item with a quantity.");
    }

    const result = await createPurchaseOrder(ctx, {
      supplierId,
      warehouseId,
      lines,
      expectedDate: dateOrNull(form, "expected_date"),
      paymentTerms: str(form, "payment_terms") || undefined,
      shippingAmount: decimalStr(form, "shipping_amount"),
      otherCharges: decimalStr(form, "other_charges"),
      note: str(form, "note") || undefined,
    });

    revalidate("/purchases", "/suppliers", "/dashboard");
    redirect(`/purchases/${result.orderId}`);
  });
}

export async function decidePurchaseOrder(
  orderId: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.approve", {
      feature: "purchases.approvals",
    });
    await approvePurchaseOrder(ctx, orderId, decision, note);
    revalidate("/purchases", `/purchases/${orderId}`, "/dashboard");
    return success(undefined, `Purchase order ${decision}.`);
  });
}

export async function voidPurchaseOrder(
  orderId: string,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.cancel");
    await cancelPurchaseOrder(ctx, orderId, reason || "Cancelled by user");
    revalidate("/purchases", `/purchases/${orderId}`, "/dashboard");
    return success(undefined, "Purchase order cancelled.");
  });
}

/**
 * Posts a goods receipt. This is the only path that increases stock from a
 * purchase (09-purchases.md § Business Rules).
 */
export async function submitGoodsReceipt(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.receive", {
      feature: "purchases.receipts",
    });

    const orderId = uuid(form, "order_id");
    if (!orderId) return failure("Purchase order not found.");

    const lines: ReceiptLineInput[] = rows(form, "lines")
      .filter(
        (r) =>
          r.order_item_id &&
          (Number(r.quantity_received) > 0 || Number(r.quantity_rejected) > 0),
      )
      .map((r) => ({
        orderItemId: r.order_item_id,
        quantityReceived: r.quantity_received || "0",
        quantityRejected: r.quantity_rejected || "0",
        unitCost: r.unit_cost || undefined,
        batchNumber: r.batch_number || undefined,
        expiresOn: r.expires_on ? new Date(r.expires_on) : null,
      }));

    if (lines.length === 0) {
      return failure("Enter a received quantity for at least one line.");
    }

    const result = await receiveGoods(ctx, {
      orderId,
      lines,
      receiptDate: dateOrNull(form, "receipt_date") ?? undefined,
      challanNumber: str(form, "challan_number") || undefined,
      additionalCharges: decimalStr(form, "additional_charges"),
      note: str(form, "note") || undefined,
    });

    revalidate(
      "/purchases",
      `/purchases/${orderId}`,
      "/purchases/receipts",
      "/inventory",
      "/dashboard",
    );

    return success(
      undefined,
      `Goods receipt ${result.receiptNumber} posted. Stock updated.`,
    );
  });
}

export async function submitPurchaseInvoice(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.view", {
      feature: "purchases.invoices",
    });

    const supplierId = uuid(form, "supplier_id");
    if (!supplierId) return failure("Supplier not found.");

    const supplierInvoiceNumber = str(form, "supplier_invoice_number");
    if (!supplierInvoiceNumber) {
      return failure("Enter the supplier's invoice number.");
    }

    const result = await recordPurchaseInvoice(ctx, {
      supplierId,
      orderId: uuid(form, "order_id"),
      receiptId: uuid(form, "receipt_id"),
      supplierInvoiceNumber,
      invoiceDate: dateOrNull(form, "invoice_date") ?? undefined,
      dueDate: dateOrNull(form, "due_date"),
      subtotal: decimalStr(form, "subtotal"),
      discountAmount: decimalStr(form, "discount_amount"),
      taxAmount: decimalStr(form, "tax_amount"),
      freightAmount: decimalStr(form, "freight_amount"),
      otherCharges: decimalStr(form, "other_charges"),
      note: str(form, "note") || undefined,
    });

    revalidate("/purchases/invoices", "/suppliers", "/dashboard");
    return success(
      undefined,
      `Invoice ${result.invoiceNumber} recorded for ${Number(result.grandTotal).toFixed(2)}.`,
    );
  });
}

export async function submitSupplierPayment(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.payment", {
      feature: "purchases.payments",
    });

    const supplierId = uuid(form, "supplier_id");
    if (!supplierId) return failure("Supplier not found.");

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) {
      return failure("Enter an amount greater than zero.");
    }

    const result = await recordSupplierPayment(ctx, {
      supplierId,
      invoiceId: uuid(form, "invoice_id"),
      method: (str(form, "method") || "bank_transfer") as
        | "cash"
        | "card"
        | "upi"
        | "bank_transfer"
        | "cheque"
        | "wallet"
        | "online",
      amount,
      reference: str(form, "reference") || undefined,
      paidAt: dateOrNull(form, "paid_at") ?? undefined,
      note: str(form, "note") || undefined,
    });

    revalidate(
      "/purchases/invoices",
      "/suppliers",
      `/suppliers/${supplierId}`,
      "/dashboard",
    );
    return success(undefined, `Payment ${result.paymentNumber} recorded.`);
  });
}
