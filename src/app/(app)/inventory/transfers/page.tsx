import type { Metadata } from "next";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, count, desc, eq, sql } from "drizzle-orm";
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
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stockTransferItems, stockTransfers, warehouses } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatQuantity } from "@/lib/format";

export const metadata: Metadata = { title: "Stock transfers" };

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("inventory.transfer", {
    feature: "inventory.transfer",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  // Two aliases so source and destination warehouses can be joined separately.
  const source = alias(warehouses, "source_wh");
  const destination = alias(warehouses, "destination_wh");

  const filters = [eq(stockTransfers.tenant_id, ctx.business.id)];
  if (query.filters.status) {
    filters.push(
      eq(
        stockTransfers.status,
        query.filters.status as typeof stockTransfers.$inferSelect.status,
      ),
    );
  }
  const where = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: stockTransfers.id,
        number: stockTransfers.transfer_number,
        status: stockTransfers.status,
        createdAt: stockTransfers.created_at,
        dispatchedAt: stockTransfers.dispatched_at,
        receivedAt: stockTransfers.received_at,
        sourceName: source.name,
        destinationName: destination.name,
        lineCount: db.$count(
          stockTransferItems,
          eq(stockTransferItems.transfer_id, stockTransfers.id),
        ),
        // Built through the query builder so the correlation to the outer row
        // is table-qualified; a bare sql`` fragment would not be.
        requested: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${stockTransferItems.quantity_requested}), 0)`,
          })
          .from(stockTransferItems)
          .where(eq(stockTransferItems.transfer_id, stockTransfers.id))})`,
        received: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${stockTransferItems.quantity_received}), 0)`,
          })
          .from(stockTransferItems)
          .where(eq(stockTransferItems.transfer_id, stockTransfers.id))})`,
      })
      .from(stockTransfers)
      .innerJoin(source, eq(source.id, stockTransfers.source_warehouse_id))
      .innerJoin(
        destination,
        eq(destination.id, stockTransfers.destination_warehouse_id),
      )
      .where(where)
      .orderBy(desc(stockTransfers.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(stockTransfers).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Stock transfers"
        description="Goods move out of the source on dispatch and become sellable at the destination on receipt."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Transfers" },
        ]}
        actions={
          <Button asChild variant="accent" size="sm">
            <Link href="/inventory/transfers/new" className="gap-1.5">
              <Plus className="size-3.5" />
              New transfer
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "draft", label: "Draft" },
            { value: "approved", label: "Approved" },
            { value: "in_transit", label: "In transit" },
            { value: "completed", label: "Completed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !query.filters.status ? (
        <EmptyState
          icon="ArrowLeftRight"
          title="No transfers yet"
          description="Move stock between warehouses. Quantities in transit stay visible at the destination until received."
          action={{ label: "New transfer", href: "/inventory/transfers/new" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Number</TH>
              <TH>From</TH>
              <TH>To</TH>
              <TH align="right">Lines</TH>
              <TH align="right">Requested</TH>
              <TH align="right">Received</TH>
              <TH>Created</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No transfers match these filters.</EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.id} muted={row.status === "cancelled"}>
                    <TD>
                      <Link
                        href={`/inventory/transfers/${row.id}`}
                        className="font-mono text-xs font-medium text-accent hover:underline"
                      >
                        {row.number}
                      </Link>
                    </TD>
                    <TD>{row.sourceName}</TD>
                    <TD>{row.destinationName}</TD>
                    <TD align="right">{row.lineCount}</TD>
                    <TD align="right">{formatQuantity(row.requested)}</TD>
                    <TD align="right" className="font-medium">
                      {formatQuantity(row.received)}
                    </TD>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.createdAt)}
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
            baseParams={{ status: query.filters.status }}
          />
        </TableShell>
      )}
    </div>
  );
}
