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
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import {
  branches,
  purchaseOrders,
  purchaseReturns,
  suppliers,
  warehouses,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatMoney, humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Purchase returns" };

export default async function PurchaseReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("purchases.return", {
    feature: "purchases.returns",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const where = and(eq(purchaseReturns.tenant_id, ctx.business.id));
  const currency = ctx.business.currency;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: purchaseReturns.id,
        number: purchaseReturns.return_number,
        date: purchaseReturns.return_date,
        status: purchaseReturns.status,
        reason: purchaseReturns.reason,
        grandTotal: purchaseReturns.grand_total,
        debitNote: purchaseReturns.debit_note_number,
        postedAt: purchaseReturns.posted_at,
        orderId: purchaseReturns.order_id,
        orderNumber: purchaseOrders.order_number,
        supplierId: purchaseReturns.supplier_id,
        supplierName: suppliers.company_name,
        warehouseName: warehouses.name,
        storeName: branches.name,
      })
      .from(purchaseReturns)
      .innerJoin(suppliers, eq(suppliers.id, purchaseReturns.supplier_id))
      .innerJoin(warehouses, eq(warehouses.id, purchaseReturns.warehouse_id))
      .innerJoin(branches, eq(branches.id, purchaseReturns.branch_id))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, purchaseReturns.order_id))
      .where(where)
      .orderBy(desc(purchaseReturns.return_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(purchaseReturns).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Purchase returns"
        description="Goods sent back to a supplier. A posted return removes the stock and raises a debit note against the supplier ledger."
        breadcrumbs={[
          { label: "Purchases", href: "/purchases" },
          { label: "Returns" },
        ]}
      />

      {total === 0 ? (
        <EmptyState
          icon="Undo2"
          title="No purchase returns"
          description="Raise a return from the receipt it belongs to. Open a received order and choose Return goods."
          action={{ label: "Browse receipts", href: "/purchases/receipts" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Return</TH>
              <TH>Supplier</TH>
              <TH>Order</TH>
              <TH>Warehouse</TH>
              <TH>Reason</TH>
              <TH>Debit note</TH>
              <TH align="right">Amount</TH>
              <TH align="right">Status</TH>
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
                        {formatDate(row.date)}
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
                    <TD className="text-muted-foreground">
                      {row.warehouseName}
                      <div className="text-[11px]">{row.storeName}</div>
                    </TD>
                    <TD>{humanise(row.reason)}</TD>
                    <TD className="font-mono text-xs text-muted-foreground">
                      {row.debitNote ?? "—"}
                    </TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(row.grandTotal, { currency })}
                    </TD>
                    <TD align="right">
                      <StatusBadge status={row.status} />
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
