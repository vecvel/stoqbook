import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  products,
  quotationItems,
  quotations,
  taxGroups,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/authz/errors";

import { auditEvent } from "./audit";
import { nextNumber } from "./numbering";
import {
  computeDocument,
  computeLine,
  effectivePrice,
  type DiscountType,
  type LineTotals,
} from "./pricing";
import { createSale, type CreateSaleResult } from "./sales";
import { loadSettings, readBoolean } from "./settings";

/**
 * Quotations.
 *
 * A quotation is a priced offer with no financial or stock effect — it touches
 * neither the ledger nor inventory (10-sales-pos.md § Sales Flow). Only
 * conversion to an invoice does that, and conversion delegates to `createSale`
 * so a converted quotation follows exactly the same rules as any other sale.
 */

export interface QuotationLineInput {
  productId: string;
  quantity: string;
  /** Omit to use the product's effective price. */
  unitPrice?: string;
  discountType?: DiscountType;
  discountValue?: string;
}

export interface SaveQuotationInput {
  /** Omit to create; supply to replace an existing draft. */
  id?: string;
  customerId?: string | null;
  lines: QuotationLineInput[];
  discountType?: DiscountType;
  discountValue?: string;
  /** Defaults to the `sales.quotation_validity_days` setting. */
  validUntil?: Date | null;
  note?: string;
}

export interface SaveQuotationResult {
  quotationId: string;
  quotationNumber: string;
  grandTotal: string;
}

export async function saveQuotation(
  ctx: BusinessContext,
  input: SaveQuotationInput,
): Promise<SaveQuotationResult> {
  if (!input.lines || input.lines.length === 0) {
    throw ValidationError("A quotation must contain at least one item.");
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
  const roundOff = readBoolean(settings, "sales.round_off");

  /* ---- Products -------------------------------------------------------- */

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
      and(
        eq(products.tenant_id, ctx.business.id),
        inArray(products.id, productIds),
      ),
    );

  const byId = new Map(productRows.map((r) => [r.product.id, r]));
  for (const id of productIds) {
    if (!byId.get(id)) throw ValidationError("One or more products no longer exist.");
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

  const useWholesale = customer?.type === "wholesale";

  /* ---- Line maths ------------------------------------------------------ */

  const computed = input.lines.map((line) => {
    const row = byId.get(line.productId)!;
    const unitPrice =
      line.unitPrice ??
      effectivePrice(row.product, { useWholesale });
    const taxRate = row.taxRate ?? "0";

    const totals = computeLine({
      quantity: line.quantity,
      unitPrice,
      discountType: line.discountType,
      discountValue: line.discountValue,
      taxRate,
      taxMode: row.taxMode ?? "exclusive",
    });

    return { line, product: row.product, unitPrice, taxRate, totals };
  });

  const document = computeDocument({
    lines: computed.map((c) => c.totals) as LineTotals[],
    discountType: input.discountType,
    discountValue: input.discountValue,
    roundOff,
  });

  const validityDays = Number(
    settings["sales.quotation_validity_days"] ?? 15,
  );
  const validUntil =
    input.validUntil ??
    new Date(Date.now() + Math.max(1, validityDays) * 86_400_000);

  /* ---- Persist --------------------------------------------------------- */

  return db.transaction(async (tx) => {
    let quotationId = input.id ?? null;
    let quotationNumber: string;

    if (quotationId) {
      const [existing] = await tx
        .select()
        .from(quotations)
        .where(
          and(
            eq(quotations.id, quotationId),
            eq(quotations.tenant_id, ctx.business.id),
          ),
        )
        .limit(1);
      if (!existing) throw NotFoundError("Quotation not found.");
      // A quotation that has become an invoice is history and must not change.
      if (existing.converted_invoice_id) {
        throw BusinessRuleError(
          "This quotation has already been converted and cannot be edited.",
          "QUOTATION_CONVERTED",
        );
      }

      quotationNumber = existing.quotation_number;
      await tx
        .update(quotations)
        .set({
          customer_id: input.customerId ?? null,
          quotation_date: new Date(),
          valid_until: validUntil,
          subtotal: document.subtotal,
          discount_amount: document.discountAmount,
          tax_amount: document.taxAmount,
          grand_total: document.grandTotal,
          note: input.note ?? null,
          updated_at: new Date(),
          updated_by: ctx.user.id,
        })
        .where(eq(quotations.id, quotationId));

      // Lines are replaced wholesale — a quotation is small and this keeps the
      // stored lines exactly consistent with the recomputed totals.
      await tx.delete(quotationItems).where(eq(quotationItems.quotation_id, quotationId));
    } else {
      quotationNumber = await nextNumber(ctx.business.id, "quotation", {
        storeId,
        client: tx,
      });

      const [created] = await tx
        .insert(quotations)
        .values({
          tenant_id: ctx.business.id,
          branch_id: storeId,
          customer_id: input.customerId ?? null,
          quotation_number: quotationNumber,
          status: "draft",
          quotation_date: new Date(),
          valid_until: validUntil,
          subtotal: document.subtotal,
          discount_amount: document.discountAmount,
          tax_amount: document.taxAmount,
          grand_total: document.grandTotal,
          note: input.note ?? null,
          created_by: ctx.user.id,
        })
        .returning();
      quotationId = created.id;
    }

    await tx.insert(quotationItems).values(
      computed.map((c) => ({
        quotation_id: quotationId!,
        product_id: c.product.id,
        product_name: c.product.name,
        product_sku: c.product.sku,
        quantity: c.line.quantity,
        unit_price: c.unitPrice,
        discount_amount: c.totals.discountAmount,
        tax_rate: c.taxRate,
        tax_amount: c.totals.taxAmount,
        line_total: c.totals.total,
      })),
    );

    await auditEvent(
      ctx,
      {
        event: input.id ? "QuotationUpdated" : "QuotationCreated",
        moduleSlug: "sales",
        entityType: "quotation",
        entityId: quotationId!,
        summary: `Quotation ${quotationNumber} for ${document.grandTotal}`,
        payload: { lines: computed.length, customer_id: input.customerId ?? null },
      },
      tx,
    );

    return {
      quotationId: quotationId!,
      quotationNumber,
      grandTotal: document.grandTotal,
    };
  });
}

/** Marks a quotation sent, accepted, rejected or expired. */
export async function setQuotationStatus(
  ctx: BusinessContext,
  quotationId: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<void> {
  const quotation = await loadQuotation(ctx, quotationId);
  if (quotation.converted_invoice_id) {
    throw BusinessRuleError(
      "This quotation has already been converted.",
      "QUOTATION_CONVERTED",
    );
  }

  await db
    .update(quotations)
    .set({ status, updated_at: new Date(), updated_by: ctx.user.id })
    .where(eq(quotations.id, quotationId));

  await auditEvent(ctx, {
    event: "QuotationStatusChanged",
    moduleSlug: "sales",
    entityType: "quotation",
    entityId: quotationId,
    summary: `Quotation ${quotation.quotation_number} marked ${status}`,
  });
}

export interface ConvertQuotationResult extends CreateSaleResult {
  quotationNumber: string;
}

/**
 * Converts a quotation into a sales invoice.
 *
 * The quotation's stored line prices are passed through explicitly so the
 * customer is billed what they were quoted, even if the catalogue price has
 * moved since. Everything else — stock, ledger, loyalty — is handled by
 * `createSale`, so there is one code path for creating an invoice.
 */
export async function convertQuotation(
  ctx: BusinessContext,
  quotationId: string,
  options: { warehouseId: string; dueDate?: Date | null } = { warehouseId: "" },
): Promise<ConvertQuotationResult> {
  const quotation = await loadQuotation(ctx, quotationId);

  if (quotation.converted_invoice_id) {
    throw BusinessRuleError(
      "This quotation has already been converted.",
      "QUOTATION_CONVERTED",
    );
  }
  if (quotation.status === "rejected" || quotation.status === "expired") {
    throw BusinessRuleError(
      `A ${quotation.status} quotation cannot be converted.`,
      "QUOTATION_NOT_CONVERTIBLE",
    );
  }
  if (quotation.valid_until && quotation.valid_until < new Date()) {
    throw BusinessRuleError(
      `Quotation ${quotation.quotation_number} expired on ${quotation.valid_until.toDateString()}. Revise it before converting.`,
      "QUOTATION_EXPIRED",
    );
  }

  const lines = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotation_id, quotationId));

  if (lines.length === 0) {
    throw BusinessRuleError("This quotation has no items.", "QUOTATION_EMPTY");
  }

  const sale = await createSale(ctx, {
    customerId: quotation.customer_id,
    warehouseId: options.warehouseId,
    channel: "phone_order",
    dueDate: options.dueDate ?? null,
    note: `Converted from quotation ${quotation.quotation_number}`,
    lines: lines.map((l) => ({
      productId: l.product_id,
      quantity: l.quantity,
      unitPrice: l.unit_price,
    })),
  });

  await db
    .update(quotations)
    .set({
      status: "converted",
      converted_invoice_id: sale.invoiceId,
      updated_at: new Date(),
      updated_by: ctx.user.id,
    })
    .where(eq(quotations.id, quotationId));

  await auditEvent(ctx, {
    event: "QuotationConverted",
    moduleSlug: "sales",
    entityType: "quotation",
    entityId: quotationId,
    summary: `Quotation ${quotation.quotation_number} converted to ${sale.invoiceNumber}`,
    payload: { invoice_id: sale.invoiceId },
  });

  return { ...sale, quotationNumber: quotation.quotation_number };
}

async function loadQuotation(ctx: BusinessContext, quotationId: string) {
  const [row] = await db
    .select()
    .from(quotations)
    .where(
      and(
        eq(quotations.id, quotationId),
        eq(quotations.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);
  if (!row) throw NotFoundError("Quotation not found.");
  return row;
}
