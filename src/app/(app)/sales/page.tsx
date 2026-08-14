import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  DateRangeFilter,
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stores, salesInvoices, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission, seesAllStores } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatMoney, humanise } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("sales.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
  });

  const currency = ctx.business.currency;
  const canViewProfit = hasPermission(ctx, "reports.financial");

  /* Store scope: users without cross-store access see only their store. */
  const storeIds = ctx.stores.map((b) => b.id);
  const filters = [eq(salesInvoices.tenant_id, ctx.business.id)];

  if (!seesAllStores(ctx) && ctx.activeStore) {
    filters.push(eq(salesInvoices.store_id, ctx.activeStore.id));
  } else if (storeIds.length > 0) {
    filters.push(or(...storeIds.map((id) => eq(salesInvoices.store_id, id)))!);
  }

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(salesInvoices.invoice_number, term),
        ilike(salesInvoices.customer_name, term),
        ilike(salesInvoices.customer_phone, term),
      )!,
    );
  }
  if (query.filters.payment) {
    filters.push(
      eq(
        salesInvoices.payment_status,
        query.filters.payment as typeof salesInvoices.$inferSelect.payment_status,
      ),
    );
  }
  if (query.filters.status) {
    filters.push(
      eq(
        salesInvoices.status,
        query.filters.status as typeof salesInvoices.$inferSelect.status,
      ),
    );
  }
  if (query.filters.channel) {
    filters.push(
      eq(
        salesInvoices.channel,
        query.filters.channel as typeof salesInvoices.$inferSelect.channel,
      ),
    );
  }
  if (query.filters.from) {
    filters.push(gte(salesInvoices.invoice_date, new Date(query.filters.from)));
  }
  if (query.filters.to) {
    const to = new Date(query.filters.to);
    to.setHours(23, 59, 59, 999);
    filters.push(lte(salesInvoices.invoice_date, to));
  }

  const where = and(...filters);

  const [rows, totalRow, aggregate] = await Promise.all([
    db
      .select({
        id: salesInvoices.id,
        invoiceNumber: salesInvoices.invoice_number,
        invoiceDate: salesInvoices.invoice_date,
        customerName: salesInvoices.customer_name,
        customerId: salesInvoices.customer_id,
        status: salesInvoices.status,
        channel: salesInvoices.channel,
        grandTotal: salesInvoices.grand_total,
        paidAmount: salesInvoices.paid_amount,
        balanceAmount: salesInvoices.balance_amount,
        grossProfit: salesInvoices.gross_profit,
        paymentStatus: salesInvoices.payment_status,
        storeName: stores.name,
        cashierName: users.full_name,
      })
      .from(salesInvoices)
      .innerJoin(stores, eq(stores.id, salesInvoices.store_id))
      .leftJoin(users, eq(users.id, salesInvoices.cashier_id))
      .where(where)
      .orderBy(desc(salesInvoices.invoice_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(salesInvoices).where(where),

    db
      .select({
        revenue: sql<string>`coalesce(sum(case when ${salesInvoices.status} <> 'cancelled' then ${salesInvoices.grand_total} else 0 end), 0)`,
        outstanding: sql<string>`coalesce(sum(${salesInvoices.balance_amount}), 0)`,
        profit: sql<string>`coalesce(sum(case when ${salesInvoices.status} <> 'cancelled' then ${salesInvoices.gross_profit} else 0 end), 0)`,
        refunded: sql<string>`coalesce(sum(${salesInvoices.refunded_amount}), 0)`,
      })
      .from(salesInvoices)
      .where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];

  const pageTotal = rows.reduce((acc, r) => acc + Number(r.grandTotal), 0);

  const baseParams = {
    search: query.search,
    payment: query.filters.payment,
    status: query.filters.status,
    channel: query.filters.channel,
    from: query.filters.from,
    to: query.filters.to,
  };

  const isFiltered = Object.values(baseParams).some(Boolean);

  return (
    <div className="page">
      <PageHeader
        title="Sales"
        description={`${total} invoice${total === 1 ? "" : "s"}`}
        actions={
          <>
            {hasPermission(ctx, "sales.export") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/reports/sales.register">Sales report</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "pos.use") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/pos">New sale</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Revenue"
          value={formatMoney(stats?.revenue ?? "0", { currency })}
          sublabel={isFiltered ? "Filtered" : "All time"}
          tone="accent"
          icon="Coins"
        />
        {canViewProfit ? (
          <StatTile
            label="Gross profit"
            value={formatMoney(stats?.profit ?? "0", { currency })}
            tone="success"
            icon="TrendingUp"
          />
        ) : null}
        <StatTile
          label="Outstanding"
          value={formatMoney(stats?.outstanding ?? "0", { currency })}
          sublabel="Unpaid balances"
          tone={Number(stats?.outstanding ?? 0) > 0 ? "warning" : "neutral"}
          icon="CreditCard"
        />
        <StatTile
          label="Refunded"
          value={formatMoney(stats?.refunded ?? "0", { currency })}
          tone={Number(stats?.refunded ?? 0) > 0 ? "danger" : "neutral"}
          icon="ArrowLeftRight"
        />
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search invoice, customer or phone…" />
        <SelectFilter
          paramName="payment"
          label="Payment"
          options={[
            { value: "paid", label: "Paid" },
            { value: "partially_paid", label: "Partially paid" },
            { value: "unpaid", label: "Unpaid" },
            { value: "refunded", label: "Refunded" },
          ]}
        />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "completed", label: "Completed" },
            { value: "returned", label: "Returned" },
            { value: "partially_returned", label: "Partially returned" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <SelectFilter
          paramName="channel"
          label="Channel"
          options={[
            { value: "pos_counter", label: "POS counter" },
            { value: "wholesale", label: "Wholesale" },
            { value: "online", label: "Online" },
            { value: "phone_order", label: "Phone" },
            { value: "whatsapp", label: "WhatsApp" },
          ]}
        />
        <DateRangeFilter />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="Receipt"
          title="No sales yet"
          description="Completed sales appear here with their payment status, profit and stock impact."
          action={
            hasPermission(ctx, "pos.use")
              ? { label: "Open the point of sale", href: "/pos" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Invoice</TH>
              <TH>Customer</TH>
              <TH>Store</TH>
              <TH>Cashier</TH>
              <TH>Channel</TH>
              <TH align="right">Total</TH>
              <TH align="right">Paid</TH>
              <TH align="right">Balance</TH>
              {canViewProfit ? <TH align="right">Profit</TH> : null}
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={canViewProfit ? 10 : 9}>
                  No sales match these filters.
                </EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.id} muted={row.status === "cancelled"}>
                    <TD>
                      <Link
                        href={`/sales/${row.id}`}
                        className="font-mono text-xs font-medium text-accent hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateTime(row.invoiceDate)}
                      </div>
                    </TD>
                    <TD className="max-w-[180px] truncate">
                      {row.customerId ? (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="hover:text-accent hover:underline"
                        >
                          {row.customerName ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {row.customerName ?? "Walk-in"}
                        </span>
                      )}
                    </TD>
                    <TD className="text-muted-foreground">{row.storeName}</TD>
                    <TD className="text-muted-foreground">
                      {row.cashierName ?? "—"}
                    </TD>
                    <TD>
                      <Badge variant="soft-neutral">
                        {humanise(row.channel)}
                      </Badge>
                    </TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(row.grandTotal, { currency })}
                    </TD>
                    <TD align="right" className="text-muted-foreground">
                      {formatMoney(row.paidAmount, { currency })}
                    </TD>
                    <TD
                      align="right"
                      className={
                        Number(row.balanceAmount) > 0
                          ? "font-semibold text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      {Number(row.balanceAmount) > 0
                        ? formatMoney(row.balanceAmount, { currency })
                        : "—"}
                    </TD>
                    {canViewProfit ? (
                      <TD
                        align="right"
                        className={
                          Number(row.grossProfit) < 0 ? "text-destructive" : ""
                        }
                      >
                        {formatMoney(row.grossProfit, { currency })}
                      </TD>
                    ) : null}
                    <TD align="right">
                      <StatusBadge
                        status={
                          row.status === "cancelled"
                            ? "cancelled"
                            : row.status === "returned" ||
                                row.status === "partially_returned"
                              ? row.status
                              : row.paymentStatus
                        }
                      />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
            {rows.length > 0 ? (
              <TFoot>
                <TD colSpan={5} align="right">
                  Page total
                </TD>
                <TD align="right">{formatMoney(pageTotal, { currency })}</TD>
                <TD colSpan={canViewProfit ? 4 : 3} />
              </TFoot>
            ) : null}
          </Table>
          <Pagination
            page={query.page}
            limit={query.limit}
            total={total}
            baseParams={baseParams}
          />
        </TableShell>
      )}
    </div>
  );
}
