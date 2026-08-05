"use server";

import { requirePermission } from "@/lib/authz/guard";
import {
  cancelSale,
  createSalesReturn,
  recordSalePayment,
  type PaymentMethod,
} from "@/lib/services/sales";
import {
  bool,
  decimalStr,
  failure,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

export async function addPayment(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.update");

    const invoiceId = uuid(form, "invoice_id");
    if (!invoiceId) return failure("Invoice not found.");

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) {
      return failure("Enter an amount greater than zero.");
    }

    const result = await recordSalePayment(ctx, {
      invoiceId,
      method: (str(form, "method") || "cash") as PaymentMethod,
      amount,
      reference: str(form, "reference") || undefined,
      note: str(form, "note") || undefined,
    });

    revalidate("/sales", `/sales/${invoiceId}`, "/customers", "/dashboard");
    return success(
      undefined,
      Number(result.balanceAmount) === 0
        ? "Payment recorded — invoice fully settled."
        : `Payment recorded. ${Number(result.balanceAmount).toFixed(2)} still outstanding.`,
    );
  });
}

export async function submitReturn(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.return", {
      feature: "sales.returns",
    });

    const invoiceId = uuid(form, "invoice_id");
    if (!invoiceId) return failure("Invoice not found.");

    // Only lines with a positive quantity are returned.
    const lines: { invoiceItemId: string; quantity: string }[] = [];
    for (const [key, value] of form.entries()) {
      const match = key.match(/^return\[([0-9a-f-]+)\]$/i);
      if (!match) continue;
      const quantity = String(value).trim();
      if (quantity === "" || Number(quantity) <= 0) continue;
      lines.push({ invoiceItemId: match[1], quantity });
    }

    if (lines.length === 0) {
      return failure("Enter a quantity for at least one line.");
    }

    const result = await createSalesReturn(ctx, {
      invoiceId,
      lines,
      reason: str(form, "reason") || "customer_request",
      refundMethod: (str(form, "refund_method") || "cash") as PaymentMethod,
      restock: bool(form, "restock"),
      note: str(form, "note") || undefined,
    });

    revalidate(
      "/sales",
      `/sales/${invoiceId}`,
      "/sales/returns",
      "/inventory",
      "/dashboard",
    );

    return success(
      undefined,
      `Return ${result.returnNumber} completed. Refund ${Number(result.refundAmount).toFixed(2)}.`,
    );
  });
}

export async function voidSale(
  invoiceId: string,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.cancel");
    await cancelSale(ctx, invoiceId, reason || "Cancelled by user");
    revalidate("/sales", `/sales/${invoiceId}`, "/inventory", "/dashboard");
    return success(undefined, "Invoice cancelled and stock restored.");
  });
}
