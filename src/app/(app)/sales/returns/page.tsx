import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";

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
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { branches, salesInvoices, salesReturns, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatMoney, humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Sales returns" };

export default async function SalesReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("sales.return", {
    feature: "sales.returns",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const where = and(eq(salesReturns.tenant_id, ctx.business.id));
  const currency = ctx.business.currency;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: salesReturns.id,
        number: salesReturns.return_number,
        date: salesReturns.return_date,
        reason: salesReturns.reason,
        grandTotal: salesReturns.grand_total,
        refundMethod: salesReturns.refund_method,
        restock: salesReturns.restock,
        invoiceId: salesReturns.invoice_id,
        invoiceNumber: salesInvoices.invoice_number,
        customerName: salesInvoices.customer_name,
        storeName: branches.name,
        createdByName: users.full_name,
      })
      .from(salesReturns)
      .innerJoin(salesInvoices, eq(salesInvoices.id, salesReturns.invoice_id))
      .innerJoin(branches, eq(branches.id, salesReturns.branch_id))
      .leftJoin(users, eq(users.id, salesReturns.created_by))
      .where(where)
      .orderBy(desc(salesReturns.return_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(salesReturns).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Sales returns"
        description="Returns create positive inventory movements and a matching refund."
        breadcrumbs={[
          { label: "Sales", href: "/sales" },
          { label: "Returns" },
        ]}
      />

      {total === 0 ? (
        <EmptyState
          icon="ArrowLeftRight"
          title="No returns recorded"
          description="Process a return from the invoice it belongs to. Open a sale and choose Process return."
          action={{ label: "Browse sales", href: "/sales" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Return</TH>
              <TH>Invoice</TH>
              <TH>Customer</TH>
              <TH>Reason</TH>
              <TH>Refund via</TH>
              <TH>Restocked</TH>
              <TH>By</TH>
              <TH align="right">Amount</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No returns found.</EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <span className="font-mono text-xs font-medium">
                        {row.number}
                      </span>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDateTime(row.date)}
                      </div>
                    </TD>
                    <TD>
                      <Link
                        href={`/sales/${row.invoiceId}`}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {row.invoiceNumber}
                      </Link>
                    </TD>
                    <TD className="max-w-[160px] truncate text-muted-foreground">
                      {row.customerName ?? "Walk-in"}
                    </TD>
                    <TD>{humanise(row.reason)}</TD>
                    <TD className="text-muted-foreground">
                      {humanise(row.refundMethod)}
                    </TD>
                    <TD>
                      {row.restock ? (
                        <Badge variant="soft-success">Sellable</Badge>
                      ) : (
                        <Badge variant="soft-warning">Damaged</Badge>
                      )}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.createdByName ?? "—"}
                    </TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(row.grandTotal, { currency })}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          <Pagination
            page={query.page}
            limit={query.limit}
            total={total}
            baseParams={{}}
          />
        </TableShell>
      )}
    </div>
  );
}
