import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";

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
  stockCountItems,
  stockCounts,
  users,
  warehouses,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime } from "@/lib/format";

import { scopedWarehouses } from "../warehouse-scope";
import { StartCountForm } from "./start-count-form";

export const metadata: Metadata = { title: "Stock counts" };

export default async function StockCountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("inventory.count", {
    feature: "inventory.count",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const where = and(eq(stockCounts.tenant_id, ctx.business.id));

  const [rows, totalRow, warehouseOptions] = await Promise.all([
    db
      .select({
        id: stockCounts.id,
        number: stockCounts.count_number,
        name: stockCounts.name,
        status: stockCounts.status,
        startedAt: stockCounts.started_at,
        approvedAt: stockCounts.approved_at,
        warehouseName: warehouses.name,
        createdByName: users.full_name,
        // $count builds the correlation through the query builder, so the
        // reference to the outer row is table-qualified.
        lineCount: db.$count(
          stockCountItems,
          eq(stockCountItems.count_id, stockCounts.id),
        ),
        countedCount: db.$count(
          stockCountItems,
          and(
            eq(stockCountItems.count_id, stockCounts.id),
            isNotNull(stockCountItems.counted_quantity),
          ),
        ),
        varianceCount: db.$count(
          stockCountItems,
          and(
            eq(stockCountItems.count_id, stockCounts.id),
            isNotNull(stockCountItems.variance),
            ne(stockCountItems.variance, "0"),
          ),
        ),
      })
      .from(stockCounts)
      .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouse_id))
      .leftJoin(users, eq(users.id, stockCounts.created_by))
      .where(where)
      .orderBy(desc(stockCounts.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(stockCounts).where(where),

    scopedWarehouses(ctx),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);

  return (
    <div className="page">
      <PageHeader
        title="Stock counts"
        description="A physical count snapshots system quantities, records what was counted, then posts the variance as a single adjustment."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Stock counts" },
        ]}
      />

      {warehouseOptions.length > 0 ? (
        <StartCountForm
          warehouses={warehouseOptions.map((w) => ({ id: w.id, name: w.name }))}
        />
      ) : null}

      {total === 0 ? (
        <EmptyState
          icon="ClipboardList"
          title="No counts yet"
          description="Start a count to reconcile recorded stock against what is physically on the shelf."
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Number</TH>
              <TH>Name</TH>
              <TH>Warehouse</TH>
              <TH align="right">Progress</TH>
              <TH align="right">Variances</TH>
              <TH>Started</TH>
              <TH>By</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No counts found.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const pct =
                    row.lineCount > 0
                      ? (row.countedCount / row.lineCount) * 100
                      : 0;
                  return (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/inventory/counts/${row.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {row.number}
                        </Link>
                      </TD>
                      <TD>{row.name ?? "—"}</TD>
                      <TD className="text-muted-foreground">
                        {row.warehouseName}
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs tabular text-muted-foreground">
                            {row.countedCount}/{row.lineCount}
                          </span>
                          <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-accent"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </span>
                        </div>
                      </TD>
                      <TD
                        align="right"
                        className={
                          row.varianceCount > 0
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {row.varianceCount > 0 ? row.varianceCount : "—"}
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {row.startedAt ? formatDateTime(row.startedAt) : "—"}
                      </TD>
                      <TD className="text-muted-foreground">
                        {row.createdByName ?? "—"}
                      </TD>
                      <TD align="right">
                        <StatusBadge status={row.status} />
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
            baseParams={{}}
          />
        </TableShell>
      )}
    </div>
  );
}
