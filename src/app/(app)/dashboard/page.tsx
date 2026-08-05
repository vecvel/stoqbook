import type { Metadata } from "next";
import Link from "next/link";

import { RevenueTrendChart, PaymentMixChart } from "@/components/dashboard/charts";
import { Icon } from "@/components/layout/icon";
import { EmptyState, Notice } from "@/components/shared/empty-state";
import {
  RangePresetFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dashboardLayouts } from "@/db/schema";
import { MODULE_BY_SLUG } from "@/lib/registry";
import { requireUser } from "@/lib/authz/guard";
import { hasPermission, storeScope } from "@/lib/authz/context";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatQuantity,
} from "@/lib/format";
import { visibleQuickActions, visibleWidgets } from "@/lib/navigation";
import { toNumber } from "@/lib/money";
import {
  activePosSession,
  attendanceToday,
  awaitingReceipt,
  entityCounts,
  expenseTotal,
  inventorySummary,
  outstandingReceivables,
  paymentMix,
  purchaseSummary,
  recentProducts,
  recentSales,
  resolvePeriod,
  salesSummary,
  salesTrend,
  topCustomers,
  topProducts,
  topSuppliers,
  type DateRange,
  type WidgetScope,
} from "@/lib/services/dashboard";
import { lowStockItems } from "@/lib/services/inventory";
import { loadSettings, readString } from "@/lib/services/settings";

import { CustomiseDashboardDialog } from "./customise-dialog";

export const metadata: Metadata = { title: "Dashboard" };

const RANGES: DateRange[] = ["today", "week", "month", "quarter", "year"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireUser();
  const params = await searchParams;

  const rangeParam = String(params.range ?? "today") as DateRange;
  const range = RANGES.includes(rangeParam) ? rangeParam : "today";
  const period = resolvePeriod(range, ctx.business.timezone);

  const currency = ctx.business.currency;

  // Users without cross-branch permission only ever see their active branch.
  const storeId = storeScope(ctx);

  const scope: WidgetScope = { ctx, period, storeId };

  /* Only fetch data for widgets this user is actually allowed to see. */
  const permitted = visibleWidgets(ctx);
  const quickActions = visibleQuickActions(ctx);

  /* A saved layout narrows the permitted set; it never widens it, so revoking a
     permission immediately hides the widget regardless of what was saved. */
  const canCustomise =
    hasPermission(ctx, "dashboard.customize") &&
    ctx.entitlements.features.has("dashboard.custom_layout");

  const savedLayout = canCustomise
    ? (
        await db
          .select({ widgets: dashboardLayouts.widgets })
          .from(dashboardLayouts)
          .where(
            and(
              eq(dashboardLayouts.tenant_id, ctx.business.id),
              eq(dashboardLayouts.user_id, ctx.user.id),
            ),
          )
          .limit(1)
      )[0]?.widgets ?? []
    : [];

  const savedKeys = new Set(
    savedLayout.filter((w) => !w.hidden).map((w) => w.widget),
  );

  /* Resolution order: the user's own layout, then the business default set by
     whoever holds dashboard.manage_widgets, then everything permitted. */
  const businessDefault = new Set(
    readString(
      await loadSettings({ businessId: ctx.business.id }),
      "dashboard.default_widgets",
      "",
    )
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );

  const chosen =
    savedKeys.size > 0
      ? savedKeys
      : businessDefault.size > 0
        ? businessDefault
        : null;

  const widgets = chosen
    ? permitted.filter((w) => chosen.has(w.key))
    : permitted;
  const keys = new Set(widgets.map((w) => w.key));

  const needsSales =
    keys.has("sales.today_revenue") ||
    keys.has("sales.today_transactions") ||
    keys.has("sales.gross_profit") ||
    keys.has("sales.average_bill");

  const [
    sales,
    inventory,
    purchases,
    counts,
    trend,
    products,
    recent,
    payments,
    lowStock,
    awaiting,
    receivables,
    expenses,
    attendance,
    session,
    customers,
    suppliers,
    newProducts,
  ] = await Promise.all([
    needsSales ? salesSummary(scope) : null,
    keys.has("inventory.value") || keys.has("inventory.low_stock")
      ? inventorySummary(scope)
      : null,
    keys.has("purchases.pending_approvals") ||
    keys.has("purchases.outstanding_payables")
      ? purchaseSummary(scope)
      : null,
    entityCounts(ctx),
    keys.has("sales.trend") ? salesTrend(scope) : null,
    keys.has("sales.top_products") ? topProducts(scope) : null,
    keys.has("sales.recent") ? recentSales(scope) : null,
    keys.has("sales.payment_mix") ? paymentMix(scope) : null,
    keys.has("inventory.low_stock_list")
      ? lowStockItems(ctx.business.id, { storeId, limit: 8 })
      : null,
    keys.has("purchases.awaiting_receipt") ? awaitingReceipt(scope) : null,
    keys.has("sales.outstanding_receivables") ? outstandingReceivables(scope) : null,
    keys.has("expenses.month_total") ? expenseTotal(scope) : null,
    keys.has("employees.present_today") ? attendanceToday(scope) : null,
    keys.has("pos.active_session") ? activePosSession(ctx) : null,
    keys.has("customers.top") ? topCustomers(ctx) : null,
    keys.has("suppliers.top") ? topSuppliers(ctx) : null,
    keys.has("products.recently_added") ? recentProducts(ctx) : null,
  ]);

  const licence = ctx.entitlements;
  const showTrialWarning =
    licence.daysRemaining !== null && licence.daysRemaining <= 7;

  /* A brand-new installation gets an onboarding checklist instead of empty tiles. */
  const isEmpty =
    counts.products === 0 && counts.customers === 0 && counts.suppliers === 0;

  return (
    <div className="page">
      <PageHeader
        title={`Good ${greeting()}, ${ctx.user.full_name.split(" ")[0]}`}
        description={`${period.label} · ${
          storeId ? (ctx.activeStore?.name ?? "Store") : "All stores"
        }`}
        actions={
          <>
            <RangePresetFilter />
            {canCustomise ? (
              <CustomiseDashboardDialog
                widgets={permitted.map((w) => ({
                  key: w.key,
                  name: w.name,
                  moduleName: MODULE_BY_SLUG[w.moduleSlug]?.name ?? w.moduleSlug,
                  size: w.size,
                }))}
                selected={[...savedKeys]}
              />
            ) : null}
            {hasPermission(ctx, "dashboard.export") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/api/dashboard/export?range=${range}`}>Export</Link>
              </Button>
            ) : null}
          </>
        }
      />

      {!licence.isValid ? (
        <Notice
          tone="danger"
          title="Licence attention required"
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/settings/license">View licence</Link>
            </Button>
          }
        >
          {licence.invalidReason}
        </Notice>
      ) : showTrialWarning ? (
        <Notice
          tone="warning"
          title={`${licence.daysRemaining} day${licence.daysRemaining === 1 ? "" : "s"} left on your ${licence.plan?.name} plan`}
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/settings/license">Manage plan</Link>
            </Button>
          }
        >
          Renew to keep uninterrupted access.
        </Notice>
      ) : null}

      {isEmpty ? (
        <SetupChecklist
          hasProducts={counts.products > 0}
          hasSuppliers={counts.suppliers > 0}
          hasCustomers={counts.customers > 0}
          canCreateProducts={hasPermission(ctx, "products.create")}
        />
      ) : null}

      {/* Quick actions */}
      {quickActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action.href}
              asChild
              size="sm"
              variant={action.href === "/pos" ? "accent" : "outline"}
            >
              <Link href={action.href} className="gap-1.5">
                <Icon name={action.icon} className="size-3.5" />
                {action.label}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}

      {/* KPI tiles — rendered in registry priority order */}
      <StatGrid>
        {widgets
          .filter((w) => w.size === "small")
          .map((widget) => {
            const tile = renderTile(widget.key, {
              sales,
              inventory,
              purchases,
              counts,
              receivables,
              expenses,
              attendance,
              session,
              currency,
              periodLabel: period.label,
            });
            return tile ? <div key={widget.key}>{tile}</div> : null;
          })}
      </StatGrid>

      {/* Charts and lists */}
      <div className="grid gap-4 lg:grid-cols-3">
        {trend && keys.has("sales.trend") ? (
          <Panel
            title="Sales trend"
            description="Revenue and gross profit, last 14 days"
            className="lg:col-span-2"
          >
            <RevenueTrendChart data={trend} currency={currency} />
          </Panel>
        ) : null}

        {payments && keys.has("sales.payment_mix") ? (
          <Panel title="Payment mix" description={period.label}>
            {payments.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No payments recorded.
              </p>
            ) : (
              <PaymentMixChart
                data={payments.map((p) => ({
                  method: p.method,
                  amount: toNumber(p.amount),
                }))}
                currency={currency}
              />
            )}
          </Panel>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {products && keys.has("sales.top_products") ? (
          <Panel title="Best selling products" description={period.label}>
            <TableShell className="rounded-none border-0">
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Revenue</TH>
                </THead>
                <TBody>
                  {products.length === 0 ? (
                    <EmptyRow colSpan={3}>No sales in this period.</EmptyRow>
                  ) : (
                    products.map((p) => (
                      <TR key={p.productId}>
                        <TD>
                          <div className="font-medium">{p.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {p.sku}
                          </div>
                        </TD>
                        <TD align="right">{formatQuantity(p.quantity)}</TD>
                        <TD align="right">
                          {formatMoney(p.revenue, { currency })}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </Panel>
        ) : null}

        {lowStock && keys.has("inventory.low_stock_list") ? (
          <Panel
            title="Items needing reorder"
            description="At or below minimum stock"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/inventory?stock=low_stock">View all</Link>
              </Button>
            }
          >
            <TableShell className="rounded-none border-0">
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">Minimum</TH>
                  <TH align="right">Suggested</TH>
                </THead>
                <TBody>
                  {lowStock.length === 0 ? (
                    <EmptyRow colSpan={4}>
                      Every tracked item is above its minimum.
                    </EmptyRow>
                  ) : (
                    lowStock.map((item) => (
                      <TR key={`${item.productId}-${item.warehouseId}`}>
                        <TD>
                          <div className="font-medium">{item.name}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {item.sku}
                          </div>
                        </TD>
                        <TD align="right">
                          <span
                            className={
                              toNumber(item.available) <= 0
                                ? "font-semibold text-destructive"
                                : "font-semibold text-warning"
                            }
                          >
                            {formatQuantity(item.available)}
                          </span>
                        </TD>
                        <TD align="right" className="text-muted-foreground">
                          {formatQuantity(item.minStock)}
                        </TD>
                        <TD align="right">
                          {item.reorderQuantity
                            ? formatQuantity(item.reorderQuantity)
                            : "—"}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </Panel>
        ) : null}

        {recent && keys.has("sales.recent") ? (
          <Panel
            title="Recent sales"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/sales">View all</Link>
              </Button>
            }
          >
            <TableShell className="rounded-none border-0">
              <Table>
                <THead>
                  <TH>Invoice</TH>
                  <TH>Customer</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Status</TH>
                </THead>
                <TBody>
                  {recent.length === 0 ? (
                    <EmptyRow colSpan={4}>No sales yet.</EmptyRow>
                  ) : (
                    recent.map((sale) => (
                      <TR key={sale.id}>
                        <TD>
                          <Link
                            href={`/sales/${sale.id}`}
                            className="font-mono text-xs font-medium text-accent hover:underline"
                          >
                            {sale.invoiceNumber}
                          </Link>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDateTime(sale.invoiceDate)}
                          </div>
                        </TD>
                        <TD className="max-w-[160px] truncate">
                          {sale.customerName ?? "Walk-in"}
                        </TD>
                        <TD align="right">
                          {formatMoney(sale.grandTotal, { currency })}
                        </TD>
                        <TD align="right">
                          <StatusBadge status={sale.paymentStatus} />
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </Panel>
        ) : null}

        {awaiting && keys.has("purchases.awaiting_receipt") ? (
          <Panel
            title="Goods awaiting receipt"
            action={
              <Button asChild variant="ghost" size="xs">
                <Link href="/purchases">View all</Link>
              </Button>
            }
          >
            <TableShell className="rounded-none border-0">
              <Table>
                <THead>
                  <TH>Order</TH>
                  <TH>Supplier</TH>
                  <TH align="right">Value</TH>
                  <TH align="right">Status</TH>
                </THead>
                <TBody>
                  {awaiting.length === 0 ? (
                    <EmptyRow colSpan={4}>Nothing outstanding.</EmptyRow>
                  ) : (
                    awaiting.map((po) => (
                      <TR key={po.id}>
                        <TD>
                          <Link
                            href={`/purchases/${po.id}`}
                            className="font-mono text-xs font-medium text-accent hover:underline"
                          >
                            {po.orderNumber}
                          </Link>
                        </TD>
                        <TD className="max-w-[160px] truncate">
                          {po.supplierName}
                        </TD>
                        <TD align="right">
                          {formatMoney(po.grandTotal, { currency })}
                        </TD>
                        <TD align="right">
                          <StatusBadge status={po.status} />
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </Panel>
        ) : null}

        {customers && keys.has("customers.top") ? (
          <Panel title="Top customers" description="By lifetime value">
            <PartnerList
              rows={customers}
              currency={currency}
              hrefPrefix="/customers"
            />
          </Panel>
        ) : null}

        {suppliers && keys.has("suppliers.top") ? (
          <Panel title="Top suppliers" description="By purchase value">
            <PartnerList
              rows={suppliers}
              currency={currency}
              hrefPrefix="/suppliers"
            />
          </Panel>
        ) : null}

        {newProducts && keys.has("products.recently_added") ? (
          <Panel
            title="Recently added products"
            description="Newest catalogue entries"
          >
            <TableShell className="rounded-none border-0">
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH>Added</TH>
                  <TH align="right">Price</TH>
                </THead>
                <TBody>
                  {newProducts.length === 0 ? (
                    <EmptyRow colSpan={3}>No products yet.</EmptyRow>
                  ) : (
                    newProducts.map((product) => (
                      <TR key={product.id}>
                        <TD>
                          <Link
                            href={`/products/${product.id}`}
                            className="font-medium hover:text-accent hover:underline"
                          >
                            {product.name}
                          </Link>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {product.sku}
                          </div>
                        </TD>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDate(product.createdAt)}
                        </TD>
                        <TD align="right">
                          {formatMoney(product.sellingPrice, { currency })}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </Panel>
        ) : null}
      </div>

      {widgets.length === 0 ? (
        <EmptyState
          icon="LayoutDashboard"
          title="No widgets available"
          description="Your role does not grant access to any dashboard widgets yet. Ask an administrator to review your permissions."
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface TileData {
  sales: Awaited<ReturnType<typeof salesSummary>> | null;
  inventory: Awaited<ReturnType<typeof inventorySummary>> | null;
  purchases: Awaited<ReturnType<typeof purchaseSummary>> | null;
  counts: Awaited<ReturnType<typeof entityCounts>>;
  receivables: Awaited<ReturnType<typeof outstandingReceivables>> | null;
  expenses: string | null;
  attendance: Awaited<ReturnType<typeof attendanceToday>> | null;
  session: Awaited<ReturnType<typeof activePosSession>> | null;
  currency: string;
  periodLabel: string;
}

/** Maps a registry widget key to its rendered tile. */
function renderTile(key: string, d: TileData): React.ReactNode {
  const money = (v: string) => formatMoneyCompact(v, d.currency);

  switch (key) {
    case "sales.today_revenue":
      return d.sales ? (
        <StatTile
          label="Revenue"
          value={money(d.sales.revenue)}
          sublabel={d.periodLabel}
          delta={d.sales.revenueDelta}
          tone="accent"
          icon="Coins"
          href="/reports/sales.register"
        />
      ) : null;

    case "sales.today_transactions":
      return d.sales ? (
        <StatTile
          label="Transactions"
          value={formatNumber(d.sales.transactions)}
          sublabel={d.periodLabel}
          delta={d.sales.transactionsDelta}
          icon="Receipt"
          href="/sales"
        />
      ) : null;

    case "sales.gross_profit":
      return d.sales ? (
        <StatTile
          label="Gross profit"
          value={money(d.sales.grossProfit)}
          sublabel={d.periodLabel}
          tone="success"
          icon="TrendingUp"
          href="/reports/sales.profit"
        />
      ) : null;

    case "sales.average_bill":
      return d.sales ? (
        <StatTile
          label="Average bill"
          value={money(d.sales.averageBill)}
          sublabel={`${d.sales.transactions} bills`}
          icon="Receipt"
        />
      ) : null;

    case "inventory.value":
      return d.inventory ? (
        <StatTile
          label="Inventory value"
          value={money(d.inventory.value)}
          sublabel={`${formatQuantity(d.inventory.totalUnits)} units`}
          icon="Boxes"
          href="/reports/inventory.valuation"
        />
      ) : null;

    case "inventory.low_stock":
      return d.inventory ? (
        <StatTile
          label="Low stock"
          value={formatNumber(d.inventory.lowStock)}
          sublabel="At or below minimum"
          tone={d.inventory.lowStock > 0 ? "warning" : "neutral"}
          icon="AlertTriangle"
          href="/inventory?stock=low_stock"
        />
      ) : null;

    case "inventory.out_of_stock":
      return d.inventory ? (
        <StatTile
          label="Out of stock"
          value={formatNumber(d.inventory.outOfStock)}
          sublabel="Tracked items"
          tone={d.inventory.outOfStock > 0 ? "danger" : "neutral"}
          icon="PackageSearch"
          href="/inventory?stock=out_of_stock"
        />
      ) : null;

    case "purchases.pending_approvals":
      return d.purchases ? (
        <StatTile
          label="Pending approvals"
          value={formatNumber(d.purchases.pendingApprovals)}
          sublabel="Purchase orders"
          tone={d.purchases.pendingApprovals > 0 ? "warning" : "neutral"}
          icon="ClipboardList"
          href="/purchases?status=pending_approval"
        />
      ) : null;

    case "purchases.outstanding_payables":
      return d.purchases ? (
        <StatTile
          label="Payables"
          value={money(d.purchases.outstandingPayables)}
          sublabel="Owed to suppliers"
          tone="warning"
          icon="CreditCard"
          href="/reports/suppliers.outstanding"
        />
      ) : null;

    case "sales.outstanding_receivables":
      return d.receivables ? (
        <StatTile
          label="Receivables"
          value={money(d.receivables.total)}
          sublabel={`${d.receivables.customers} customers`}
          tone={toNumber(d.receivables.total) > 0 ? "warning" : "neutral"}
          icon="CreditCard"
          href="/reports/customers.outstanding"
        />
      ) : null;

    case "expenses.month_total":
      return d.expenses !== null ? (
        <StatTile
          label="Expenses"
          value={money(d.expenses)}
          sublabel={d.periodLabel}
          tone="danger"
          icon="Wallet"
          href="/expenses"
        />
      ) : null;

    case "products.total":
      return (
        <StatTile
          label="Products"
          value={formatNumber(d.counts.products)}
          sublabel={`${d.counts.activeProducts} active`}
          icon="Package"
          href="/products"
        />
      );

    case "customers.total":
      return (
        <StatTile
          label="Customers"
          value={formatNumber(d.counts.customers)}
          icon="Users"
          href="/customers"
        />
      );

    case "suppliers.total":
      return (
        <StatTile
          label="Suppliers"
          value={formatNumber(d.counts.suppliers)}
          icon="Truck"
          href="/suppliers"
        />
      );

    case "employees.total":
      return (
        <StatTile
          label="Employees"
          value={formatNumber(d.counts.employees)}
          icon="IdCard"
          href="/employees"
        />
      );

    case "employees.present_today":
      return d.attendance ? (
        <StatTile
          label="Present today"
          value={formatNumber(d.attendance.present)}
          sublabel={`${d.attendance.absent} absent · ${d.attendance.late} late`}
          tone="success"
          icon="IdCard"
          href="/employees/attendance"
        />
      ) : null;

    case "pos.active_session":
      return (
        <StatTile
          label="Current shift"
          value={d.session ? money(d.session.totalSales) : "Closed"}
          sublabel={
            d.session
              ? `${d.session.transactionCount} bills · ${d.session.sessionNumber}`
              : "No open cash session"
          }
          tone={d.session ? "accent" : "neutral"}
          icon="ScanLine"
          href="/pos"
        />
      );

    default:
      return null;
  }
}

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xs border border-border bg-card ${className ?? ""}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="text-[11px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function PartnerList({
  rows,
  currency,
  hrefPrefix,
}: {
  rows: { id: string; name: string; total: string; count: number }[];
  currency: string;
  hrefPrefix: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => toNumber(r.total)), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <Link
              href={`${hrefPrefix}/${row.id}`}
              className="truncate font-medium hover:text-accent hover:underline"
            >
              {row.name}
            </Link>
            <span className="shrink-0 tabular">
              {formatMoney(row.total, { currency })}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(toNumber(row.total) / max) * 100}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {row.count} orders
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SetupChecklist({
  hasProducts,
  hasSuppliers,
  hasCustomers,
  canCreateProducts,
}: {
  hasProducts: boolean;
  hasSuppliers: boolean;
  hasCustomers: boolean;
  canCreateProducts: boolean;
}) {
  const steps = [
    {
      done: hasProducts,
      label: "Add your products",
      description: "Build the catalogue that everything else references.",
      href: "/products/new",
    },
    {
      done: hasSuppliers,
      label: "Add a supplier",
      description: "Needed before you can raise a purchase order.",
      href: "/suppliers/new",
    },
    {
      done: hasCustomers,
      label: "Add a customer",
      description: "Optional — walk-in billing works out of the box.",
      href: "/customers/new",
    },
    {
      done: false,
      label: "Record your first sale",
      description: "Open the point of sale and bill a customer.",
      href: "/pos",
    },
  ];

  return (
    <section className="rounded-xs border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Get set up</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your store, warehouse, roles and tax groups are already set up. Four
          steps to go live.
        </p>
      </header>
      <ol className="divide-y divide-border">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                step.done
                  ? "bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={step.done ? "text-muted-foreground line-through" : "font-medium"}>
                {step.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {step.description}
              </div>
            </div>
            {!step.done && canCreateProducts ? (
              <Button asChild size="xs" variant="outline">
                <Link href={step.href}>Start</Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
