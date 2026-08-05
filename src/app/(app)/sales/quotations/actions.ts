"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { warehouses } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  convertQuotation,
  saveQuotation,
  setQuotationStatus,
  type QuotationLineInput,
} from "@/lib/services/quotations";
import {
  failure,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/**
 * Lines arrive as parallel arrays from the form, which keeps the client simple.
 * Rows with no product or a non-positive quantity are dropped rather than
 * rejected, so an untouched blank row never blocks a save.
 */
function readLines(form: FormData): QuotationLineInput[] {
  const productIds = form.getAll("line_product_id").map(String);
  const quantities = form.getAll("line_quantity").map(String);
  const prices = form.getAll("line_unit_price").map(String);

  const lines: QuotationLineInput[] = [];
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const quantity = quantities[i] ?? "";
    if (!productId || Number(quantity) <= 0) continue;
    const unitPrice = prices[i] ?? "";
    lines.push({
      productId,
      quantity,
      unitPrice: unitPrice === "" ? undefined : unitPrice,
    });
  }
  return lines;
}

export async function submitQuotation(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.create", {
      feature: "sales.quotations",
    });

    const lines = readLines(form);
    if (lines.length === 0) {
      return failure("Add at least one item with a quantity.");
    }

    const validUntilRaw = str(form, "valid_until");
    const result = await saveQuotation(ctx, {
      id: uuid(form, "id") ?? undefined,
      customerId: uuid(form, "customer_id"),
      lines,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
      note: optionalStr(form, "note") ?? undefined,
    });

    revalidate("/sales/quotations", "/sales");
    return success(
      undefined,
      `Quotation ${result.quotationNumber} saved for ${result.grandTotal}.`,
    );
  });
}

export async function changeQuotationStatus(
  quotationId: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.update", {
      feature: "sales.quotations",
    });
    await setQuotationStatus(ctx, quotationId, status);
    revalidate("/sales/quotations");
    return success(undefined, `Quotation marked ${status}.`);
  });
}

export async function convertToInvoice(
  quotationId: string,
): Promise<ActionResult<{ invoiceId: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.create", {
      feature: "sales.quotations",
    });
    if (!ctx.activeStore) return failure("No store selected.");

    // Conversion has to draw stock from somewhere; the store's default
    // warehouse is the only sensible choice without asking.
    const [warehouse] = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenant_id, ctx.business.id),
          eq(warehouses.branch_id, ctx.activeStore.id),
          eq(warehouses.is_active, true),
        ),
      )
      .orderBy(warehouses.is_default)
      .limit(1);

    if (!warehouse) {
      return failure(
        "This store has no active warehouse, so stock cannot be issued.",
      );
    }

    const result = await convertQuotation(ctx, quotationId, {
      warehouseId: warehouse.id,
    });

    revalidate("/sales/quotations", "/sales", "/inventory", "/dashboard");
    return success(
      { invoiceId: result.invoiceId },
      `Quotation ${result.quotationNumber} converted to invoice ${result.invoiceNumber}.`,
    );
  });
}
