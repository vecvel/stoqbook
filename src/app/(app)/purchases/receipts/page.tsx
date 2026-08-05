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
import {
  branches,
  goodsReceipts,
  purchaseOrders,
  suppliers,
  users,
  warehouses,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Goods receipts" };

export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("purchases.receive", {
    feature: "purchases.receipts",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const where = and(eq(goodsReceipts.tenant_id, ctx.business.id));
  const currency = ctx.business.currency;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: goodsReceipts.id,
        number: goodsReceipts.receipt_number,
        date: goodsReceipts.receipt_date,
        challan: goodsReceipts.challan_number,
        totalCost: goodsReceipts.total_cost,
        postedAt: goodsReceipts.posted_at,
        orderId: goodsReceipts.order_id,
        orderNumber: purchaseOrders.order_number,
        supplierName: suppliers.company_name,
        warehouseName: warehouses.name,
        storeName: branches.name,
        receivedByName: users.full_name,
      })
      .from(goodsReceipts)
      .innerJoin(suppliers, eq(suppliers.id, goodsReceipts.supplier_id))
      .innerJoin(warehouses, eq(warehouses.id, goodsReceipts.warehouse_id))
      .innerJoin(branches, eq(branches.id, goodsReceipts.branch_id))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.order_id))
      .leftJoin(users, eq(users.id, goodsReceipts.received_by))
      .where(where)
      .orderBy(desc(goodsReceipts.receipt_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(goodsReceipts).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Goods receipts"
        description="Every receipt against a purchase order. Receiving is what moves stock and sets landed cost — the order itself never does."
        breadcrumbs={[
          { label: "Purchases", href: "/purchases" },
          { label: "Receipts" },
        ]}
      />

      {total === 0 ? (
        <EmptyState
          icon="PackageCheck"
          title="Nothing received yet"
          description="Receive goods from the purchase order they belong to. Open an approved order and choose Receive goods."
          action={{ label: "Browse purchase orders", href: "/purchases" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Receipt</TH>
              <TH>Order</TH>
              <TH>Supplier</TH>
              <TH>Warehouse</TH>
              <TH>Challan</TH>
              <TH>Received by</TH>
              <TH>Posted</TH>
              <TH align="right">Landed cost</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No receipts found.</EmptyRow>
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
                      {row.orderId ? (
                        <Link
                          href={`/purchases/${row.orderId}`}
                          className="font-mono text-xs text-accent hover:underline"
                        >
                          {row.orderNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Direct</span>
                      )}
                    </TD>
                    <TD className="max-w-[160px] truncate">{row.supplierName}</TD>
                    <TD className="text-muted-foreground">
                      {row.warehouseName}
                      <div className="text-[11px]">{row.storeName}</div>
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.challan ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.receivedByName ?? "—"}
                    </TD>
                    <TD>
                      {row.postedAt ? (
                        <Badge variant="soft-success">Posted</Badge>
                      ) : (
                        <Badge variant="soft-warning">Draft</Badge>
                      )}
                    </TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(row.totalCost, { currency })}
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
