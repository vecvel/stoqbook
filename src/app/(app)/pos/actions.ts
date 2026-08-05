"use server";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { posSessions } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { BusinessRuleError } from "@/lib/authz/errors";
import { auditEvent } from "@/lib/services/audit";
import { nextNumber } from "@/lib/services/numbering";
import {
  createSale,
  type PaymentMethod,
  type SaleLineInput,
  type SalePaymentInput,
} from "@/lib/services/sales";
import { dec, sub } from "@/lib/money";
import {
  decimalStr,
  failure,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/* -------------------------------------------------------------------------- */
/* Cash sessions                                                              */
/* -------------------------------------------------------------------------- */

export async function openSession(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("pos.open_session", {
      feature: "pos.sessions",
    });

    if (!ctx.activeStore) return failure("No store selected.");

    const warehouseId = uuid(form, "warehouse_id");
    if (!warehouseId) return failure("Select a warehouse to sell from.");

    // One open session per cashier at a time.
    const [existing] = await db
      .select({ id: posSessions.id })
      .from(posSessions)
      .where(
        and(
          eq(posSessions.tenant_id, ctx.business.id),
          eq(posSessions.cashier_id, ctx.user.id),
          isNull(posSessions.closed_at),
        ),
      )
      .limit(1);

    if (existing) {
      throw BusinessRuleError(
        "You already have an open cash session.",
        "SESSION_ALREADY_OPEN",
      );
    }

    const sessionNumber = await nextNumber(ctx.business.id, "pos_session", {
      storeId: ctx.activeStore.id,
    });

    const [session] = await db
      .insert(posSessions)
      .values({
        tenant_id: ctx.business.id,
        branch_id: ctx.activeStore.id,
        warehouse_id: warehouseId,
        cashier_id: ctx.user.id,
        session_number: sessionNumber,
        opening_cash: decimalStr(form, "opening_cash"),
      })
      .returning();

    await auditEvent(ctx, {
      event: "PosSessionOpened",
      moduleSlug: "pos",
      entityType: "pos_session",
      entityId: session.id,
      summary: `Opened cash session ${sessionNumber}`,
      payload: { opening_cash: session.opening_cash },
    });

    revalidate("/pos", "/dashboard");
    return success(undefined, `Session ${sessionNumber} opened.`);
  });
}

export async function closeSession(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("pos.close_session", {
      feature: "pos.sessions",
    });

    const sessionId = uuid(form, "session_id");
    if (!sessionId) return failure("Session not found.");

    const [session] = await db
      .select()
      .from(posSessions)
      .where(
        and(
          eq(posSessions.id, sessionId),
          eq(posSessions.tenant_id, ctx.business.id),
          isNull(posSessions.closed_at),
        ),
      )
      .limit(1);

    if (!session) return failure("That session is already closed.");

    const closingCash = decimalStr(form, "closing_cash");
    // Expected = opening float plus cash taken during the session.
    const expected = dec(
      String(Number(session.opening_cash) + Number(session.expected_cash)),
    );
    const variance = sub(closingCash, expected);

    await db
      .update(posSessions)
      .set({
        closed_at: new Date(),
        closing_cash: closingCash,
        cash_variance: variance,
        note: str(form, "note") || null,
        updated_at: new Date(),
      })
      .where(eq(posSessions.id, sessionId));

    await auditEvent(ctx, {
      event: "PosSessionClosed",
      moduleSlug: "pos",
      entityType: "pos_session",
      entityId: sessionId,
      summary: `Closed cash session ${session.session_number}`,
      payload: {
        expected,
        counted: closingCash,
        variance,
        transactions: session.transaction_count,
      },
    });

    revalidate("/pos", "/dashboard");
    return success(
      undefined,
      Number(variance) === 0
        ? "Session closed and the drawer balanced."
        : `Session closed with a variance of ${Number(variance).toFixed(2)}.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

export interface CheckoutPayload {
  warehouseId: string;
  customerId: string | null;
  posSessionId: string | null;
  lines: {
    productId: string;
    quantity: string;
    unitPrice: string;
    discountType: "none" | "percentage" | "fixed";
    discountValue: string;
  }[];
  payments: {
    method: PaymentMethod;
    amount: string;
    reference?: string;
    tenderedAmount?: string;
    giftCardCode?: string;
  }[];
  invoiceDiscountType: "none" | "percentage" | "fixed";
  invoiceDiscountValue: string;
  redeemLoyaltyPoints: string;
  note?: string;
}

export interface CheckoutResult {
  invoiceId: string;
  invoiceNumber: string;
  grandTotal: string;
  changeAmount: string;
  balanceAmount: string;
  loyaltyEarned: string;
}

/**
 * Completes a POS sale. All pricing, tax, stock, receivables and loyalty are
 * computed server-side — the client only supplies quantities and payments.
 */
export async function checkout(
  payload: CheckoutPayload,
): Promise<ActionResult<CheckoutResult>> {
  return runAction(async () => {
    const ctx = await requirePermission("pos.use", { feature: "pos.billing" });

    if (!payload.lines?.length) {
      return failure("Add at least one item before taking payment.");
    }

    const lines: SaleLineInput[] = payload.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountType: line.discountType,
      discountValue: line.discountValue,
    }));

    const payments: SalePaymentInput[] = (payload.payments ?? []).map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      tenderedAmount: p.tenderedAmount,
      giftCardCode: p.giftCardCode,
    }));

    const result = await createSale(ctx, {
      customerId: payload.customerId,
      warehouseId: payload.warehouseId,
      posSessionId: payload.posSessionId,
      lines,
      payments,
      channel: "pos_counter",
      discountType: payload.invoiceDiscountType,
      discountValue: payload.invoiceDiscountValue,
      redeemLoyaltyPoints: payload.redeemLoyaltyPoints,
      note: payload.note,
    });

    revalidate("/pos", "/sales", "/inventory", "/dashboard");

    return success(
      {
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        grandTotal: result.grandTotal,
        changeAmount: result.changeAmount,
        balanceAmount: result.balanceAmount,
        loyaltyEarned: result.loyaltyEarned,
      },
      `Sale ${result.invoiceNumber} completed.`,
    );
  });
}

/** Quick customer creation from the POS without leaving the till. */
export async function quickCreateCustomer(
  name: string,
  phone: string,
): Promise<ActionResult<{ id: string; name: string; phone: string | null }>> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.create");

    const trimmed = name.trim();
    if (!trimmed) return failure("Enter a customer name.");

    const { customers } = await import("@/db/schema");
    const code = await nextNumber(ctx.business.id, "customer");

    const [customer] = await db
      .insert(customers)
      .values({
        tenant_id: ctx.business.id,
        code,
        name: trimmed,
        phone: phone.trim() || null,
        type: "retail",
        status: "active",
        created_by: ctx.user.id,
      })
      .returning();

    await auditEvent(ctx, {
      event: "CustomerCreated",
      moduleSlug: "customers",
      entityType: "customer",
      entityId: customer.id,
      summary: `Created ${customer.name} from the POS`,
    });

    revalidate("/customers");
    return success({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
    });
  });
}

/** Recently used customers, for the POS picker. */
export async function searchCustomers(
  term: string,
): Promise<
  {
    id: string;
    name: string;
    phone: string | null;
    outstanding: string;
    creditLimit: string;
    loyaltyPoints: string;
    isWalkIn: boolean;
    type: string;
  }[]
> {
  const ctx = await requirePermission("customers.view");
  const { customers } = await import("@/db/schema");
  const { ilike, or } = await import("drizzle-orm");

  const trimmed = term.trim();
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      outstanding: customers.outstanding_balance,
      creditLimit: customers.credit_limit,
      loyaltyPoints: customers.loyalty_points,
      isWalkIn: customers.is_walk_in,
      type: customers.type,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        isNull(customers.deleted_at),
        trimmed
          ? or(
              ilike(customers.name, `%${trimmed}%`),
              ilike(customers.phone, `%${trimmed}%`),
              ilike(customers.code, `%${trimmed}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(customers.is_walk_in), desc(customers.last_purchase_at))
    .limit(10);

  return rows.map((r) => ({
    ...r,
    outstanding: String(r.outstanding),
    creditLimit: String(r.creditLimit),
    loyaltyPoints: String(r.loyaltyPoints),
  }));
}
