import "server-only";

import { eq, sql } from "drizzle-orm";

import { type Transaction } from "@/db";
import {
  customerLedger,
  customers,
  loyaltyTransactions,
  supplierLedger,
  suppliers,
} from "@/db/schema";
import { BusinessRuleError } from "@/lib/authz/errors";
import { add, dec, gt, isPositive, mul, sub } from "@/lib/money";

/**
 * Receivable / payable ledgers and loyalty.
 *
 * Balances are maintained by these helpers only, so `outstanding_balance` always
 * equals the sum of its ledger (19-business-rules.md).
 */

/* -------------------------------------------------------------------------- */
/* Customer receivables                                                       */
/* -------------------------------------------------------------------------- */

export interface CustomerLedgerEntry {
  customerId: string;
  storeId?: string | null;
  /** Positive increases what the customer owes; negative is a settlement. */
  amount: string;
  kind: "invoice" | "payment" | "refund" | "adjustment" | "opening";
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  note?: string;
}

export async function postCustomerLedger(
  tx: Transaction,
  ctx: { businessId: string; userId?: string | null },
  entry: CustomerLedgerEntry,
): Promise<string> {
  // Lock the customer row so concurrent sales cannot interleave balance writes.
  const [customer] = await tx
    .select()
    .from(customers)
    .where(eq(customers.id, entry.customerId))
    .limit(1)
    .for("update");

  if (!customer) {
    throw BusinessRuleError("Customer not found.", "CUSTOMER_MISSING");
  }

  const balanceAfter = add(String(customer.outstanding_balance), entry.amount);

  await tx
    .update(customers)
    .set({ outstanding_balance: balanceAfter, updated_at: new Date() })
    .where(eq(customers.id, entry.customerId));

  await tx.insert(customerLedger).values({
    tenant_id: ctx.businessId,
    customer_id: entry.customerId,
    store_id: entry.storeId ?? null,
    amount: dec(entry.amount),
    balance_after: balanceAfter,
    kind: entry.kind,
    reference_type: entry.referenceType ?? null,
    reference_id: entry.referenceId ?? null,
    reference_number: entry.referenceNumber ?? null,
    note: entry.note ?? null,
    created_by: ctx.userId ?? null,
  });

  return balanceAfter;
}

/**
 * Enforces the credit limit before a credit sale.
 * Blocked customers may never take on new credit (11-customers.md).
 */
export function assertCreditAllowed(
  customer: typeof customers.$inferSelect,
  additionalCredit: string,
  options: { canOverride: boolean },
): void {
  if (!isPositive(additionalCredit)) return;

  if (customer.status === "blocked") {
    throw BusinessRuleError(
      `${customer.name} is blocked and cannot purchase on credit.`,
      "CUSTOMER_BLOCKED",
    );
  }

  if (options.canOverride) return;

  const projected = add(String(customer.outstanding_balance), additionalCredit);
  const limit = String(customer.credit_limit);

  if (gt(projected, limit)) {
    throw BusinessRuleError(
      `Credit limit exceeded for ${customer.name}. Limit ${dec(limit)}, ` +
        `outstanding would become ${dec(projected)}.`,
      "CREDIT_LIMIT_EXCEEDED",
    );
  }
}

export function availableCredit(
  customer: typeof customers.$inferSelect,
): string {
  const remaining = sub(
    String(customer.credit_limit),
    String(customer.outstanding_balance),
  );
  return isPositive(remaining) ? remaining : "0.0000";
}

/** Refreshes the denormalised purchase analytics after a completed sale. */
export async function recordCustomerPurchase(
  tx: Transaction,
  customerId: string,
  amount: string,
  when: Date,
): Promise<void> {
  await tx
    .update(customers)
    .set({
      total_purchases: sql`${customers.total_purchases} + ${dec(amount)}`,
      purchase_count: sql`${customers.purchase_count} + 1`,
      last_purchase_at: when,
      updated_at: new Date(),
    })
    .where(eq(customers.id, customerId));
}

/* -------------------------------------------------------------------------- */
/* Loyalty                                                                    */
/* -------------------------------------------------------------------------- */

/** Points earned for a sale total, per `sales.loyalty_points_per_currency`. */
export function calculateLoyaltyPoints(
  saleTotal: string,
  pointsPerHundred: number,
): string {
  if (pointsPerHundred <= 0) return "0.0000";
  const hundreds = Number(saleTotal) / 100;
  return dec(Math.floor(hundreds * pointsPerHundred));
}

export async function postLoyalty(
  tx: Transaction,
  ctx: { businessId: string; userId?: string | null },
  entry: {
    customerId: string;
    /** Signed: positive earns, negative redeems or reverses. */
    points: string;
    kind: "earn" | "redeem" | "reverse" | "expire" | "manual";
    referenceType?: string;
    referenceId?: string;
    note?: string;
  },
): Promise<string> {
  const [customer] = await tx
    .select()
    .from(customers)
    .where(eq(customers.id, entry.customerId))
    .limit(1)
    .for("update");

  if (!customer) {
    throw BusinessRuleError("Customer not found.", "CUSTOMER_MISSING");
  }

  const balanceAfter = add(String(customer.loyalty_points), entry.points);
  if (gt("0", balanceAfter)) {
    throw BusinessRuleError(
      "Loyalty balance cannot go negative.",
      "LOYALTY_INSUFFICIENT",
    );
  }

  const earned = isPositive(entry.points)
    ? add(String(customer.loyalty_points_earned), entry.points)
    : String(customer.loyalty_points_earned);
  const redeemed =
    entry.kind === "redeem"
      ? add(String(customer.loyalty_points_redeemed), mul(entry.points, "-1"))
      : String(customer.loyalty_points_redeemed);

  await tx
    .update(customers)
    .set({
      loyalty_points: balanceAfter,
      loyalty_points_earned: earned,
      loyalty_points_redeemed: redeemed,
      updated_at: new Date(),
    })
    .where(eq(customers.id, entry.customerId));

  await tx.insert(loyaltyTransactions).values({
    tenant_id: ctx.businessId,
    customer_id: entry.customerId,
    points: dec(entry.points),
    balance_after: balanceAfter,
    kind: entry.kind,
    reference_type: entry.referenceType ?? null,
    reference_id: entry.referenceId ?? null,
    note: entry.note ?? null,
    created_by: ctx.userId ?? null,
  });

  return balanceAfter;
}

/* -------------------------------------------------------------------------- */
/* Supplier payables                                                          */
/* -------------------------------------------------------------------------- */

export interface SupplierLedgerEntry {
  supplierId: string;
  storeId?: string | null;
  /** Positive increases the payable; negative is a payment made. */
  amount: string;
  kind: "invoice" | "payment" | "debit_note" | "adjustment" | "opening";
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  note?: string;
}

export async function postSupplierLedger(
  tx: Transaction,
  ctx: { businessId: string; userId?: string | null },
  entry: SupplierLedgerEntry,
): Promise<string> {
  const [supplier] = await tx
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, entry.supplierId))
    .limit(1)
    .for("update");

  if (!supplier) {
    throw BusinessRuleError("Supplier not found.", "SUPPLIER_MISSING");
  }

  const balanceAfter = add(String(supplier.outstanding_balance), entry.amount);

  await tx
    .update(suppliers)
    .set({ outstanding_balance: balanceAfter, updated_at: new Date() })
    .where(eq(suppliers.id, entry.supplierId));

  await tx.insert(supplierLedger).values({
    tenant_id: ctx.businessId,
    supplier_id: entry.supplierId,
    store_id: entry.storeId ?? null,
    amount: dec(entry.amount),
    balance_after: balanceAfter,
    kind: entry.kind,
    reference_type: entry.referenceType ?? null,
    reference_id: entry.referenceId ?? null,
    reference_number: entry.referenceNumber ?? null,
    note: entry.note ?? null,
    created_by: ctx.userId ?? null,
  });

  return balanceAfter;
}

export async function recordSupplierPurchase(
  tx: Transaction,
  supplierId: string,
  amount: string,
  when: Date,
): Promise<void> {
  await tx
    .update(suppliers)
    .set({
      total_purchases: sql`${suppliers.total_purchases} + ${dec(amount)}`,
      purchase_count: sql`${suppliers.purchase_count} + 1`,
      last_purchase_at: when,
      updated_at: new Date(),
    })
    .where(eq(suppliers.id, supplierId));
}

export function assertSupplierOrderable(
  supplier: typeof suppliers.$inferSelect,
): void {
  if (supplier.status === "blocked") {
    throw BusinessRuleError(
      `${supplier.company_name} is blocked and cannot receive new purchase orders.`,
      "SUPPLIER_BLOCKED",
    );
  }
  if (supplier.status === "archived") {
    throw BusinessRuleError(
      `${supplier.company_name} is archived.`,
      "SUPPLIER_ARCHIVED",
    );
  }
}
