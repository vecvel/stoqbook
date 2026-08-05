import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar, SelectFilter } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { purchaseInvoices, purchaseOrders, suppliers } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Supplier invoices" };

export default async function PurchaseInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("purchases.payment", {
    feature: "purchases.invoices",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const filters = [eq(purchaseInvoices.tenant_id, ctx.business.id)];
  if (query.filters.status) {
    filters.push(
      eq(
        purchaseInvoices.payment_status,
        query.filters.status as "unpaid" | "partially_paid" | "paid",
      ),
    );
  }
  const where = and(...filters);
  const currency = ctx.business.currency;

  const [rows, totalRow, totals] = await Promise.all([
    db
      .select({
        id: purchaseInvoices.id,
        supplierInvoiceNumber: purchaseInvoices.supplier_invoice_number,
        number: purchaseInvoices.invoice_number,
        invoiceDate: purchaseInvoices.invoice_date,
        dueDate: purchaseInvoices.due_date,
        grandTotal: purchaseInvoices.grand_total,
        paidAmount: purchaseInvoices.paid_amount,
        balanceAmount: purchaseInvoices.balance_amount,
        paymentStatus: purchaseInvoices.payment_status,
        orderId: purchaseInvoices.order_id,
        orderNumber: purchaseOrders.order_number,
        supplierId: purchaseInvoices.supplier_id,
        supplierName: suppliers.company_name,
      })
      .from(purchaseInvoices)
      .innerJoin(suppliers, eq(suppliers.id, purchaseInvoices.supplier_id))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseInvoices.order_id))
      .where(where)
      .orderBy(desc(purchaseInvoices.invoice_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(purchaseInvoices).where(where),

    db
      .select({
        billed: sql<string>`coalesce(sum(${purchaseInvoices.grand_total}), 0)`,
        paid: sql<string>`coalesce(sum(${purchaseInvoices.paid_amount}), 0)`,
        outstanding: sql<string>`coalesce(sum(${purchaseInvoices.balance_amount}), 0)`,
        overdue: sql<string>`coalesce(sum(${purchaseInvoices.balance_amount})
          filter (where ${purchaseInvoices.due_date} < now()
            and ${purchaseInvoices.payment_status} <> 'paid'), 0)`,
      })
      .from(purchaseInvoices)
      .where(eq(purchaseInvoices.tenant_id, ctx.business.id)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const summary = totals[0];
  const today = new Date();

  return (
    <div className="page">
      <PageHeader
        title="Supplier invoices"
        description="What each supplier has billed, what has been paid, and what is still owed."
        breadcrumbs={[
          { label: "Purchases", href: "/purchases" },
          { label: "Invoices" },
        ]}
      />

      <StatGrid>
        <StatTile
          label="Billed"
          value={formatMoneyCompact(summary?.billed ?? "0", currency)}
          icon="Receipt"
        />
        <StatTile
          label="Paid"
          value={formatMoneyCompact(summary?.paid ?? "0", currency)}
          tone="success"
          icon="CircleCheck"
        />
        <StatTile
          label="Outstanding"
          value={formatMoneyCompact(summary?.outstanding ?? "0", currency)}
          tone={Number(summary?.outstanding ?? 0) > 0 ? "warning" : "neutral"}
          icon="Wallet"
        />
        <StatTile
          label="Overdue"
          value={formatMoneyCompact(summary?.overdue ?? "0", currency)}
          tone={Number(summary?.overdue ?? 0) > 0 ? "danger" : "neutral"}
          icon="AlertTriangle"
        />
      </StatGrid>

      <FilterBar>
        <SelectFilter
          paramName="status"
          label="Payment status"
          options={[
            { value: "unpaid", label: "Unpaid" },
            { value: "partially_paid", label: "Partially paid" },
            { value: "paid", label: "Paid" },
          ]}
        />
      </FilterBar>

      {total === 0 ? (
        <EmptyState
          icon="Receipt"
          title="No supplier invoices"
          description="Record a supplier invoice from the purchase order it belongs to, once the goods have been received."
          action={{ label: "Browse purchase orders", href: "/purchases" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Invoice</TH>
              <TH>Supplier</TH>
              <TH>Order</TH>
              <TH>Due</TH>
              <TH align="right">Total</TH>
              <TH align="right">Paid</TH>
              <TH align="right">Balance</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No invoices found.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const overdue =
                    row.dueDate !== null &&
                    new Date(row.dueDate) < today &&
                    row.paymentStatus !== "paid";
                  return (
                    <TR key={row.id}>
                      <TD>
                        <span className="font-mono text-xs font-medium">
                          {row.supplierInvoiceNumber ?? row.number}
                        </span>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(row.invoiceDate)}
                        </div>
                      </TD>
                      <TD>
                        <Link
                          href={`/suppliers/${row.supplierId}`}
                          className="max-w-[160px] truncate hover:text-accent hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                      </TD>
                      <TD>
                        {row.orderId ? (
                          <Link
                            href={`/purchases/${row.orderId}`}
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {row.orderNumber}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD
                        className={cn(
                          "text-muted-foreground",
                          overdue && "font-medium text-destructive",
                        )}
                      >
                        {row.dueDate ? formatDate(row.dueDate) : "On receipt"}
                        {overdue ? (
                          <div className="text-[11px]">Overdue</div>
                        ) : null}
                      </TD>
                      <TD align="right">
                        {formatMoney(row.grandTotal, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {formatMoney(row.paidAmount, { currency })}
                      </TD>
                      <TD
                        align="right"
                        className={cn(
                          "font-medium",
                          Number(row.balanceAmount) > 0 && "text-warning",
                        )}
                      >
                        {formatMoney(row.balanceAmount, { currency })}
                      </TD>
                      <TD align="right">
                        <StatusBadge status={row.paymentStatus} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
          <Pagination
            page={query.page}
            limit={query.limit}
            total={total}
            baseParams={{ status: query.filters.status }}
          />
        </TableShell>
      )}
    </div>
  );
}
