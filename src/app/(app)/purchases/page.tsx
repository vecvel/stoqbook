import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";

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
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  branches,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
  users,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission, seesAllStores } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatMoney } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("purchases.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
  });

  const currency = ctx.business.currency;

  const filters = [eq(purchaseOrders.tenant_id, ctx.business.id)];

  if (!seesAllStores(ctx) && ctx.activeStore) {
    filters.push(eq(purchaseOrders.branch_id, ctx.activeStore.id));
  }
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(purchaseOrders.order_number, term),
        ilike(suppliers.company_name, term),
      )!,
    );
  }
  if (query.filters.status) {
    filters.push(
      eq(
        purchaseOrders.status,
        query.filters.status as typeof purchaseOrders.$inferSelect.status,
      ),
    );
  }
  if (query.filters.supplier) {
    filters.push(eq(purchaseOrders.supplier_id, query.filters.supplier));
  }

  const where = and(...filters);

  const [rows, totalRow, aggregate, supplierOptions] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        orderNumber: purchaseOrders.order_number,
        orderDate: purchaseOrders.order_date,
        expectedDate: purchaseOrders.expected_date,
        status: purchaseOrders.status,
        approvalStatus: purchaseOrders.approval_status,
        grandTotal: purchaseOrders.grand_total,
        supplierId: suppliers.id,
        supplierName: suppliers.company_name,
        storeName: branches.name,
        createdByName: users.full_name,
        // Built through the query builder so the correlation to the outer row
        // is table-qualified; a bare sql`` fragment would not be.
        orderedQty: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${purchaseOrderItems.quantity_ordered}), 0)`,
          })
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.order_id, purchaseOrders.id))})`,
        receivedQty: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${purchaseOrderItems.quantity_received}), 0)`,
          })
          .from(purchaseOrderItems)
          .where(eq(purchaseOrderItems.order_id, purchaseOrders.id))})`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .innerJoin(branches, eq(branches.id, purchaseOrders.branch_id))
      .leftJoin(users, eq(users.id, purchaseOrders.created_by))
      .where(where)
      .orderBy(desc(purchaseOrders.order_date))
      .limit(query.limit)
      .offset(query.offset),

    db
      .select({ value: count() })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .where(where),

    db
      .select({
        value: sql<string>`coalesce(sum(case when ${purchaseOrders.status} <> 'cancelled' then ${purchaseOrders.grand_total} else 0 end), 0)`,
        pending: sql<number>`count(*) filter (where ${purchaseOrders.approval_status} = 'pending')::int`,
        open: sql<number>`count(*) filter (where ${purchaseOrders.status} in ('approved','sent','partially_received'))::int`,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
      .where(where),

    db
      .select({ id: suppliers.id, name: suppliers.company_name })
      .from(suppliers)
      .where(eq(suppliers.tenant_id, ctx.business.id))
      .orderBy(suppliers.company_name),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];
  const baseParams = {
    search: query.search,
    status: query.filters.status,
    supplier: query.filters.supplier,
  };
  const isFiltered = Object.values(baseParams).some(Boolean);

  return (
    <div className="page">
      <PageHeader
        title="Purchase orders"
        description="Orders do not affect stock. Inventory increases only when goods are received."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/purchases/receipts">Goods receipts</Link>
            </Button>
            {hasPermission(ctx, "purchases.create") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/purchases/new" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New order
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Order value"
          value={formatMoney(stats?.value ?? "0", { currency })}
          sublabel={isFiltered ? "Filtered" : "All time"}
          icon="ShoppingBag"
        />
        <StatTile
          label="Awaiting approval"
          value={String(stats?.pending ?? 0)}
          tone={(stats?.pending ?? 0) > 0 ? "warning" : "neutral"}
          icon="ClipboardList"
          href="/purchases?status=pending_approval"
        />
        <StatTile
          label="Open orders"
          value={String(stats?.open ?? 0)}
          sublabel="Awaiting receipt"
          tone="accent"
          icon="Truck"
        />
        <StatTile
          label="Total orders"
          value={String(total)}
          icon="FileText"
        />
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search order number or supplier…" />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "pending_approval", label: "Pending approval" },
            { value: "approved", label: "Approved" },
            { value: "sent", label: "Sent" },
            { value: "partially_received", label: "Partially received" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <SelectFilter
          paramName="supplier"
          label="Supplier"
          options={supplierOptions.map((s) => ({ value: s.id, label: s.name }))}
        />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="ShoppingBag"
          title="No purchase orders yet"
          description="Raise an order to a supplier, then post a goods receipt when the delivery arrives to bring the stock in."
          action={
            hasPermission(ctx, "purchases.create")
              ? { label: "New purchase order", href: "/purchases/new" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Order</TH>
              <TH>Supplier</TH>
              <TH>Store</TH>
              <TH>Expected</TH>
              <TH align="right">Received</TH>
              <TH align="right">Value</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7}>No orders match these filters.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const ordered = Number(row.orderedQty);
                  const received = Number(row.receivedQty);
                  const pct = ordered > 0 ? (received / ordered) * 100 : 0;

                  return (
                    <TR key={row.id} muted={row.status === "cancelled"}>
                      <TD>
                        <Link
                          href={`/purchases/${row.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {row.orderNumber}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(row.orderDate)}
                        </div>
                      </TD>
                      <TD className="max-w-[200px] truncate">
                        <Link
                          href={`/suppliers/${row.supplierId}`}
                          className="hover:text-accent hover:underline"
                        >
                          {row.supplierName}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">{row.storeName}</TD>
                      <TD className="text-muted-foreground">
                        {row.expectedDate ? formatDate(row.expectedDate) : "—"}
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs tabular text-muted-foreground">
                            {received}/{ordered}
                          </span>
                          <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </span>
                        </div>
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(row.grandTotal, { currency })}
                      </TD>
                      <TD align="right">
                        <StatusBadge
                          status={
                            row.approvalStatus === "pending"
                              ? "pending_approval"
                              : row.status
                          }
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
            baseParams={baseParams}
          />
        </TableShell>
      )}
    </div>
  );
}
