import "server-only";

import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  customers,
  expenseCategories,
  expenses,
  inventoryLevels,
  inventoryMovements,
  products,
  purchaseOrders,
  salePayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturns,
  stockAdjustmentItems,
  stockAdjustments,
  suppliers,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { storeScope, type BusinessContext } from "@/lib/authz/context";
import { dec, div, toNumber } from "@/lib/money";
import { REPORT_BY_KEY } from "@/lib/registry";
import { startOfDayInTz, safeTimeZone } from "@/lib/timezone";

import { loadSettings, readNumber } from "./settings";

/**
 * Report execution.
 *
 * Reports never write data. Each definition returns typed columns plus rows, so
 * the runner page and the CSV exporter share one implementation (14-reporting.md).
 */

export type ColumnFormat =
  | "text"
  | "money"
  | "quantity"
  | "number"
  | "percent"
  | "date"
  | "datetime"
  | "status";

export interface ReportColumn {
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: "left" | "right" | "center";
  /** Renders as a link to this path with the row's `_id` appended. */
  linkTo?: string;
}

export interface ReportSummaryCard {
  label: string;
  value: string;
  format?: ColumnFormat;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: ReportSummaryCard[];
  /** Totals row appended at the foot of the table. */
  totals?: Record<string, unknown>;
  rowCount: number;
  truncated: boolean;
}

export interface ReportFilters {
  from?: Date | null;
  to?: Date | null;
  storeId?: string | null;
  warehouseId?: string | null;
  categoryId?: string | null;
  limit?: number;
}

const MAX_ROWS = 1000;

/** Resolves the report window, defaulting to the current month. */
function resolveWindow(
  ctx: BusinessContext,
  filters: ReportFilters,
): { from: Date; to: Date } {
  const tz = safeTimeZone(ctx.business.timezone);
  const to = filters.to ?? new Date();
  // Include the whole end day.
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  const from =
    filters.from ??
    (() => {
      const d = new Date();
      d.setDate(1);
      return startOfDayInTz(d, tz);
    })();

  return { from, to: end };
}

export async function runReport(
  ctx: BusinessContext,
  reportKey: string,
  filters: ReportFilters,
): Promise<ReportResult> {
  const runner = RUNNERS[reportKey];
  if (!runner) {
    throw new Error(`Report ${reportKey} has no implementation.`);
  }
  return runner(ctx, filters);
}

export function reportExists(key: string): boolean {
  return Boolean(RUNNERS[key] && REPORT_BY_KEY[key]);
}

type Runner = (
  ctx: BusinessContext,
  filters: ReportFilters,
) => Promise<ReportResult>;

/**
 * Store scope shared by every store-aware report.
 *
 * An explicit filter wins — but only because the report page will not offer a
 * store the caller cannot already see. Otherwise the caller's own scope decides:
 * a store manager gets their store, a regional manager gets everything.
 */
function reportStoreScope(
  ctx: BusinessContext,
  filters: ReportFilters,
): string | null {
  if (filters.storeId) return filters.storeId;
  /* The `permissions.has("*")` check that used to be here was dead — no
     permission set ever contains a literal star. The Owner receives the full key
     list instead, which `storeScope` accounts for via `isOwner`. */
  return storeScope(ctx);
}

/* ========================================================================== */
/* Sales                                                                      */
/* ========================================================================== */

const salesRegister: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);
  const limit = Math.min(filters.limit ?? MAX_ROWS, MAX_ROWS);

  const where = and(
    eq(salesInvoices.tenant_id, ctx.business.id),
    storeId ? eq(salesInvoices.store_id, storeId) : undefined,
    gte(salesInvoices.invoice_date, from),
    lte(salesInvoices.invoice_date, to),
  );

  const rows = await db
    .select({
      _id: salesInvoices.id,
      invoice_number: salesInvoices.invoice_number,
      invoice_date: salesInvoices.invoice_date,
      customer: salesInvoices.customer_name,
      cashier: users.full_name,
      channel: salesInvoices.channel,
      subtotal: salesInvoices.subtotal,
      discount: salesInvoices.discount_amount,
      tax: salesInvoices.tax_amount,
      total: salesInvoices.grand_total,
      paid: salesInvoices.paid_amount,
      balance: salesInvoices.balance_amount,
      profit: salesInvoices.gross_profit,
      status: salesInvoices.payment_status,
    })
    .from(salesInvoices)
    .leftJoin(users, eq(users.id, salesInvoices.cashier_id))
    .where(where)
    .orderBy(desc(salesInvoices.invoice_date))
    .limit(limit);

  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      subtotal: sql<string>`coalesce(sum(${salesInvoices.subtotal}), 0)`,
      discount: sql<string>`coalesce(sum(${salesInvoices.discount_amount}), 0)`,
      tax: sql<string>`coalesce(sum(${salesInvoices.tax_amount}), 0)`,
      total: sql<string>`coalesce(sum(case when ${salesInvoices.status} <> 'cancelled' then ${salesInvoices.grand_total} else 0 end), 0)`,
      paid: sql<string>`coalesce(sum(${salesInvoices.paid_amount}), 0)`,
      balance: sql<string>`coalesce(sum(${salesInvoices.balance_amount}), 0)`,
      profit: sql<string>`coalesce(sum(case when ${salesInvoices.status} <> 'cancelled' then ${salesInvoices.gross_profit} else 0 end), 0)`,
    })
    .from(salesInvoices)
    .where(where);

  const canSeeProfit = ctx.permissions.has("reports.financial") || ctx.permissions.has("*");

  const columns: ReportColumn[] = [
    { key: "invoice_number", label: "Invoice", linkTo: "/sales" },
    { key: "invoice_date", label: "Date", format: "datetime" },
    { key: "customer", label: "Customer" },
    { key: "cashier", label: "Cashier" },
    { key: "channel", label: "Channel", format: "status" },
    { key: "subtotal", label: "Subtotal", format: "money", align: "right" },
    { key: "discount", label: "Discount", format: "money", align: "right" },
    { key: "tax", label: "Tax", format: "money", align: "right" },
    { key: "total", label: "Total", format: "money", align: "right" },
    { key: "paid", label: "Paid", format: "money", align: "right" },
    { key: "balance", label: "Balance", format: "money", align: "right" },
    ...(canSeeProfit
      ? [
          {
            key: "profit",
            label: "Profit",
            format: "money" as ColumnFormat,
            align: "right" as const,
          },
        ]
      : []),
    { key: "status", label: "Status", format: "status", align: "right" },
  ];

  const revenue = dec(totals?.total ?? "0");
  const count = totals?.count ?? 0;

  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: rows.length >= limit,
    totals: {
      invoice_number: `${count} invoice${count === 1 ? "" : "s"}`,
      subtotal: totals?.subtotal,
      discount: totals?.discount,
      tax: totals?.tax,
      total: totals?.total,
      paid: totals?.paid,
      balance: totals?.balance,
      profit: totals?.profit,
    },
    summary: [
      { label: "Revenue", value: revenue, format: "money", tone: "accent" },
      { label: "Invoices", value: String(count), format: "number" },
      {
        label: "Average order",
        value: count > 0 ? div(revenue, String(count)) : "0",
        format: "money",
      },
      ...(canSeeProfit
        ? [
            {
              label: "Gross profit",
              value: dec(totals?.profit ?? "0"),
              format: "money" as ColumnFormat,
              tone: "success" as const,
            },
          ]
        : []),
      {
        label: "Outstanding",
        value: dec(totals?.balance ?? "0"),
        format: "money",
        tone: "warning",
      },
    ],
  };
};

const dailySales: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);
  const tz = safeTimeZone(ctx.business.timezone);

  // Inlined zone: a bound parameter would render differently in SELECT and
  // GROUP BY, which Postgres rejects as unequal expressions.
  const dayExpr = sql.raw(
    `to_char("sales_invoices"."invoice_date" at time zone '${tz.replace(/'/g, "")}', 'YYYY-MM-DD')`,
  );

  const rows = await db
    .select({
      day: sql<string>`${dayExpr}`,
      invoices: sql<number>`count(*)::int`,
      units: sql<string>`0`,
      subtotal: sql<string>`coalesce(sum(${salesInvoices.subtotal}), 0)`,
      discount: sql<string>`coalesce(sum(${salesInvoices.discount_amount}), 0)`,
      tax: sql<string>`coalesce(sum(${salesInvoices.tax_amount}), 0)`,
      total: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      profit: sql<string>`coalesce(sum(${salesInvoices.gross_profit}), 0)`,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.tenant_id, ctx.business.id),
        storeId ? eq(salesInvoices.store_id, storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        lte(salesInvoices.invoice_date, to),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(dayExpr)
    .orderBy(desc(dayExpr))
    .limit(MAX_ROWS);

  const revenue = rows.reduce((acc, r) => acc + toNumber(r.total), 0);
  const profit = rows.reduce((acc, r) => acc + toNumber(r.profit), 0);
  const invoices = rows.reduce((acc, r) => acc + r.invoices, 0);

  return {
    columns: [
      { key: "day", label: "Date" },
      { key: "invoices", label: "Invoices", format: "number", align: "right" },
      { key: "subtotal", label: "Subtotal", format: "money", align: "right" },
      { key: "discount", label: "Discount", format: "money", align: "right" },
      { key: "tax", label: "Tax", format: "money", align: "right" },
      { key: "total", label: "Revenue", format: "money", align: "right" },
      { key: "profit", label: "Profit", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      day: `${rows.length} day${rows.length === 1 ? "" : "s"}`,
      invoices,
      total: String(revenue),
      profit: String(profit),
    },
    summary: [
      { label: "Revenue", value: String(revenue), format: "money", tone: "accent" },
      { label: "Invoices", value: String(invoices), format: "number" },
      { label: "Gross profit", value: String(profit), format: "money", tone: "success" },
      {
        label: "Best day",
        value:
          rows.length > 0
            ? [...rows].sort((a, b) => toNumber(b.total) - toNumber(a.total))[0].day
            : "—",
      },
    ],
  };
};

const productSales: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: salesInvoiceItems.product_id,
      product: salesInvoiceItems.product_name,
      sku: salesInvoiceItems.product_sku,
      category: categories.name,
      brand: brands.name,
      quantity: sql<string>`coalesce(sum(${salesInvoiceItems.quantity}), 0)`,
      revenue: sql<string>`coalesce(sum(${salesInvoiceItems.line_total}), 0)`,
      cost: sql<string>`coalesce(sum(${salesInvoiceItems.unit_cost} * ${salesInvoiceItems.quantity}), 0)`,
      profit: sql<string>`coalesce(sum(${salesInvoiceItems.line_total} - ${salesInvoiceItems.tax_amount} - (${salesInvoiceItems.unit_cost} * ${salesInvoiceItems.quantity})), 0)`,
      returned: sql<string>`coalesce(sum(${salesInvoiceItems.quantity_returned}), 0)`,
    })
    .from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoice_id))
    .leftJoin(products, eq(products.id, salesInvoiceItems.product_id))
    .leftJoin(categories, eq(categories.id, products.category_id))
    .leftJoin(brands, eq(brands.id, products.brand_id))
    .where(
      and(
        eq(salesInvoices.tenant_id, ctx.business.id),
        storeId ? eq(salesInvoices.store_id, storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        lte(salesInvoices.invoice_date, to),
        sql`${salesInvoices.status} <> 'cancelled'`,
        filters.categoryId ? eq(products.category_id, filters.categoryId) : undefined,
      ),
    )
    .groupBy(
      salesInvoiceItems.product_id,
      salesInvoiceItems.product_name,
      salesInvoiceItems.product_sku,
      categories.name,
      brands.name,
    )
    .orderBy(desc(sql`sum(${salesInvoiceItems.line_total})`))
    .limit(MAX_ROWS);

  const revenue = rows.reduce((acc, r) => acc + toNumber(r.revenue), 0);
  const units = rows.reduce((acc, r) => acc + toNumber(r.quantity), 0);
  const profit = rows.reduce((acc, r) => acc + toNumber(r.profit), 0);

  return {
    columns: [
      { key: "product", label: "Product", linkTo: "/products" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "quantity", label: "Units sold", format: "quantity", align: "right" },
      { key: "returned", label: "Returned", format: "quantity", align: "right" },
      { key: "revenue", label: "Revenue", format: "money", align: "right" },
      { key: "cost", label: "Cost", format: "money", align: "right" },
      { key: "profit", label: "Profit", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    totals: {
      product: `${rows.length} product${rows.length === 1 ? "" : "s"}`,
      quantity: String(units),
      revenue: String(revenue),
      profit: String(profit),
    },
    summary: [
      { label: "Revenue", value: String(revenue), format: "money", tone: "accent" },
      { label: "Units sold", value: String(units), format: "quantity" },
      { label: "Gross profit", value: String(profit), format: "money", tone: "success" },
      {
        label: "Margin",
        value:
          revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0",
        format: "percent",
      },
    ],
  };
};

const salesByEmployee: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: users.id,
      employee: users.full_name,
      code: users.employee_code,
      invoices: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      profit: sql<string>`coalesce(sum(${salesInvoices.gross_profit}), 0)`,
      discount: sql<string>`coalesce(sum(${salesInvoices.discount_amount}), 0)`,
      refunds: sql<string>`coalesce(sum(${salesInvoices.refunded_amount}), 0)`,
      average: sql<string>`coalesce(avg(${salesInvoices.grand_total}), 0)`,
    })
    .from(salesInvoices)
    .innerJoin(users, eq(users.id, salesInvoices.cashier_id))
    .where(
      and(
        eq(salesInvoices.tenant_id, ctx.business.id),
        storeId ? eq(salesInvoices.store_id, storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        lte(salesInvoices.invoice_date, to),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(users.id, users.full_name, users.employee_code)
    .orderBy(desc(sql`sum(${salesInvoices.grand_total})`))
    .limit(MAX_ROWS);

  const revenue = rows.reduce((acc, r) => acc + toNumber(r.revenue), 0);

  return {
    columns: [
      { key: "employee", label: "Employee", linkTo: "/employees" },
      { key: "code", label: "Code" },
      { key: "invoices", label: "Invoices", format: "number", align: "right" },
      { key: "revenue", label: "Revenue", format: "money", align: "right" },
      { key: "average", label: "Average bill", format: "money", align: "right" },
      { key: "discount", label: "Discounts given", format: "money", align: "right" },
      { key: "refunds", label: "Refunds", format: "money", align: "right" },
      { key: "profit", label: "Profit", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      employee: `${rows.length} employee${rows.length === 1 ? "" : "s"}`,
      revenue: String(revenue),
      invoices: rows.reduce((acc, r) => acc + r.invoices, 0),
    },
    summary: [
      { label: "Revenue", value: String(revenue), format: "money", tone: "accent" },
      { label: "Employees selling", value: String(rows.length), format: "number" },
      {
        label: "Top performer",
        value: rows[0]?.employee ?? "—",
      },
    ],
  };
};

const paymentReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      method: salePayments.method,
      transactions: sql<number>`count(*)::int`,
      collected: sql<string>`coalesce(sum(case when ${salePayments.is_refund} = false then ${salePayments.amount} else 0 end), 0)`,
      refunded: sql<string>`coalesce(sum(case when ${salePayments.is_refund} = true then abs(${salePayments.amount}) else 0 end), 0)`,
      net: sql<string>`coalesce(sum(${salePayments.amount}), 0)`,
    })
    .from(salePayments)
    .where(
      and(
        eq(salePayments.tenant_id, ctx.business.id),
        storeId ? eq(salePayments.store_id, storeId) : undefined,
        gte(salePayments.paid_at, from),
        lte(salePayments.paid_at, to),
      ),
    )
    .groupBy(salePayments.method)
    .orderBy(desc(sql`sum(${salePayments.amount})`));

  const net = rows.reduce((acc, r) => acc + toNumber(r.net), 0);

  return {
    columns: [
      { key: "method", label: "Method", format: "status" },
      { key: "transactions", label: "Transactions", format: "number", align: "right" },
      { key: "collected", label: "Collected", format: "money", align: "right" },
      { key: "refunded", label: "Refunded", format: "money", align: "right" },
      { key: "net", label: "Net", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      method: "All methods",
      transactions: rows.reduce((acc, r) => acc + r.transactions, 0),
      net: String(net),
    },
    summary: [
      { label: "Net collected", value: String(net), format: "money", tone: "accent" },
      {
        label: "Methods used",
        value: String(rows.length),
        format: "number",
      },
      {
        label: "Largest method",
        value: rows[0]?.method ?? "—",
        format: "status",
      },
    ],
  };
};

const refundReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: salesReturns.id,
      return_number: salesReturns.return_number,
      return_date: salesReturns.return_date,
      invoice: salesInvoices.invoice_number,
      customer: salesInvoices.customer_name,
      reason: salesReturns.reason,
      refund_method: salesReturns.refund_method,
      restock: salesReturns.restock,
      total: salesReturns.grand_total,
    })
    .from(salesReturns)
    .innerJoin(salesInvoices, eq(salesInvoices.id, salesReturns.invoice_id))
    .where(
      and(
        eq(salesReturns.tenant_id, ctx.business.id),
        storeId ? eq(salesReturns.store_id, storeId) : undefined,
        gte(salesReturns.return_date, from),
        lte(salesReturns.return_date, to),
      ),
    )
    .orderBy(desc(salesReturns.return_date))
    .limit(MAX_ROWS);

  const total = rows.reduce((acc, r) => acc + toNumber(r.total), 0);

  return {
    columns: [
      { key: "return_number", label: "Return" },
      { key: "return_date", label: "Date", format: "datetime" },
      { key: "invoice", label: "Invoice" },
      { key: "customer", label: "Customer" },
      { key: "reason", label: "Reason", format: "status" },
      { key: "refund_method", label: "Refunded via", format: "status" },
      { key: "total", label: "Amount", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      return_number: `${rows.length} return${rows.length === 1 ? "" : "s"}`,
      total: String(total),
    },
    summary: [
      { label: "Refunded", value: String(total), format: "money", tone: "danger" },
      { label: "Returns", value: String(rows.length), format: "number" },
    ],
  };
};

/* ========================================================================== */
/* Financial                                                                  */
/* ========================================================================== */

const profitReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);
  const tz = safeTimeZone(ctx.business.timezone);

  const dayExpr = sql.raw(
    `to_char("sales_invoices"."invoice_date" at time zone '${tz.replace(/'/g, "")}', 'YYYY-MM-DD')`,
  );

  const salesRows = await db
    .select({
      day: sql<string>`${dayExpr}`,
      revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
      tax: sql<string>`coalesce(sum(${salesInvoices.tax_amount}), 0)`,
      cost: sql<string>`coalesce(sum(${salesInvoices.total_cost}), 0)`,
      gross: sql<string>`coalesce(sum(${salesInvoices.gross_profit}), 0)`,
    })
    .from(salesInvoices)
    .where(
      and(
        eq(salesInvoices.tenant_id, ctx.business.id),
        storeId ? eq(salesInvoices.store_id, storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        lte(salesInvoices.invoice_date, to),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(dayExpr)
    .orderBy(desc(dayExpr))
    .limit(MAX_ROWS);

  const [expenseTotals] = await db
    .select({
      total: sql<string>`coalesce(sum(${expenses.amount} + ${expenses.tax_amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenant_id, ctx.business.id),
        storeId ? eq(expenses.store_id, storeId) : undefined,
        gte(expenses.expense_date, from),
        lte(expenses.expense_date, to),
      ),
    );

  const revenue = salesRows.reduce((acc, r) => acc + toNumber(r.revenue), 0);
  const tax = salesRows.reduce((acc, r) => acc + toNumber(r.tax), 0);
  const cost = salesRows.reduce((acc, r) => acc + toNumber(r.cost), 0);
  const gross = salesRows.reduce((acc, r) => acc + toNumber(r.gross), 0);
  const expenseTotal = toNumber(expenseTotals?.total ?? 0);
  const net = gross - expenseTotal;

  return {
    columns: [
      { key: "day", label: "Date" },
      { key: "revenue", label: "Revenue", format: "money", align: "right" },
      { key: "tax", label: "Tax collected", format: "money", align: "right" },
      { key: "cost", label: "Cost of goods", format: "money", align: "right" },
      { key: "gross", label: "Gross profit", format: "money", align: "right" },
    ],
    rows: salesRows,
    rowCount: salesRows.length,
    truncated: false,
    totals: {
      day: `${salesRows.length} day${salesRows.length === 1 ? "" : "s"}`,
      revenue: String(revenue),
      tax: String(tax),
      cost: String(cost),
      gross: String(gross),
    },
    summary: [
      { label: "Revenue", value: String(revenue), format: "money", tone: "accent" },
      { label: "Cost of goods", value: String(cost), format: "money" },
      { label: "Gross profit", value: String(gross), format: "money", tone: "success" },
      { label: "Expenses", value: String(expenseTotal), format: "money", tone: "danger" },
      {
        label: "Net profit",
        value: String(net),
        format: "money",
        tone: net >= 0 ? "success" : "danger",
      },
      {
        label: "Net margin",
        value: revenue > 0 ? ((net / revenue) * 100).toFixed(1) : "0",
        format: "percent",
      },
    ],
  };
};

const taxReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      rate: salesInvoiceItems.tax_rate,
      lines: sql<number>`count(*)::int`,
      taxable: sql<string>`coalesce(sum(${salesInvoiceItems.line_subtotal} - ${salesInvoiceItems.discount_amount}), 0)`,
      tax: sql<string>`coalesce(sum(${salesInvoiceItems.tax_amount}), 0)`,
    })
    .from(salesInvoiceItems)
    .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceItems.invoice_id))
    .where(
      and(
        eq(salesInvoices.tenant_id, ctx.business.id),
        storeId ? eq(salesInvoices.store_id, storeId) : undefined,
        gte(salesInvoices.invoice_date, from),
        lte(salesInvoices.invoice_date, to),
        sql`${salesInvoices.status} <> 'cancelled'`,
      ),
    )
    .groupBy(salesInvoiceItems.tax_rate)
    .orderBy(asc(salesInvoiceItems.tax_rate));

  const tax = rows.reduce((acc, r) => acc + toNumber(r.tax), 0);
  const taxable = rows.reduce((acc, r) => acc + toNumber(r.taxable), 0);

  return {
    columns: [
      { key: "rate", label: "Tax rate", format: "percent" },
      { key: "lines", label: "Lines", format: "number", align: "right" },
      { key: "taxable", label: "Taxable value", format: "money", align: "right" },
      { key: "tax", label: "Tax", format: "money", align: "right" },
    ],
    rows: rows.map((r) => ({ ...r, rate: Number(r.rate) })),
    rowCount: rows.length,
    truncated: false,
    totals: {
      rate: "All rates",
      lines: rows.reduce((acc, r) => acc + r.lines, 0),
      taxable: String(taxable),
      tax: String(tax),
    },
    summary: [
      { label: "Tax collected", value: String(tax), format: "money", tone: "accent" },
      { label: "Taxable value", value: String(taxable), format: "money" },
      { label: "Rate bands", value: String(rows.length), format: "number" },
    ],
  };
};

const expenseSummary: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      category: sql<string>`coalesce(${expenseCategories.name}, 'Uncategorised')`,
      entries: sql<number>`count(*)::int`,
      amount: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      tax: sql<string>`coalesce(sum(${expenses.tax_amount}), 0)`,
      total: sql<string>`coalesce(sum(${expenses.amount} + ${expenses.tax_amount}), 0)`,
    })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.category_id))
    .where(
      and(
        eq(expenses.tenant_id, ctx.business.id),
        storeId ? eq(expenses.store_id, storeId) : undefined,
        gte(expenses.expense_date, from),
        lte(expenses.expense_date, to),
      ),
    )
    .groupBy(expenseCategories.name)
    .orderBy(desc(sql`sum(${expenses.amount} + ${expenses.tax_amount})`));

  const total = rows.reduce((acc, r) => acc + toNumber(r.total), 0);

  return {
    columns: [
      { key: "category", label: "Category" },
      { key: "entries", label: "Entries", format: "number", align: "right" },
      { key: "amount", label: "Amount", format: "money", align: "right" },
      { key: "tax", label: "Tax", format: "money", align: "right" },
      { key: "total", label: "Total", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      category: "All categories",
      entries: rows.reduce((acc, r) => acc + r.entries, 0),
      total: String(total),
    },
    summary: [
      { label: "Total expenses", value: String(total), format: "money", tone: "danger" },
      { label: "Categories", value: String(rows.length), format: "number" },
      {
        label: "Largest category",
        value: rows[0]?.category ?? "—",
      },
    ],
  };
};

const posSessionsReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);
  const { posSessions } = await import("@/db/schema");

  const rows = await db
    .select({
      _id: posSessions.id,
      session: posSessions.session_number,
      cashier: users.full_name,
      opened: posSessions.opened_at,
      closed: posSessions.closed_at,
      opening: posSessions.opening_cash,
      expected: posSessions.expected_cash,
      counted: posSessions.closing_cash,
      variance: posSessions.cash_variance,
      sales: posSessions.total_sales,
      transactions: posSessions.transaction_count,
    })
    .from(posSessions)
    .innerJoin(users, eq(users.id, posSessions.cashier_id))
    .where(
      and(
        eq(posSessions.tenant_id, ctx.business.id),
        storeId ? eq(posSessions.store_id, storeId) : undefined,
        gte(posSessions.opened_at, from),
        lte(posSessions.opened_at, to),
      ),
    )
    .orderBy(desc(posSessions.opened_at))
    .limit(MAX_ROWS);

  const sales = rows.reduce((acc, r) => acc + toNumber(r.sales), 0);
  const variance = rows.reduce((acc, r) => acc + toNumber(r.variance ?? 0), 0);

  return {
    columns: [
      { key: "session", label: "Session" },
      { key: "cashier", label: "Cashier" },
      { key: "opened", label: "Opened", format: "datetime" },
      { key: "closed", label: "Closed", format: "datetime" },
      { key: "opening", label: "Float", format: "money", align: "right" },
      { key: "expected", label: "Cash taken", format: "money", align: "right" },
      { key: "counted", label: "Counted", format: "money", align: "right" },
      { key: "variance", label: "Variance", format: "money", align: "right" },
      { key: "transactions", label: "Bills", format: "number", align: "right" },
      { key: "sales", label: "Sales", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      session: `${rows.length} session${rows.length === 1 ? "" : "s"}`,
      sales: String(sales),
      variance: String(variance),
    },
    summary: [
      { label: "Sales through POS", value: String(sales), format: "money", tone: "accent" },
      { label: "Sessions", value: String(rows.length), format: "number" },
      {
        label: "Net cash variance",
        value: String(variance),
        format: "money",
        tone: Math.abs(variance) < 0.005 ? "success" : "danger",
      },
    ],
  };
};

/* ========================================================================== */
/* Inventory                                                                  */
/* ========================================================================== */

const stockSummary: Runner = async (ctx, filters) => {
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: products.id,
      product: products.name,
      sku: products.sku,
      category: categories.name,
      unit: units.short_name,
      warehouse: warehouses.name,
      available: inventoryLevels.quantity_available,
      reserved: inventoryLevels.quantity_reserved,
      damaged: inventoryLevels.quantity_damaged,
      minimum: products.min_stock,
      average_cost: inventoryLevels.average_cost,
      value: sql<string>`${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}`,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouse_id))
    .leftJoin(categories, eq(categories.id, products.category_id))
    .leftJoin(units, eq(units.id, products.unit_id))
    .where(
      and(
        eq(inventoryLevels.tenant_id, ctx.business.id),
        storeId ? eq(inventoryLevels.store_id, storeId) : undefined,
        filters.warehouseId
          ? eq(inventoryLevels.warehouse_id, filters.warehouseId)
          : undefined,
        filters.categoryId ? eq(products.category_id, filters.categoryId) : undefined,
        isNull(products.deleted_at),
      ),
    )
    .orderBy(asc(products.name))
    .limit(MAX_ROWS);

  const value = rows.reduce((acc, r) => acc + toNumber(r.value), 0);
  const units_ = rows.reduce((acc, r) => acc + toNumber(r.available), 0);
  const low = rows.filter(
    (r) =>
      toNumber(r.minimum) > 0 && toNumber(r.available) <= toNumber(r.minimum),
  ).length;

  return {
    columns: [
      { key: "product", label: "Product", linkTo: "/products" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "warehouse", label: "Warehouse" },
      { key: "available", label: "Available", format: "quantity", align: "right" },
      { key: "reserved", label: "Reserved", format: "quantity", align: "right" },
      { key: "damaged", label: "Damaged", format: "quantity", align: "right" },
      { key: "minimum", label: "Minimum", format: "quantity", align: "right" },
      { key: "average_cost", label: "Avg. cost", format: "money", align: "right" },
      { key: "value", label: "Value", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    totals: {
      product: `${rows.length} line${rows.length === 1 ? "" : "s"}`,
      available: String(units_),
      value: String(value),
    },
    summary: [
      { label: "Stock value", value: String(value), format: "money", tone: "accent" },
      { label: "Units on hand", value: String(units_), format: "quantity" },
      {
        label: "At or below minimum",
        value: String(low),
        format: "number",
        tone: low > 0 ? "warning" : "success",
      },
    ],
  };
};

const inventoryValuation: Runner = async (ctx, filters) => {
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      category: sql<string>`coalesce(${categories.name}, 'Uncategorised')`,
      products: sql<number>`count(distinct ${products.id})::int`,
      units: sql<string>`coalesce(sum(${inventoryLevels.quantity_available}), 0)`,
      value: sql<string>`coalesce(sum(${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}), 0)`,
      retail: sql<string>`coalesce(sum(${inventoryLevels.quantity_available} * ${products.selling_price}), 0)`,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .leftJoin(categories, eq(categories.id, products.category_id))
    .where(
      and(
        eq(inventoryLevels.tenant_id, ctx.business.id),
        storeId ? eq(inventoryLevels.store_id, storeId) : undefined,
        filters.warehouseId
          ? eq(inventoryLevels.warehouse_id, filters.warehouseId)
          : undefined,
        isNull(products.deleted_at),
      ),
    )
    .groupBy(categories.name)
    .orderBy(desc(sql`sum(${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost})`));

  const cost = rows.reduce((acc, r) => acc + toNumber(r.value), 0);
  const retail = rows.reduce((acc, r) => acc + toNumber(r.retail), 0);

  return {
    columns: [
      { key: "category", label: "Category" },
      { key: "products", label: "Products", format: "number", align: "right" },
      { key: "units", label: "Units", format: "quantity", align: "right" },
      { key: "value", label: "Cost value", format: "money", align: "right" },
      { key: "retail", label: "Retail value", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      category: "All categories",
      value: String(cost),
      retail: String(retail),
    },
    summary: [
      { label: "Cost value", value: String(cost), format: "money", tone: "accent" },
      { label: "Retail value", value: String(retail), format: "money" },
      {
        label: "Potential margin",
        value: retail > 0 ? (((retail - cost) / retail) * 100).toFixed(1) : "0",
        format: "percent",
        tone: "success",
      },
    ],
  };
};

const lowStockReport: Runner = async (ctx, filters) => {
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: products.id,
      product: products.name,
      sku: products.sku,
      category: categories.name,
      warehouse: warehouses.name,
      available: inventoryLevels.quantity_available,
      minimum: products.min_stock,
      shortfall: sql<string>`${products.min_stock} - ${inventoryLevels.quantity_available}`,
      reorder: products.reorder_quantity,
      cost: products.cost_price,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouse_id))
    .leftJoin(categories, eq(categories.id, products.category_id))
    .where(
      and(
        eq(inventoryLevels.tenant_id, ctx.business.id),
        storeId ? eq(inventoryLevels.store_id, storeId) : undefined,
        filters.warehouseId
          ? eq(inventoryLevels.warehouse_id, filters.warehouseId)
          : undefined,
        eq(products.track_inventory, true),
        eq(products.status, "active"),
        isNull(products.deleted_at),
        sql`${products.min_stock} > 0`,
        sql`${inventoryLevels.quantity_available} <= ${products.min_stock}`,
      ),
    )
    .orderBy(desc(sql`${products.min_stock} - ${inventoryLevels.quantity_available}`))
    .limit(MAX_ROWS);

  const replenishmentCost = rows.reduce(
    (acc, r) =>
      acc +
      toNumber(r.cost) * toNumber(r.reorder ?? r.shortfall),
    0,
  );

  return {
    columns: [
      { key: "product", label: "Product", linkTo: "/products" },
      { key: "sku", label: "SKU" },
      { key: "category", label: "Category" },
      { key: "warehouse", label: "Warehouse" },
      { key: "available", label: "On hand", format: "quantity", align: "right" },
      { key: "minimum", label: "Minimum", format: "quantity", align: "right" },
      { key: "shortfall", label: "Shortfall", format: "quantity", align: "right" },
      { key: "reorder", label: "Suggested order", format: "quantity", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      product: `${rows.length} item${rows.length === 1 ? "" : "s"}`,
    },
    summary: [
      {
        label: "Items to reorder",
        value: String(rows.length),
        format: "number",
        tone: rows.length > 0 ? "warning" : "success",
      },
      {
        label: "Estimated replenishment cost",
        value: String(replenishmentCost),
        format: "money",
      },
      {
        label: "Out of stock",
        value: String(rows.filter((r) => toNumber(r.available) <= 0).length),
        format: "number",
        tone: "danger",
      },
    ],
  };
};

const stockLedgerReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      created_at: inventoryMovements.created_at,
      product: products.name,
      sku: products.sku,
      warehouse: warehouses.name,
      type: inventoryMovements.type,
      state: inventoryMovements.state,
      quantity: inventoryMovements.quantity,
      balance: inventoryMovements.balance_after,
      unit_cost: inventoryMovements.unit_cost,
      reference: inventoryMovements.reference_number,
      performed_by: users.full_name,
    })
    .from(inventoryMovements)
    .innerJoin(products, eq(products.id, inventoryMovements.product_id))
    .innerJoin(warehouses, eq(warehouses.id, inventoryMovements.warehouse_id))
    .leftJoin(users, eq(users.id, inventoryMovements.performed_by))
    .where(
      and(
        eq(inventoryMovements.tenant_id, ctx.business.id),
        storeId ? eq(inventoryMovements.store_id, storeId) : undefined,
        filters.warehouseId
          ? eq(inventoryMovements.warehouse_id, filters.warehouseId)
          : undefined,
        gte(inventoryMovements.created_at, from),
        lte(inventoryMovements.created_at, to),
      ),
    )
    .orderBy(desc(inventoryMovements.created_at))
    .limit(MAX_ROWS);

  const inbound = rows
    .filter((r) => toNumber(r.quantity) > 0)
    .reduce((acc, r) => acc + toNumber(r.quantity), 0);
  const outbound = rows
    .filter((r) => toNumber(r.quantity) < 0)
    .reduce((acc, r) => acc + Math.abs(toNumber(r.quantity)), 0);

  return {
    columns: [
      { key: "created_at", label: "When", format: "datetime" },
      { key: "product", label: "Product" },
      { key: "sku", label: "SKU" },
      { key: "warehouse", label: "Warehouse" },
      { key: "type", label: "Movement", format: "status" },
      { key: "quantity", label: "Change", format: "quantity", align: "right" },
      { key: "balance", label: "Balance", format: "quantity", align: "right" },
      { key: "reference", label: "Reference" },
      { key: "performed_by", label: "By" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    summary: [
      { label: "Movements", value: String(rows.length), format: "number" },
      { label: "Units in", value: String(inbound), format: "quantity", tone: "success" },
      { label: "Units out", value: String(outbound), format: "quantity", tone: "danger" },
    ],
  };
};

const adjustmentReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: stockAdjustments.id,
      number: stockAdjustments.adjustment_number,
      created_at: stockAdjustments.created_at,
      warehouse: warehouses.name,
      reason: stockAdjustments.reason,
      approval: stockAdjustments.approval_status,
      raised_by: users.full_name,
      lines: sql<number>`count(${stockAdjustmentItems.id})::int`,
      net_units: sql<string>`coalesce(sum(${stockAdjustmentItems.quantity}), 0)`,
      value: sql<string>`coalesce(sum(${stockAdjustmentItems.quantity} * ${stockAdjustmentItems.unit_cost}), 0)`,
    })
    .from(stockAdjustments)
    .innerJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouse_id))
    .leftJoin(users, eq(users.id, stockAdjustments.created_by))
    .leftJoin(
      stockAdjustmentItems,
      eq(stockAdjustmentItems.adjustment_id, stockAdjustments.id),
    )
    .where(
      and(
        eq(stockAdjustments.tenant_id, ctx.business.id),
        storeId ? eq(stockAdjustments.store_id, storeId) : undefined,
        gte(stockAdjustments.created_at, from),
        lte(stockAdjustments.created_at, to),
      ),
    )
    .groupBy(
      stockAdjustments.id,
      warehouses.name,
      users.full_name,
    )
    .orderBy(desc(stockAdjustments.created_at))
    .limit(MAX_ROWS);

  const value = rows.reduce((acc, r) => acc + toNumber(r.value), 0);

  return {
    columns: [
      { key: "number", label: "Adjustment", linkTo: "/inventory/adjustments" },
      { key: "created_at", label: "When", format: "datetime" },
      { key: "warehouse", label: "Warehouse" },
      { key: "reason", label: "Reason", format: "status" },
      { key: "approval", label: "Approval", format: "status" },
      { key: "raised_by", label: "Raised by" },
      { key: "lines", label: "Lines", format: "number", align: "right" },
      { key: "net_units", label: "Net units", format: "quantity", align: "right" },
      { key: "value", label: "Value impact", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      number: `${rows.length} adjustment${rows.length === 1 ? "" : "s"}`,
      value: String(value),
    },
    summary: [
      {
        label: "Net value impact",
        value: String(value),
        format: "money",
        tone: value < 0 ? "danger" : "success",
      },
      { label: "Adjustments", value: String(rows.length), format: "number" },
      {
        label: "Awaiting approval",
        value: String(rows.filter((r) => r.approval === "pending").length),
        format: "number",
        tone: "warning",
      },
    ],
  };
};

const movementHistory: Runner = stockLedgerReport;

const expiryReport: Runner = async (ctx, filters) => {
  const { inventoryBatches } = await import("@/db/schema");

  /* The horizon comes from `inventory.near_expiry_days`, not a constant. A
     pharmacy wants 90 days' warning and a bakery wants 3; hardcoding either
     makes the setting a lie. */
  const settings = await loadSettings({ businessId: ctx.business.id });
  const days = Math.max(
    1,
    Math.trunc(readNumber(settings, "inventory.near_expiry_days", 30)),
  );

  const conditions = [
    eq(inventoryBatches.tenant_id, ctx.business.id),
    sql`${inventoryBatches.expires_on} is not null`,
    sql`${inventoryBatches.expires_on} <= now() + make_interval(days => ${days})`,
  ];

  /* Batches are business-scoped — `inventory_batches` carries no store or
     warehouse — so the store and warehouse filters genuinely cannot narrow this
     report. Category can, and the report page offers it, so it is honoured. */
  if (filters.categoryId) {
    conditions.push(eq(products.category_id, filters.categoryId));
  }

  const rows = await db
    .select({
      _id: products.id,
      product: products.name,
      sku: products.sku,
      batch: inventoryBatches.batch_number,
      expires_on: inventoryBatches.expires_on,
      unit_cost: inventoryBatches.unit_cost,
    })
    .from(inventoryBatches)
    .innerJoin(products, eq(products.id, inventoryBatches.product_id))
    .where(and(...conditions))
    .orderBy(asc(inventoryBatches.expires_on))
    .limit(MAX_ROWS);

  const expired = rows.filter(
    (r) => r.expires_on !== null && r.expires_on < new Date(),
  ).length;

  return {
    columns: [
      { key: "product", label: "Product", linkTo: "/products" },
      { key: "sku", label: "SKU" },
      { key: "batch", label: "Batch" },
      { key: "expires_on", label: "Expires", format: "date" },
      { key: "unit_cost", label: "Unit cost", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    summary: [
      {
        label: "Already expired",
        value: String(expired),
        format: "number",
        tone: expired > 0 ? "danger" : "success",
      },
      {
        label: `Expiring within ${days} days`,
        value: String(rows.length - expired),
        format: "number",
        tone: "warning",
      },
    ],
  };
};

const productCatalogue: Runner = async (ctx, filters) => {
  const rows = await db
    .select({
      _id: products.id,
      product: products.name,
      sku: products.sku,
      barcode: products.barcode,
      category: categories.name,
      brand: brands.name,
      unit: units.short_name,
      cost_price: products.cost_price,
      selling_price: products.selling_price,
      margin: sql<string>`case when ${products.selling_price} > 0 then round(((${products.selling_price} - ${products.cost_price}) / ${products.selling_price}) * 100, 1) else 0 end`,
      status: products.status,
    })
    .from(products)
    .leftJoin(categories, eq(categories.id, products.category_id))
    .leftJoin(brands, eq(brands.id, products.brand_id))
    .leftJoin(units, eq(units.id, products.unit_id))
    .where(
      and(
        eq(products.tenant_id, ctx.business.id),
        isNull(products.deleted_at),
        filters.categoryId ? eq(products.category_id, filters.categoryId) : undefined,
      ),
    )
    .orderBy(asc(products.name))
    .limit(MAX_ROWS);

  return {
    columns: [
      { key: "product", label: "Product", linkTo: "/products" },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "category", label: "Category" },
      { key: "brand", label: "Brand" },
      { key: "unit", label: "Unit" },
      { key: "cost_price", label: "Cost", format: "money", align: "right" },
      { key: "selling_price", label: "Price", format: "money", align: "right" },
      { key: "margin", label: "Margin", format: "percent", align: "right" },
      { key: "status", label: "Status", format: "status", align: "right" },
    ],
    rows: rows.map((r) => ({ ...r, margin: Number(r.margin) })),
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    summary: [
      { label: "Products", value: String(rows.length), format: "number" },
      {
        label: "Active",
        value: String(rows.filter((r) => r.status === "active").length),
        format: "number",
        tone: "success",
      },
      {
        label: "Average margin",
        value:
          rows.length > 0
            ? (
                rows.reduce((acc, r) => acc + Number(r.margin), 0) / rows.length
              ).toFixed(1)
            : "0",
        format: "percent",
      },
    ],
  };
};

const priceList: Runner = productCatalogue;

/* ========================================================================== */
/* Purchases                                                                  */
/* ========================================================================== */

const purchaseRegister: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: purchaseOrders.id,
      order_number: purchaseOrders.order_number,
      order_date: purchaseOrders.order_date,
      supplier: suppliers.company_name,
      status: purchaseOrders.status,
      subtotal: purchaseOrders.subtotal,
      tax: purchaseOrders.tax_amount,
      total: purchaseOrders.grand_total,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
    .where(
      and(
        eq(purchaseOrders.tenant_id, ctx.business.id),
        storeId ? eq(purchaseOrders.store_id, storeId) : undefined,
        gte(purchaseOrders.order_date, from),
        lte(purchaseOrders.order_date, to),
      ),
    )
    .orderBy(desc(purchaseOrders.order_date))
    .limit(MAX_ROWS);

  const total = rows
    .filter((r) => r.status !== "cancelled")
    .reduce((acc, r) => acc + toNumber(r.total), 0);

  return {
    columns: [
      { key: "order_number", label: "Order", linkTo: "/purchases" },
      { key: "order_date", label: "Date", format: "date" },
      { key: "supplier", label: "Supplier" },
      { key: "status", label: "Status", format: "status" },
      { key: "subtotal", label: "Subtotal", format: "money", align: "right" },
      { key: "tax", label: "Tax", format: "money", align: "right" },
      { key: "total", label: "Total", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      order_number: `${rows.length} order${rows.length === 1 ? "" : "s"}`,
      total: String(total),
    },
    summary: [
      { label: "Order value", value: String(total), format: "money", tone: "accent" },
      { label: "Orders", value: String(rows.length), format: "number" },
      {
        label: "Open",
        value: String(
          rows.filter((r) =>
            ["approved", "sent", "partially_received"].includes(r.status),
          ).length,
        ),
        format: "number",
        tone: "warning",
      },
    ],
  };
};

const purchaseBySupplier: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const storeId = reportStoreScope(ctx, filters);

  const rows = await db
    .select({
      _id: suppliers.id,
      supplier: suppliers.company_name,
      code: suppliers.code,
      orders: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${purchaseOrders.grand_total}), 0)`,
      average: sql<string>`coalesce(avg(${purchaseOrders.grand_total}), 0)`,
      outstanding: suppliers.outstanding_balance,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
    .where(
      and(
        eq(purchaseOrders.tenant_id, ctx.business.id),
        storeId ? eq(purchaseOrders.store_id, storeId) : undefined,
        gte(purchaseOrders.order_date, from),
        lte(purchaseOrders.order_date, to),
        sql`${purchaseOrders.status} <> 'cancelled'`,
      ),
    )
    .groupBy(suppliers.id, suppliers.company_name, suppliers.code, suppliers.outstanding_balance)
    .orderBy(desc(sql`sum(${purchaseOrders.grand_total})`))
    .limit(MAX_ROWS);

  const total = rows.reduce((acc, r) => acc + toNumber(r.total), 0);

  return {
    columns: [
      { key: "supplier", label: "Supplier", linkTo: "/suppliers" },
      { key: "code", label: "Code" },
      { key: "orders", label: "Orders", format: "number", align: "right" },
      { key: "total", label: "Value", format: "money", align: "right" },
      { key: "average", label: "Average order", format: "money", align: "right" },
      { key: "outstanding", label: "Payable", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      supplier: `${rows.length} supplier${rows.length === 1 ? "" : "s"}`,
      total: String(total),
    },
    summary: [
      { label: "Purchase value", value: String(total), format: "money", tone: "accent" },
      { label: "Suppliers used", value: String(rows.length), format: "number" },
      { label: "Top supplier", value: rows[0]?.supplier ?? "—" },
    ],
  };
};

const supplierOutstanding: Runner = async (ctx) => {
  const rows = await db
    .select({
      _id: suppliers.id,
      supplier: suppliers.company_name,
      code: suppliers.code,
      contact: suppliers.contact_person,
      phone: suppliers.phone,
      credit_days: suppliers.credit_days,
      outstanding: suppliers.outstanding_balance,
      total_purchases: suppliers.total_purchases,
    })
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenant_id, ctx.business.id),
        isNull(suppliers.deleted_at),
        sql`${suppliers.outstanding_balance} <> 0`,
      ),
    )
    .orderBy(desc(suppliers.outstanding_balance))
    .limit(MAX_ROWS);

  const total = rows.reduce((acc, r) => acc + toNumber(r.outstanding), 0);

  return {
    columns: [
      { key: "supplier", label: "Supplier", linkTo: "/suppliers" },
      { key: "code", label: "Code" },
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "credit_days", label: "Terms", format: "number", align: "right" },
      { key: "total_purchases", label: "Lifetime spend", format: "money", align: "right" },
      { key: "outstanding", label: "Payable", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      supplier: `${rows.length} supplier${rows.length === 1 ? "" : "s"}`,
      outstanding: String(total),
    },
    summary: [
      { label: "Total payable", value: String(total), format: "money", tone: "warning" },
      { label: "Suppliers owed", value: String(rows.length), format: "number" },
    ],
  };
};

const purchaseSummaryReport: Runner = purchaseBySupplier;
const purchaseReturnsReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const { purchaseReturns } = await import("@/db/schema");

  const rows = await db
    .select({
      _id: purchaseReturns.id,
      return_number: purchaseReturns.return_number,
      return_date: purchaseReturns.return_date,
      supplier: suppliers.company_name,
      reason: purchaseReturns.reason,
      status: purchaseReturns.status,
      total: purchaseReturns.grand_total,
    })
    .from(purchaseReturns)
    .innerJoin(suppliers, eq(suppliers.id, purchaseReturns.supplier_id))
    .where(
      and(
        eq(purchaseReturns.tenant_id, ctx.business.id),
        gte(purchaseReturns.return_date, from),
        lte(purchaseReturns.return_date, to),
      ),
    )
    .orderBy(desc(purchaseReturns.return_date))
    .limit(MAX_ROWS);

  const total = rows.reduce((acc, r) => acc + toNumber(r.total), 0);

  return {
    columns: [
      { key: "return_number", label: "Return" },
      { key: "return_date", label: "Date", format: "date" },
      { key: "supplier", label: "Supplier" },
      { key: "reason", label: "Reason", format: "status" },
      { key: "status", label: "Status", format: "status" },
      { key: "total", label: "Value", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      return_number: `${rows.length} return${rows.length === 1 ? "" : "s"}`,
      total: String(total),
    },
    summary: [
      { label: "Returned to suppliers", value: String(total), format: "money", tone: "danger" },
      { label: "Returns", value: String(rows.length), format: "number" },
    ],
  };
};

/* ========================================================================== */
/* Customers and suppliers                                                    */
/* ========================================================================== */

const customerDirectory: Runner = async (ctx) => {
  const rows = await db
    .select({
      _id: customers.id,
      customer: customers.name,
      code: customers.code,
      type: customers.type,
      phone: customers.phone,
      email: customers.email,
      total_purchases: customers.total_purchases,
      purchase_count: customers.purchase_count,
      outstanding: customers.outstanding_balance,
      loyalty: customers.loyalty_points,
      last_purchase: customers.last_purchase_at,
      status: customers.status,
    })
    .from(customers)
    .where(
      and(eq(customers.tenant_id, ctx.business.id), isNull(customers.deleted_at)),
    )
    .orderBy(desc(customers.total_purchases))
    .limit(MAX_ROWS);

  const lifetime = rows.reduce((acc, r) => acc + toNumber(r.total_purchases), 0);

  return {
    columns: [
      { key: "customer", label: "Customer", linkTo: "/customers" },
      { key: "code", label: "Code" },
      { key: "type", label: "Type", format: "status" },
      { key: "phone", label: "Phone" },
      { key: "purchase_count", label: "Orders", format: "number", align: "right" },
      { key: "total_purchases", label: "Lifetime value", format: "money", align: "right" },
      { key: "outstanding", label: "Owes", format: "money", align: "right" },
      { key: "loyalty", label: "Points", format: "number", align: "right" },
      { key: "last_purchase", label: "Last purchase", format: "date" },
      { key: "status", label: "Status", format: "status", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    totals: {
      customer: `${rows.length} customer${rows.length === 1 ? "" : "s"}`,
      total_purchases: String(lifetime),
    },
    summary: [
      { label: "Customers", value: String(rows.length), format: "number" },
      { label: "Lifetime value", value: String(lifetime), format: "money", tone: "accent" },
      {
        label: "Average per customer",
        value: rows.length > 0 ? String(lifetime / rows.length) : "0",
        format: "money",
      },
    ],
  };
};

const customerOutstanding: Runner = async (ctx) => {
  const rows = await db
    .select({
      _id: customers.id,
      customer: customers.name,
      code: customers.code,
      phone: customers.phone,
      credit_limit: customers.credit_limit,
      outstanding: customers.outstanding_balance,
      available: sql<string>`greatest(${customers.credit_limit} - ${customers.outstanding_balance}, 0)`,
      terms: customers.payment_terms_days,
      status: customers.status,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        isNull(customers.deleted_at),
        sql`${customers.outstanding_balance} > 0`,
      ),
    )
    .orderBy(desc(customers.outstanding_balance))
    .limit(MAX_ROWS);

  const total = rows.reduce((acc, r) => acc + toNumber(r.outstanding), 0);
  const overLimit = rows.filter(
    (r) =>
      toNumber(r.credit_limit) > 0 &&
      toNumber(r.outstanding) > toNumber(r.credit_limit),
  ).length;

  return {
    columns: [
      { key: "customer", label: "Customer", linkTo: "/customers" },
      { key: "code", label: "Code" },
      { key: "phone", label: "Phone" },
      { key: "terms", label: "Terms (days)", format: "number", align: "right" },
      { key: "credit_limit", label: "Limit", format: "money", align: "right" },
      { key: "outstanding", label: "Owes", format: "money", align: "right" },
      { key: "available", label: "Available", format: "money", align: "right" },
      { key: "status", label: "Status", format: "status", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      customer: `${rows.length} customer${rows.length === 1 ? "" : "s"}`,
      outstanding: String(total),
    },
    summary: [
      { label: "Total receivable", value: String(total), format: "money", tone: "warning" },
      { label: "Customers owing", value: String(rows.length), format: "number" },
      {
        label: "Over their limit",
        value: String(overLimit),
        format: "number",
        tone: overLimit > 0 ? "danger" : "success",
      },
    ],
  };
};

const customerPurchases: Runner = customerDirectory;

const loyaltySummary: Runner = async (ctx) => {
  const rows = await db
    .select({
      _id: customers.id,
      customer: customers.name,
      code: customers.code,
      earned: customers.loyalty_points_earned,
      redeemed: customers.loyalty_points_redeemed,
      balance: customers.loyalty_points,
      total_purchases: customers.total_purchases,
    })
    .from(customers)
    .where(
      and(
        eq(customers.tenant_id, ctx.business.id),
        isNull(customers.deleted_at),
        sql`${customers.loyalty_points_earned} > 0`,
      ),
    )
    .orderBy(desc(customers.loyalty_points))
    .limit(MAX_ROWS);

  const outstanding = rows.reduce((acc, r) => acc + toNumber(r.balance), 0);

  return {
    columns: [
      { key: "customer", label: "Customer", linkTo: "/customers" },
      { key: "code", label: "Code" },
      { key: "earned", label: "Earned", format: "number", align: "right" },
      { key: "redeemed", label: "Redeemed", format: "number", align: "right" },
      { key: "balance", label: "Balance", format: "number", align: "right" },
      { key: "total_purchases", label: "Lifetime value", format: "money", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      customer: `${rows.length} member${rows.length === 1 ? "" : "s"}`,
      balance: String(outstanding),
    },
    summary: [
      { label: "Points outstanding", value: String(outstanding), format: "number", tone: "warning" },
      { label: "Members", value: String(rows.length), format: "number" },
    ],
  };
};

const supplierDirectory: Runner = async (ctx) => {
  const rows = await db
    .select({
      _id: suppliers.id,
      supplier: suppliers.company_name,
      code: suppliers.code,
      type: suppliers.type,
      contact: suppliers.contact_person,
      phone: suppliers.phone,
      credit_days: suppliers.credit_days,
      total_purchases: suppliers.total_purchases,
      purchase_count: suppliers.purchase_count,
      outstanding: suppliers.outstanding_balance,
      rating: suppliers.rating,
      status: suppliers.status,
    })
    .from(suppliers)
    .where(
      and(eq(suppliers.tenant_id, ctx.business.id), isNull(suppliers.deleted_at)),
    )
    .orderBy(desc(suppliers.total_purchases))
    .limit(MAX_ROWS);

  const spend = rows.reduce((acc, r) => acc + toNumber(r.total_purchases), 0);

  return {
    columns: [
      { key: "supplier", label: "Supplier", linkTo: "/suppliers" },
      { key: "code", label: "Code" },
      { key: "type", label: "Type", format: "status" },
      { key: "contact", label: "Contact" },
      { key: "phone", label: "Phone" },
      { key: "credit_days", label: "Terms", format: "number", align: "right" },
      { key: "purchase_count", label: "Receipts", format: "number", align: "right" },
      { key: "total_purchases", label: "Spend", format: "money", align: "right" },
      { key: "outstanding", label: "Payable", format: "money", align: "right" },
      { key: "status", label: "Status", format: "status", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    totals: {
      supplier: `${rows.length} supplier${rows.length === 1 ? "" : "s"}`,
      total_purchases: String(spend),
    },
    summary: [
      { label: "Suppliers", value: String(rows.length), format: "number" },
      { label: "Total spend", value: String(spend), format: "money", tone: "accent" },
    ],
  };
};

const supplierPerformance: Runner = supplierDirectory;

/* ========================================================================== */
/* Employees and audit                                                        */
/* ========================================================================== */

const employeeDirectory: Runner = async (ctx) => {
  const { departments, designations, stores } = await import("@/db/schema");

  const rows = await db
    .select({
      _id: users.id,
      employee: users.full_name,
      code: users.employee_code,
      email: users.email,
      phone: users.phone,
      store: stores.name,
      department: departments.name,
      designation: designations.name,
      employment_type: users.employment_type,
      joining_date: users.joining_date,
      last_login: users.last_login_at,
      status: users.status,
    })
    .from(users)
    .leftJoin(stores, eq(stores.id, users.store_id))
    .leftJoin(departments, eq(departments.id, users.department_id))
    .leftJoin(designations, eq(designations.id, users.designation_id))
    .where(and(eq(users.tenant_id, ctx.business.id), isNull(users.deleted_at)))
    .orderBy(asc(users.full_name))
    .limit(MAX_ROWS);

  return {
    columns: [
      { key: "employee", label: "Employee", linkTo: "/employees" },
      { key: "code", label: "Code" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "store", label: "Store" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "employment_type", label: "Type", format: "status" },
      { key: "joining_date", label: "Joined", format: "date" },
      { key: "last_login", label: "Last sign in", format: "date" },
      { key: "status", label: "Status", format: "status", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    summary: [
      { label: "Employees", value: String(rows.length), format: "number" },
      {
        label: "Active",
        value: String(rows.filter((r) => r.status === "active").length),
        format: "number",
        tone: "success",
      },
    ],
  };
};

const attendanceReport: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const { attendance } = await import("@/db/schema");

  const rows = await db
    .select({
      _id: users.id,
      employee: users.full_name,
      code: users.employee_code,
      present: sql<number>`count(*) filter (where ${attendance.status} in ('present','late'))::int`,
      absent: sql<number>`count(*) filter (where ${attendance.status} = 'absent')::int`,
      late: sql<number>`count(*) filter (where ${attendance.status} = 'late')::int`,
      leave: sql<number>`count(*) filter (where ${attendance.status} = 'leave')::int`,
      hours: sql<string>`round(coalesce(sum(${attendance.worked_minutes}), 0) / 60.0, 1)`,
    })
    .from(attendance)
    .innerJoin(users, eq(users.id, attendance.user_id))
    .where(
      and(
        eq(attendance.tenant_id, ctx.business.id),
        gte(attendance.work_date, from),
        lte(attendance.work_date, to),
      ),
    )
    .groupBy(users.id, users.full_name, users.employee_code)
    .orderBy(asc(users.full_name))
    .limit(MAX_ROWS);

  return {
    columns: [
      { key: "employee", label: "Employee", linkTo: "/employees" },
      { key: "code", label: "Code" },
      { key: "present", label: "Present", format: "number", align: "right" },
      { key: "late", label: "Late", format: "number", align: "right" },
      { key: "absent", label: "Absent", format: "number", align: "right" },
      { key: "leave", label: "On leave", format: "number", align: "right" },
      { key: "hours", label: "Hours worked", format: "number", align: "right" },
    ],
    rows,
    rowCount: rows.length,
    truncated: false,
    summary: [
      { label: "Employees with records", value: String(rows.length), format: "number" },
      {
        label: "Total present days",
        value: String(rows.reduce((acc, r) => acc + r.present, 0)),
        format: "number",
        tone: "success",
      },
    ],
  };
};

const activityLog: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const { auditLogs } = await import("@/db/schema");

  const rows = await db
    .select({
      created_at: auditLogs.created_at,
      actor: auditLogs.actor_name,
      event: auditLogs.event,
      module: auditLogs.module_slug,
      entity: auditLogs.entity_type,
      summary: auditLogs.summary,
      ip: auditLogs.ip_address,
    })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.tenant_id, ctx.business.id),
        gte(auditLogs.created_at, from),
        lte(auditLogs.created_at, to),
      ),
    )
    .orderBy(desc(auditLogs.created_at))
    .limit(MAX_ROWS);

  return {
    columns: [
      { key: "created_at", label: "When", format: "datetime" },
      { key: "actor", label: "Who" },
      { key: "event", label: "Event" },
      { key: "module", label: "Module", format: "status" },
      { key: "entity", label: "Entity", format: "status" },
      { key: "summary", label: "Detail" },
      { key: "ip", label: "IP" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    summary: [
      { label: "Events", value: String(rows.length), format: "number" },
      {
        label: "Distinct actors",
        value: String(new Set(rows.map((r) => r.actor)).size),
        format: "number",
      },
    ],
  };
};

const cashierPerformance: Runner = salesByEmployee;

/**
 * The full audit trail, including the store a change was made in and whether
 * the actor was a person or the system. `employees.activity` is the operational
 * view of the same table; this one is the administrative record.
 */
const auditTrail: Runner = async (ctx, filters) => {
  const { from, to } = resolveWindow(ctx, filters);
  const { auditLogs, stores } = await import("@/db/schema");

  const rows = await db
    .select({
      created_at: auditLogs.created_at,
      actor: auditLogs.actor_name,
      actor_type: auditLogs.actor_type,
      event: auditLogs.event,
      module: auditLogs.module_slug,
      entity: auditLogs.entity_type,
      store: stores.name,
      summary: auditLogs.summary,
      ip: auditLogs.ip_address,
    })
    .from(auditLogs)
    .leftJoin(stores, eq(stores.id, auditLogs.store_id))
    .where(
      and(
        eq(auditLogs.tenant_id, ctx.business.id),
        gte(auditLogs.created_at, from),
        lte(auditLogs.created_at, to),
      ),
    )
    .orderBy(desc(auditLogs.created_at))
    .limit(MAX_ROWS);

  const systemEvents = rows.filter((r) => r.actor_type === "system").length;

  return {
    columns: [
      { key: "created_at", label: "When", format: "datetime" },
      { key: "actor", label: "Who" },
      { key: "actor_type", label: "Actor", format: "status" },
      { key: "event", label: "Event" },
      { key: "module", label: "Module", format: "status" },
      { key: "entity", label: "Entity", format: "status" },
      { key: "store", label: "Store" },
      { key: "summary", label: "Detail" },
      { key: "ip", label: "IP" },
    ],
    rows,
    rowCount: rows.length,
    truncated: rows.length >= MAX_ROWS,
    summary: [
      { label: "Events", value: String(rows.length), format: "number" },
      {
        label: "Distinct actors",
        value: String(new Set(rows.map((r) => r.actor)).size),
        format: "number",
      },
      {
        label: "Automated",
        value: String(systemEvents),
        format: "number",
      },
    ],
  };
};

/* ========================================================================== */

const RUNNERS: Record<string, Runner> = {
  /* Sales */
  "sales.register": salesRegister,
  "sales.daily": dailySales,
  "sales.by_product": productSales,
  "sales.by_employee": salesByEmployee,
  "sales.payments": paymentReport,
  "sales.returns": refundReport,
  "sales.profit": profitReport,
  "sales.tax": taxReport,

  /* POS */
  "pos.cashier_performance": cashierPerformance,
  "pos.sessions": posSessionsReport,

  /* Inventory */
  "inventory.stock_summary": stockSummary,
  "inventory.ledger": stockLedgerReport,
  "inventory.valuation": inventoryValuation,
  "inventory.low_stock": lowStockReport,
  "inventory.movement": movementHistory,
  "inventory.adjustments": adjustmentReport,
  "inventory.expiry": expiryReport,

  /* Products */
  "products.catalog": productCatalogue,
  "products.price_list": priceList,

  /* Purchases */
  "purchases.register": purchaseRegister,
  "purchases.summary": purchaseSummaryReport,
  "purchases.by_supplier": purchaseBySupplier,
  "purchases.outstanding": supplierOutstanding,
  "purchases.returns": purchaseReturnsReport,

  /* Customers */
  "customers.directory": customerDirectory,
  "customers.purchases": customerPurchases,
  "customers.outstanding": customerOutstanding,
  "customers.loyalty": loyaltySummary,

  /* Suppliers */
  "suppliers.directory": supplierDirectory,
  "suppliers.outstanding": supplierOutstanding,
  "suppliers.performance": supplierPerformance,

  /* Employees */
  "employees.directory": employeeDirectory,
  "employees.attendance": attendanceReport,
  "employees.activity": activityLog,

  /* Financial */
  "expenses.summary": expenseSummary,

  /* Administration */
  "admin.audit_trail": auditTrail,
};

/** Report keys that have a working implementation. */
export const IMPLEMENTED_REPORTS = new Set(Object.keys(RUNNERS));

/** Serialises a report result to CSV, respecting the visible columns. */
export function toCsv(result: ReportResult): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const text =
      value instanceof Date ? value.toISOString() : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = result.columns.map((c) => escape(c.label)).join(",");
  const body = result.rows
    .map((row) => result.columns.map((c) => escape(row[c.key])).join(","))
    .join("\n");

  return `${header}\n${body}`;
}
