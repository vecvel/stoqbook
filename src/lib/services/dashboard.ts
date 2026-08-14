import "server-only";

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  attendance,
  customers,
  expenses,
  inventoryLevels,
  posSessions,
  products,
  purchaseInvoices,
  purchaseOrders,
  salePayments,
  salesInvoiceItems,
  salesInvoices,
  suppliers,
  users,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { dec, div, sub, toNumber } from "@/lib/money";
import {
  recentDayKeys,
  safeTimeZone,
  shortDayLabel,
  startOfDayInTz,
  startOfMonthInTz,
  startOfQuarterInTz,
  startOfWeekInTz,
  startOfYearInTz,
} from "@/lib/timezone";

/**
 * Widget data providers.
 *
 * Every query is scoped by tenant and, where the table is store-aware, by the
 * active store — so a store-restricted user never sees another store's
 * numbers (15-dashboard.md § Business Rules).
 */

export type DateRange = "today" | "week" | "month" | "quarter" | "year";

export interface Period {
  from: Date;
  to: Date;
  /** Equivalent preceding window, for percentage comparisons. */
  previousFrom: Date;
  previousTo: Date;
  label: string;
}

/**
 * Period boundaries are computed in the tenant's timezone so "today" means the
 * tenant's business day, not the server's.
 */
export function resolvePeriod(
  range: DateRange = "today",
  timeZone = "UTC",
): Period {
  const tz = safeTimeZone(timeZone);
  const now = new Date();
  const to = new Date(now);

  let from: Date;
  switch (range) {
    case "week":
      from = startOfWeekInTz(now, tz);
      break;
    case "month":
      from = startOfMonthInTz(now, tz);
      break;
    case "quarter":
      from = startOfQuarterInTz(now, tz);
      break;
    case "year":
      from = startOfYearInTz(now, tz);
      break;
    case "today":
    default:
      from = startOfDayInTz(now, tz);
      break;
  }

  const span = to.getTime() - from.getTime();
  const previousTo = new Date(from.getTime() - 1);
  const previousFrom = new Date(from.getTime() - span);

  const LABELS: Record<DateRange, string> = {
    today: "Today",
    week: "This week",
    month: "This month",
    quarter: "This quarter",
    year: "This year",
  };

  return { from, to, previousFrom, previousTo, label: LABELS[range] };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export interface WidgetScope {
  ctx: BusinessContext;
  period: Period;
  /** null means "all stores the user can see". */
  storeId: string | null;
}

/* -------------------------------------------------------------------------- */
/* Sales                                                                      */
/* -------------------------------------------------------------------------- */

export interface SalesSummary {
  revenue: string;
  transactions: number;
  averageBill: string;
  grossProfit: string;
  refunds: string;
  revenueDelta: number | null;
  transactionsDelta: number | null;
}

export async function salesSummary(scope: WidgetScope): Promise<SalesSummary> {
  const base = (from: Date, to: Date) =>
    and(
      eq(salesInvoices.tenant_id, scope.ctx.business.id),
      scope.storeId ? eq(salesInvoices.store_id, scope.storeId) : undefined,
      gte(salesInvoices.invoice_date, from),
      lt(salesInvoices.invoice_date, to),
      // Cancelled invoices are excluded from revenue.
      sql`${salesInvoices.status} <> 'cancelled'`,
    );

  const [current] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      profit: sql<string>`coalesce(sum(${salesInvoices.gross_profit}), 0)`,
      refunds: sql<string>`coalesce(sum(${salesInvoices.refunded_amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(salesInvoices)
    .where(base(scope.period.from, scope.period.to));

  const [previous] = await db
    .select({
      revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(salesInvoices)
    .where(base(scope.period.previousFrom, scope.period.previousTo));

  const revenue = dec(current?.revenue ?? "0");
  const count = current?.count ?? 0;

  return {
    revenue,
    transactions: count,
    averageBill: count > 0 ? div(revenue, String(count)) : "0.0000",
    grossProfit: dec(current?.profit ?? "0"),
    refunds: dec(current?.refunds ?? "0"),
    revenueDelta: percentChange(
      toNumber(revenue),
      toNumber(previous?.revenue ?? "0"),
    ),
    transactionsDelta: percentChange(count, previous?.count ?? 0),
  };
}

export interface TrendPoint {
  label: string;
  revenue: number;
  profit: number;
  transactions: number;
}

/** Daily revenue series for the sales trend chart. */
export async function salesTrend(
  scope: WidgetScope,
  days = 14,
): Promise<TrendPoint[]> {
  const tz = safeTimeZone(scope.ctx.business.timezone);
  const keys = recentDayKeys(days, tz);
  const from = startOfDayInTz(
    new Date(Date.now() - (days - 1) * 86_400_000),
    tz,
  );

  // Bucket by the tenant's calendar day, not the database session's, so the
  // grouping matches the keys generated above.
  //
  // The zone is inlined rather than bound: a bound parameter renders as a
  // different placeholder in SELECT and GROUP BY ($1 vs $4), and Postgres then
  // treats the two expressions as unequal and rejects the query. `tz` has
  // already been validated as a real IANA zone by safeTimeZone.
  const dayExpr = sql.raw(
    `to_char("sales_invoices"."invoice_date" at time zone '${tz.replace(/'/g, "")}', 'YYYY-MM-DD')`,
  );

  const rows = await db
    .select({
      day: sql<string>`${dayExpr}`,
      revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      profit: sql<string>`coalesce(sum(${salesInvoices.gross_profit}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(salesInvoices.store_id, scope.storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  const byDay = new Map(rows.map((r) => [r.day, r]));

  // Emit every day in the window so the axis stays continuous.
  return keys.map((key) => {
    const row = byDay.get(key);
    return {
      label: shortDayLabel(key),
      revenue: toNumber(row?.revenue ?? 0),
      profit: toNumber(row?.profit ?? 0),
      transactions: row?.count ?? 0,
    };
  });
}

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantity: string;
  revenue: string;
}

export async function topProducts(
  scope: WidgetScope,
  limit = 6,
): Promise<TopProduct[]> {
  const rows = await db
    .select({
      productId: salesInvoiceItems.product_id,
      name: salesInvoiceItems.product_name,
      sku: salesInvoiceItems.product_sku,
      quantity: sql<string>`coalesce(sum(${salesInvoiceItems.quantity}), 0)`,
      revenue: sql<string>`coalesce(sum(${salesInvoiceItems.line_total}), 0)`,
    })
    .from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoice_id))
    .where(
      and(
        eq(salesInvoices.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(salesInvoices.store_id, scope.storeId) : undefined,
        gte(salesInvoices.invoice_date, scope.period.from),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(
      salesInvoiceItems.product_id,
      salesInvoiceItems.product_name,
      salesInvoiceItems.product_sku,
    )
    .orderBy(desc(sql`sum(${salesInvoiceItems.line_total})`))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    quantity: dec(r.quantity),
    revenue: dec(r.revenue),
  }));
}

export interface RecentSale {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  grandTotal: string;
  paymentStatus: string;
  invoiceDate: Date;
}

export async function recentSales(
  scope: WidgetScope,
  limit = 7,
): Promise<RecentSale[]> {
  const rows = await db
    .select({
      id: salesInvoices.id,
      invoiceNumber: salesInvoices.invoice_number,
      customerName: salesInvoices.customer_name,
      grandTotal: salesInvoices.grand_total,
      paymentStatus: salesInvoices.payment_status,
      invoiceDate: salesInvoices.invoice_date,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(salesInvoices.store_id, scope.storeId) : undefined,
      ),
    )
    .orderBy(desc(salesInvoices.invoice_date))
    .limit(limit);

  return rows.map((r) => ({ ...r, grandTotal: dec(r.grandTotal) }));
}

export interface RecentProduct {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  status: string;
  createdAt: Date;
}

/**
 * Newest catalogue additions. Not store-scoped: the catalogue belongs to the
 * business, not to any one store.
 */
export async function recentProducts(
  ctx: BusinessContext,
  limit = 7,
): Promise<RecentProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      sellingPrice: products.selling_price,
      status: products.status,
      createdAt: products.created_at,
    })
    .from(products)
    .where(
      and(eq(products.tenant_id, ctx.business.id), isNull(products.deleted_at)),
    )
    .orderBy(desc(products.created_at))
    .limit(limit);

  return rows.map((r) => ({ ...r, sellingPrice: dec(r.sellingPrice) }));
}

export interface PaymentMixSlice {
  method: string;
  amount: string;
  count: number;
}

export async function paymentMix(scope: WidgetScope): Promise<PaymentMixSlice[]> {
  const rows = await db
    .select({
      method: salePayments.method,
      amount: sql<string>`coalesce(sum(${salePayments.amount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(salePayments)
    .where(
      and(
        eq(salePayments.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(salePayments.store_id, scope.storeId) : undefined,
        gte(salePayments.paid_at, scope.period.from),
        eq(salePayments.is_refund, false),
      ),
    )
    .groupBy(salePayments.method)
    .orderBy(desc(sql`sum(${salePayments.amount})`));

  return rows.map((r) => ({ ...r, amount: dec(r.amount) }));
}

export async function outstandingReceivables(
  scope: WidgetScope,
): Promise<{ total: string; customers: number }> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${customers.outstanding_balance}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, scope.ctx.business.id),
        isNull(customers.deleted_at),
        sql`${customers.outstanding_balance} > 0`,
      ),
    );

  return { total: dec(row?.total ?? "0"), customers: row?.count ?? 0 };
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                  */
/* -------------------------------------------------------------------------- */

export interface InventorySummary {
  value: string;
  totalUnits: string;
  lowStock: number;
  outOfStock: number;
}

export async function inventorySummary(
  scope: WidgetScope,
): Promise<InventorySummary> {
  const scoped = and(
    eq(inventoryLevels.tenant_id, scope.ctx.business.id),
    scope.storeId ? eq(inventoryLevels.store_id, scope.storeId) : undefined,
  );

  const [totals] = await db
    .select({
      value: sql<string>`coalesce(sum(${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}), 0)`,
      units: sql<string>`coalesce(sum(${inventoryLevels.quantity_available}), 0)`,
    })
    .from(inventoryLevels)
    .where(scoped);

  const [low] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .where(
      and(
        scoped,
        eq(products.track_inventory, true),
        eq(products.status, "active"),
        sql`${products.min_stock} > 0`,
        sql`${inventoryLevels.quantity_available} <= ${products.min_stock}`,
        sql`${inventoryLevels.quantity_available} > 0`,
      ),
    );

  const [out] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .where(
      and(
        scoped,
        eq(products.track_inventory, true),
        eq(products.status, "active"),
        sql`${inventoryLevels.quantity_available} <= 0`,
      ),
    );

  return {
    value: dec(totals?.value ?? "0"),
    totalUnits: dec(totals?.units ?? "0"),
    lowStock: low?.count ?? 0,
    outOfStock: out?.count ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Purchases                                                                  */
/* -------------------------------------------------------------------------- */

export async function purchaseSummary(scope: WidgetScope): Promise<{
  pendingApprovals: number;
  awaitingReceipt: number;
  outstandingPayables: string;
}> {
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(purchaseOrders.store_id, scope.storeId) : undefined,
        eq(purchaseOrders.approval_status, "pending"),
      ),
    );

  const [awaiting] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(purchaseOrders.store_id, scope.storeId) : undefined,
        sql`${purchaseOrders.status} in ('approved','sent','partially_received')`,
      ),
    );

  const [payables] = await db
    .select({
      total: sql<string>`coalesce(sum(${suppliers.outstanding_balance}), 0)`,
    })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenant_id, scope.ctx.business.id),
        isNull(suppliers.deleted_at),
      ),
    );

  return {
    pendingApprovals: pending?.count ?? 0,
    awaitingReceipt: awaiting?.count ?? 0,
    outstandingPayables: dec(payables?.total ?? "0"),
  };
}

export interface AwaitingReceiptRow {
  id: string;
  orderNumber: string;
  supplierName: string;
  grandTotal: string;
  expectedDate: Date | null;
  status: string;
}

export async function awaitingReceipt(
  scope: WidgetScope,
  limit = 6,
): Promise<AwaitingReceiptRow[]> {
  const rows = await db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.order_number,
      supplierName: suppliers.company_name,
      grandTotal: purchaseOrders.grand_total,
      expectedDate: purchaseOrders.expected_date,
      status: purchaseOrders.status,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
    .where(
      and(
        eq(purchaseOrders.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(purchaseOrders.store_id, scope.storeId) : undefined,
        sql`${purchaseOrders.status} in ('approved','sent','partially_received')`,
      ),
    )
    .orderBy(purchaseOrders.expected_date)
    .limit(limit);

  return rows.map((r) => ({ ...r, grandTotal: dec(r.grandTotal) }));
}

/* -------------------------------------------------------------------------- */
/* Counts                                                                     */
/* -------------------------------------------------------------------------- */

export async function entityCounts(ctx: BusinessContext): Promise<{
  products: number;
  activeProducts: number;
  customers: number;
  suppliers: number;
  employees: number;
}> {
  const [p] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${products.status} = 'active')::int`,
    })
    .from(products)
    .where(and(eq(products.tenant_id, ctx.business.id), isNull(products.deleted_at)));

  const [c] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        isNull(customers.deleted_at),
        eq(customers.is_walk_in, false),
      ),
    );

  const [s] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(and(eq(suppliers.tenant_id, ctx.business.id), isNull(suppliers.deleted_at)));

  const [e] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.tenant_id, ctx.business.id), isNull(users.deleted_at)));

  return {
    products: p?.total ?? 0,
    activeProducts: p?.active ?? 0,
    customers: c?.total ?? 0,
    suppliers: s?.total ?? 0,
    employees: e?.total ?? 0,
  };
}

export interface TopPartner {
  id: string;
  name: string;
  total: string;
  count: number;
}

export async function topCustomers(
  ctx: BusinessContext,
  limit = 5,
): Promise<TopPartner[]> {
  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      total: customers.total_purchases,
      count: customers.purchase_count,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        isNull(customers.deleted_at),
        sql`${customers.total_purchases} > 0`,
      ),
    )
    .orderBy(desc(customers.total_purchases))
    .limit(limit);

  return rows.map((r) => ({ ...r, total: dec(r.total) }));
}

export async function topSuppliers(
  ctx: BusinessContext,
  limit = 5,
): Promise<TopPartner[]> {
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.company_name,
      total: suppliers.total_purchases,
      count: suppliers.purchase_count,
    })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenant_id, ctx.business.id),
        isNull(suppliers.deleted_at),
        sql`${suppliers.total_purchases} > 0`,
      ),
    )
    .orderBy(desc(suppliers.total_purchases))
    .limit(limit);

  return rows.map((r) => ({ ...r, total: dec(r.total) }));
}

/* -------------------------------------------------------------------------- */
/* People and finance                                                         */
/* -------------------------------------------------------------------------- */

export async function attendanceToday(
  scope: WidgetScope,
): Promise<{ present: number; absent: number; late: number }> {
  const today = startOfDayInTz(
    new Date(),
    safeTimeZone(scope.ctx.business.timezone),
  );

  const rows = await db
    .select({
      status: attendance.status,
      count: sql<number>`count(*)::int`,
    })
    .from(attendance)
    .where(
      and(
        eq(attendance.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(attendance.store_id, scope.storeId) : undefined,
        gte(attendance.work_date, today),
      ),
    )
    .groupBy(attendance.status);

  const by = new Map(rows.map((r) => [r.status, r.count]));
  return {
    present: (by.get("present") ?? 0) + (by.get("late") ?? 0),
    absent: by.get("absent") ?? 0,
    late: by.get("late") ?? 0,
  };
}

export async function expenseTotal(scope: WidgetScope): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${expenses.amount} + ${expenses.tax_amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenant_id, scope.ctx.business.id),
        scope.storeId ? eq(expenses.store_id, scope.storeId) : undefined,
        gte(expenses.expense_date, scope.period.from),
      ),
    );
  return dec(row?.total ?? "0");
}

export async function activePosSession(
  ctx: BusinessContext,
): Promise<{
  id: string;
  sessionNumber: string;
  openedAt: Date;
  totalSales: string;
  transactionCount: number;
} | null> {
  const [row] = await db
    .select({
      id: posSessions.id,
      sessionNumber: posSessions.session_number,
      openedAt: posSessions.opened_at,
      totalSales: posSessions.total_sales,
      transactionCount: posSessions.transaction_count,
    })
    .from(posSessions)
    .where(
      and(
        eq(posSessions.tenant_id, ctx.business.id),
        eq(posSessions.cashier_id, ctx.user.id),
        isNull(posSessions.closed_at),
      ),
    )
    .orderBy(desc(posSessions.opened_at))
    .limit(1);

  return row ? { ...row, totalSales: dec(row.totalSales) } : null;
}

/** Net profit for the period: gross profit less expenses. */
export async function netProfit(scope: WidgetScope): Promise<string> {
  const [sales, expenseAmount] = await Promise.all([
    salesSummary(scope),
    expenseTotal(scope),
  ]);
  return sub(sales.grossProfit, expenseAmount);
}

export async function unpaidPurchaseInvoices(
  scope: WidgetScope,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseInvoices)
    .where(
      and(
        eq(purchaseInvoices.tenant_id, scope.ctx.business.id),
        scope.storeId
          ? eq(purchaseInvoices.store_id, scope.storeId)
          : undefined,
        sql`${purchaseInvoices.payment_status} in ('unpaid','partially_paid')`,
      ),
    );
  return row?.count ?? 0;
}
