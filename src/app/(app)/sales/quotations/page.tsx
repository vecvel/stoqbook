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
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { customers, quotationItems, quotations, salesInvoices } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatMoney, formatMoneyCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

import { QuotationRowActions } from "./quotation-actions";

export const metadata: Metadata = { title: "Quotations" };

type QuotationStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "converted";

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("sales.view", {
    feature: "sales.quotations",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const filters = [eq(quotations.tenant_id, ctx.business.id)];
  if (query.filters.status) {
    filters.push(eq(quotations.status, query.filters.status as QuotationStatus));
  }
  const where = and(...filters);
  const currency = ctx.business.currency;
  const canConvert = hasPermission(ctx, "sales.create");

  const [rows, totalRow, summary] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.quotation_number,
        date: quotations.quotation_date,
        validUntil: quotations.valid_until,
        status: quotations.status,
        grandTotal: quotations.grand_total,
        customerId: quotations.customer_id,
        customerName: customers.name,
        invoiceId: quotations.converted_invoice_id,
        invoiceNumber: salesInvoices.invoice_number,
        lineCount: db.$count(
          quotationItems,
          eq(quotationItems.quotation_id, quotations.id),
        ),
      })
      .from(quotations)
      .leftJoin(customers, eq(customers.id, quotations.customer_id))
      .leftJoin(
        salesInvoices,
        eq(salesInvoices.id, quotations.converted_invoice_id),
      )
      .where(where)
      .orderBy(desc(quotations.quotation_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(quotations).where(where),

    db
      .select({
        open: sql<number>`count(*) filter (where ${quotations.status} in ('draft','sent','accepted'))::int`,
        converted: sql<number>`count(*) filter (where ${quotations.status} = 'converted')::int`,
        openValue: sql<string>`coalesce(sum(${quotations.grand_total})
          filter (where ${quotations.status} in ('draft','sent','accepted')), 0)`,
        wonValue: sql<string>`coalesce(sum(${quotations.grand_total})
          filter (where ${quotations.status} = 'converted'), 0)`,
      })
      .from(quotations)
      .where(eq(quotations.tenant_id, ctx.business.id)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = summary[0];
  const now = new Date();

  return (
    <div className="page">
      <PageHeader
        title="Quotations"
        description="A priced offer with no stock or ledger effect. Converting one raises a real invoice at the quoted prices."
        breadcrumbs={[
          { label: "Sales", href: "/sales" },
          { label: "Quotations" },
        ]}
      />

      <StatGrid>
        <StatTile
          label="Open"
          value={String(stats?.open ?? 0)}
          sublabel="Draft, sent or accepted"
          tone="accent"
          icon="FileText"
        />
        <StatTile
          label="Open value"
          value={formatMoneyCompact(stats?.openValue ?? "0", currency)}
          icon="Coins"
        />
        <StatTile
          label="Converted"
          value={String(stats?.converted ?? 0)}
          tone="success"
          icon="CircleCheck"
        />
        <StatTile
          label="Won value"
          value={formatMoneyCompact(stats?.wonValue ?? "0", currency)}
          tone="success"
          icon="TrendingUp"
        />
      </StatGrid>

      <FilterBar>
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "sent", label: "Sent" },
            { value: "accepted", label: "Accepted" },
            { value: "rejected", label: "Rejected" },
            { value: "converted", label: "Converted" },
          ]}
        />
      </FilterBar>

      {total === 0 ? (
        <EmptyState
          icon="FileText"
          title="No quotations yet"
          description="Quote a customer before committing stock. Nothing is reserved and no ledger entry is made until the quotation is converted."
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Quotation</TH>
              <TH>Customer</TH>
              <TH align="right">Items</TH>
              <TH>Valid until</TH>
              <TH>Invoice</TH>
              <TH align="right">Total</TH>
              <TH align="right">Status</TH>
              <TH align="right" />
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No quotations found.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const expired =
                    row.validUntil !== null &&
                    new Date(row.validUntil) < now &&
                    row.status !== "converted";
                  return (
                    <TR key={row.id}>
                      <TD>
                        <span className="font-mono text-xs font-medium">
                          {row.number}
                        </span>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(row.date)}
                        </div>
                      </TD>
                      <TD>
                        {row.customerId ? (
                          <Link
                            href={`/customers/${row.customerId}`}
                            className="max-w-[160px] truncate hover:text-accent hover:underline"
                          >
                            {row.customerName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            No customer
                          </span>
                        )}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {row.lineCount}
                      </TD>
                      <TD
                        className={cn(
                          "text-muted-foreground",
                          expired && "font-medium text-destructive",
                        )}
                      >
                        {row.validUntil ? formatDate(row.validUntil) : "—"}
                        {expired ? (
                          <div className="text-[11px]">Expired</div>
                        ) : null}
                      </TD>
                      <TD>
                        {row.invoiceId ? (
                          <Link
                            href={`/sales/${row.invoiceId}`}
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {row.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(row.grandTotal, { currency })}
                      </TD>
                      <TD align="right">
                        {expired ? (
                          <Badge variant="soft-warning">Expired</Badge>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                      </TD>
                      <TD align="right">
                        <QuotationRowActions
                          quotationId={row.id}
                          status={row.status}
                          expired={expired}
                          canConvert={canConvert}
                        />
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
