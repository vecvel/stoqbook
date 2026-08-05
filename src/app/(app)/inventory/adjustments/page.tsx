import type { Metadata } from "next";
import Link from "next/link";
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
import {
  stockAdjustmentItems,
  stockAdjustments,
  users,
  warehouses,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Stock adjustments" };

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("inventory.adjust", {
    feature: "inventory.adjustment",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const filters = [eq(stockAdjustments.tenant_id, ctx.business.id)];
  if (query.filters.approval) {
    filters.push(
      eq(
        stockAdjustments.approval_status,
        query.filters.approval as "not_required" | "pending" | "approved" | "rejected",
      ),
    );
  }
  if (query.filters.reason) {
    filters.push(
      eq(
        stockAdjustments.reason,
        query.filters.reason as typeof stockAdjustments.$inferSelect.reason,
      ),
    );
  }
  const where = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: stockAdjustments.id,
        number: stockAdjustments.adjustment_number,
        reason: stockAdjustments.reason,
        approvalStatus: stockAdjustments.approval_status,
        postedAt: stockAdjustments.posted_at,
        createdAt: stockAdjustments.created_at,
        note: stockAdjustments.note,
        warehouseName: warehouses.name,
        createdByName: users.full_name,
        lineCount: db.$count(
          stockAdjustmentItems,
          eq(stockAdjustmentItems.adjustment_id, stockAdjustments.id),
        ),
        // Built through the query builder so the correlation to the outer row
        // is table-qualified; a bare sql`` fragment would not be.
        netChange: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${stockAdjustmentItems.quantity}), 0)`,
          })
          .from(stockAdjustmentItems)
          .where(
            eq(stockAdjustmentItems.adjustment_id, stockAdjustments.id),
          )})`,
      })
      .from(stockAdjustments)
      .innerJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouse_id))
      .leftJoin(users, eq(users.id, stockAdjustments.created_by))
      .where(where)
      .orderBy(desc(stockAdjustments.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(stockAdjustments).where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const baseParams = {
    approval: query.filters.approval,
    reason: query.filters.reason,
  };

  return (
    <div className="page">
      <PageHeader
        title="Stock adjustments"
        description="Corrections, write-offs and recoveries. Each one is traceable to a ledger entry."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Adjustments" },
        ]}
        actions={
          <Button asChild variant="accent" size="sm">
            <Link href="/inventory/adjustments/new" className="gap-1.5">
              <Plus className="size-3.5" />
              New adjustment
            </Link>
          </Button>
        }
      />

      <FilterBar>
        <SelectFilter
          paramName="approval"
          label="Approval"
          options={[
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
            { value: "not_required", label: "Not required" },
          ]}
        />
        <SelectFilter
          paramName="reason"
          label="Reason"
          options={[
            { value: "counting_error", label: "Counting error" },
            { value: "damaged", label: "Damaged" },
            { value: "missing", label: "Missing" },
            { value: "found", label: "Found" },
            { value: "expired", label: "Expired" },
            { value: "administrative", label: "Administrative" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !query.filters.approval && !query.filters.reason ? (
        <EmptyState
          icon="ArrowLeftRight"
          title="No adjustments recorded"
          description="Adjustments correct a discrepancy between recorded and physical stock. Every one is permanent and auditable."
          action={{ label: "New adjustment", href: "/inventory/adjustments/new" }}
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Number</TH>
              <TH>Warehouse</TH>
              <TH>Reason</TH>
              <TH align="right">Lines</TH>
              <TH align="right">Net change</TH>
              <TH>Raised by</TH>
              <TH>When</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No adjustments match these filters.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const net = Number(row.netChange);
                  return (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/inventory/adjustments/${row.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {row.number}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">{row.warehouseName}</TD>
                      <TD>{humanise(row.reason)}</TD>
                      <TD align="right">{row.lineCount}</TD>
                      <TD
                        align="right"
                        className={
                          net < 0
                            ? "font-semibold text-destructive"
                            : net > 0
                              ? "font-semibold text-success"
                              : ""
                        }
                      >
                        {net > 0 ? "+" : ""}
                        {net.toFixed(3).replace(/\.?0+$/, "")}
                      </TD>
                      <TD className="text-muted-foreground">
                        {row.createdByName ?? "—"}
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(row.createdAt)}
                      </TD>
                      <TD align="right">
                        {row.approvalStatus === "pending" ? (
                          <StatusBadge status="pending_approval" label="Awaiting approval" />
                        ) : row.postedAt ? (
                          <StatusBadge status="completed" label="Posted" />
                        ) : (
                          <StatusBadge status={row.approvalStatus} />
                        )}
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
