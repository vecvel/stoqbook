import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  customerAddresses,
  customerLedger,
  customerNotes,
  customers,
  goodsReceipts,
  loyaltyTransactions,
  purchaseInvoices,
  purchaseOrders,
  purchaseReturns,
  quotations,
  salesInvoices,
  salesOrders,
  salesReturns,
  supplierAddresses,
  supplierContacts,
  supplierContracts,
  supplierLedger,
  supplierPayments,
  supplierProducts,
  suppliers,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { BusinessRuleError, NotFoundError, ValidationError } from "@/lib/authz/errors";
import { add } from "@/lib/money";

import { auditEvent } from "./audit";

/**
 * Merging duplicate partners (11-customers.md, 12-suppliers.md § Merge).
 *
 * History is never rewritten by deleting it: every child row is repointed at
 * the surviving record, balances and lifetime totals are summed, and the
 * duplicate is archived rather than removed. That keeps every invoice and
 * ledger line reachable from exactly one partner afterwards.
 */

export interface MergeResult {
  survivorId: string;
  survivorName: string;
  duplicateName: string;
  movedRows: number;
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                  */
/* -------------------------------------------------------------------------- */

export async function mergeCustomers(
  ctx: BusinessContext,
  input: { survivorId: string; duplicateId: string },
): Promise<MergeResult> {
  if (input.survivorId === input.duplicateId) {
    throw ValidationError("Pick two different customers.");
  }

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        sql`${customers.id} in (${input.survivorId}, ${input.duplicateId})`,
      ),
    );

  const survivor = rows.find((r) => r.id === input.survivorId);
  const duplicate = rows.find((r) => r.id === input.duplicateId);
  if (!survivor || !duplicate) throw NotFoundError("Customer not found.");

  // The walk-in customer is referenced by POS as a fixture and must survive.
  if (duplicate.is_walk_in) {
    throw BusinessRuleError(
      "The walk-in customer cannot be merged away — POS depends on it.",
      "WALK_IN_PROTECTED",
    );
  }

  return db.transaction(async (tx) => {
    let moved = 0;

    const repoint = async (
      table: typeof salesInvoices | typeof salesOrders | typeof salesReturns
        | typeof quotations | typeof customerAddresses | typeof customerLedger
        | typeof customerNotes | typeof loyaltyTransactions,
    ) => {
      const result = await tx
        .update(table)
        .set({ customer_id: input.survivorId })
        .where(eq(table.customer_id, input.duplicateId))
        .returning({ id: table.id });
      moved += result.length;
    };

    await repoint(salesInvoices);
    await repoint(salesOrders);
    await repoint(salesReturns);
    await repoint(quotations);
    await repoint(customerAddresses);
    await repoint(customerLedger);
    await repoint(customerNotes);
    await repoint(loyaltyTransactions);

    /* Balances are summed rather than recomputed: the ledger lines have just
       moved across, so the survivor now genuinely owes both amounts. */
    await tx
      .update(customers)
      .set({
        outstanding_balance: add(
          survivor.outstanding_balance,
          duplicate.outstanding_balance,
        ),
        store_credit: add(survivor.store_credit, duplicate.store_credit),
        loyalty_points: add(survivor.loyalty_points, duplicate.loyalty_points),
        loyalty_points_earned: add(
          survivor.loyalty_points_earned,
          duplicate.loyalty_points_earned,
        ),
        loyalty_points_redeemed: add(
          survivor.loyalty_points_redeemed,
          duplicate.loyalty_points_redeemed,
        ),
        total_purchases: add(survivor.total_purchases, duplicate.total_purchases),
        purchase_count: survivor.purchase_count + duplicate.purchase_count,
        last_purchase_at:
          !survivor.last_purchase_at ||
          (duplicate.last_purchase_at &&
            duplicate.last_purchase_at > survivor.last_purchase_at)
            ? duplicate.last_purchase_at
            : survivor.last_purchase_at,
        // Keep whichever contact details the survivor was missing.
        phone: survivor.phone ?? duplicate.phone,
        email: survivor.email ?? duplicate.email,
        tax_number: survivor.tax_number ?? duplicate.tax_number,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(customers.id, input.survivorId));

    await tx
      .update(customers)
      .set({
        status: "archived",
        outstanding_balance: "0",
        store_credit: "0",
        loyalty_points: "0",
        note: `Merged into ${survivor.name} (${survivor.code}).`,
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        updated_at: new Date(),
      })
      .where(eq(customers.id, input.duplicateId));

    await auditEvent(
      ctx,
      {
        event: "CustomersMerged",
        moduleSlug: "customers",
        entityType: "customer",
        entityId: input.survivorId,
        summary: `Merged ${duplicate.name} into ${survivor.name}`,
        payload: {
          duplicate_id: input.duplicateId,
          duplicate_code: duplicate.code,
          rows_moved: moved,
        },
      },
      tx,
    );

    return {
      survivorId: survivor.id,
      survivorName: survivor.name,
      duplicateName: duplicate.name,
      movedRows: moved,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Suppliers                                                                  */
/* -------------------------------------------------------------------------- */

export async function mergeSuppliers(
  ctx: BusinessContext,
  input: { survivorId: string; duplicateId: string },
): Promise<MergeResult> {
  if (input.survivorId === input.duplicateId) {
    throw ValidationError("Pick two different suppliers.");
  }

  const rows = await db
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenant_id, ctx.business.id),
        sql`${suppliers.id} in (${input.survivorId}, ${input.duplicateId})`,
      ),
    );

  const survivor = rows.find((r) => r.id === input.survivorId);
  const duplicate = rows.find((r) => r.id === input.duplicateId);
  if (!survivor || !duplicate) throw NotFoundError("Supplier not found.");

  return db.transaction(async (tx) => {
    let moved = 0;

    const repoint = async (
      table:
        | typeof purchaseOrders | typeof goodsReceipts | typeof purchaseInvoices
        | typeof purchaseReturns | typeof supplierAddresses
        | typeof supplierContacts | typeof supplierContracts
        | typeof supplierLedger | typeof supplierPayments,
    ) => {
      const result = await tx
        .update(table)
        .set({ supplier_id: input.survivorId })
        .where(eq(table.supplier_id, input.duplicateId))
        .returning({ id: table.id });
      moved += result.length;
    };

    await repoint(purchaseOrders);
    await repoint(goodsReceipts);
    await repoint(purchaseInvoices);
    await repoint(purchaseReturns);
    await repoint(supplierAddresses);
    await repoint(supplierContacts);
    await repoint(supplierContracts);
    await repoint(supplierLedger);
    await repoint(supplierPayments);

    /* supplier_products is keyed on (supplier, product), so repointing blindly
       would collide where both suppliers stocked the same product. Move only
       the rows the survivor does not already have. */
    const duplicateLinks = await tx
      .select({ id: supplierProducts.id, productId: supplierProducts.product_id })
      .from(supplierProducts)
      .where(eq(supplierProducts.supplier_id, input.duplicateId));

    for (const link of duplicateLinks) {
      const [clash] = await tx
        .select({ id: supplierProducts.id })
        .from(supplierProducts)
        .where(
          and(
            eq(supplierProducts.supplier_id, input.survivorId),
            eq(supplierProducts.product_id, link.productId),
          ),
        )
        .limit(1);

      if (clash) {
        await tx.delete(supplierProducts).where(eq(supplierProducts.id, link.id));
      } else {
        await tx
          .update(supplierProducts)
          .set({ supplier_id: input.survivorId })
          .where(eq(supplierProducts.id, link.id));
        moved += 1;
      }
    }

    await tx
      .update(suppliers)
      .set({
        outstanding_balance: add(
          survivor.outstanding_balance,
          duplicate.outstanding_balance,
        ),
        total_purchases: add(survivor.total_purchases, duplicate.total_purchases),
        purchase_count: survivor.purchase_count + duplicate.purchase_count,
        last_purchase_at:
          !survivor.last_purchase_at ||
          (duplicate.last_purchase_at &&
            duplicate.last_purchase_at > survivor.last_purchase_at)
            ? duplicate.last_purchase_at
            : survivor.last_purchase_at,
        contact_person: survivor.contact_person ?? duplicate.contact_person,
        phone: survivor.phone ?? duplicate.phone,
        email: survivor.email ?? duplicate.email,
        tax_number: survivor.tax_number ?? duplicate.tax_number,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(suppliers.id, input.survivorId));

    await tx
      .update(suppliers)
      .set({
        status: "archived",
        outstanding_balance: "0",
        note: `Merged into ${survivor.company_name} (${survivor.code}).`,
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        updated_at: new Date(),
      })
      .where(eq(suppliers.id, input.duplicateId));

    await auditEvent(
      ctx,
      {
        event: "SuppliersMerged",
        moduleSlug: "suppliers",
        entityType: "supplier",
        entityId: input.survivorId,
        summary: `Merged ${duplicate.company_name} into ${survivor.company_name}`,
        payload: {
          duplicate_id: input.duplicateId,
          duplicate_code: duplicate.code,
          rows_moved: moved,
        },
      },
      tx,
    );

    return {
      survivorId: survivor.id,
      survivorName: survivor.company_name,
      duplicateName: duplicate.company_name,
      movedRows: moved,
    };
  });
}
