import { type NextRequest } from "next/server";

import { requirePermission } from "@/lib/authz/guard";
import { failFrom } from "@/lib/api/response";
import { storeScope } from "@/lib/authz/context";
import { visibleWidgets } from "@/lib/navigation";
import {
  entityCounts,
  expenseTotal,
  inventorySummary,
  outstandingReceivables,
  purchaseSummary,
  resolvePeriod,
  salesSummary,
  type DateRange,
  type WidgetScope,
} from "@/lib/services/dashboard";

const RANGES: DateRange[] = ["today", "week", "month", "quarter", "year"];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Exports the dashboard figures for a period as CSV.
 *
 * Only the metrics the caller's widgets already expose are included, so the
 * export can never reveal a figure the dashboard itself withholds.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("dashboard.export", { onDenied: "throw" });

    const rangeParam = String(
      request.nextUrl.searchParams.get("range") ?? "today",
    ) as DateRange;
    const range = RANGES.includes(rangeParam) ? rangeParam : "today";
    const period = resolvePeriod(range, ctx.business.timezone);

    const storeId = storeScope(ctx);
    const scope: WidgetScope = { ctx, period, storeId };
    const keys = new Set(visibleWidgets(ctx).map((w) => w.key));

    const [sales, inventory, purchases, counts, receivables, expenses] =
      await Promise.all([
        keys.has("sales.today_revenue") ? salesSummary(scope) : null,
        keys.has("inventory.value") ? inventorySummary(scope) : null,
        keys.has("purchases.outstanding_payables") ? purchaseSummary(scope) : null,
        entityCounts(ctx),
        keys.has("sales.outstanding_receivables")
          ? outstandingReceivables(scope)
          : null,
        keys.has("expenses.month_total") ? expenseTotal(scope) : null,
      ]);

    const rows: [string, string | number][] = [
      ["Business", ctx.business.name],
      ["Store", storeId ? (ctx.activeStore?.name ?? "") : "All stores"],
      ["Period", period.label],
      ["Currency", ctx.business.currency],
    ];

    if (sales) {
      rows.push(
        ["Revenue", sales.revenue],
        ["Transactions", sales.transactions],
        ["Gross profit", sales.grossProfit],
        ["Average bill", sales.averageBill],
      );
    }
    if (inventory) {
      rows.push(
        ["Inventory value", inventory.value],
        ["Units on hand", inventory.totalUnits],
        ["Low stock items", inventory.lowStock],
        ["Out of stock items", inventory.outOfStock],
      );
    }
    if (purchases) {
      rows.push(
        ["Pending approvals", purchases.pendingApprovals],
        ["Outstanding payables", purchases.outstandingPayables],
      );
    }
    if (receivables !== null) {
      rows.push(
        ["Outstanding receivables", receivables.total],
        ["Customers owing", receivables.customers],
      );
    }
    if (expenses !== null) rows.push(["Expenses", expenses]);

    rows.push(
      ["Products", counts.products],
      ["Customers", counts.customers],
      ["Suppliers", counts.suppliers],
      ["Employees", counts.employees],
    );

    const csv = [
      "Metric,Value",
      ...rows.map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`),
    ].join("\n");

    const filename = `dashboard-${range}-${period.from.toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return failFrom(error);
  }
}
