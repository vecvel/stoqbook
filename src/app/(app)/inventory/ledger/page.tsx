import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

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
import { Notice } from "@/components/shared/empty-state";
import {
  DateRangeFilter,
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { inventoryMovements, products, users, warehouses } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  humanise,
} from "@/lib/format";
import { toNumber } from "@/lib/money";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { scopedWarehouses } from "../warehouse-scope";

export const metadata: Metadata = { title: "Stock ledger" };

/** Inbound movement types get a positive tone, outbound a negative one. */
const MOVEMENT_TONES: Record<string, "soft-success" | "soft-destructive" | "soft-accent" | "soft-neutral"> = {
  opening_stock: "soft-accent",
  purchase: "soft-success",
  sale: "soft-destructive",
  sale_return: "soft-success",
  purchase_return: "soft-destructive",
  transfer_in: "soft-success",
  transfer_out: "soft-destructive",
  adjustment: "soft-accent",
  damage: "soft-destructive",
  expired: "soft-destructive",
  reserved: "soft-neutral",
  released: "soft-neutral",
  production: "soft-success",
  consumption: "soft-destructive",
};

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("inventory.view", {
    feature: "inventory.ledger",
  });
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 50),
  });

  const warehouseOptions = await scopedWarehouses(ctx);
  const currency = ctx.business.currency;
  const canViewCost = hasPermission(ctx, "products.view_cost");

  const filters = [eq(inventoryMovements.tenant_id, ctx.business.id)];

  // Restrict to the warehouses the user can see.
  if (warehouseOptions.length > 0) {
    filters.push(
      or(
        ...warehouseOptions.map((w) =>
          eq(inventoryMovements.warehouse_id, w.id),
        ),
      )!,
    );
  }

  if (query.filters.warehouse) {
    filters.push(eq(inventoryMovements.warehouse_id, query.filters.warehouse));
  }
  if (query.filters.type) {
    filters.push(
      eq(
        inventoryMovements.type,
        query.filters.type as typeof inventoryMovements.$inferSelect.type,
      ),
    );
  }
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(products.name, term),
        ilike(products.sku, term),
        ilike(inventoryMovements.reference_number, term),
      )!,
    );
  }
  if (query.filters.from) {
    filters.push(gte(inventoryMovements.created_at, new Date(query.filters.from)));
  }
  if (query.filters.to) {
    // Include the whole end day.
    const to = new Date(query.filters.to);
    to.setHours(23, 59, 59, 999);
    filters.push(lte(inventoryMovements.created_at, to));
  }

  const where = and(...filters);

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: inventoryMovements.id,
        createdAt: inventoryMovements.created_at,
        type: inventoryMovements.type,
        state: inventoryMovements.state,
        quantity: inventoryMovements.quantity,
        balanceAfter: inventoryMovements.balance_after,
        unitCost: inventoryMovements.unit_cost,
        totalCost: inventoryMovements.total_cost,
        referenceNumber: inventoryMovements.reference_number,
        reason: inventoryMovements.reason,
        productId: products.id,
        productName: products.name,
        productSku: products.sku,
        warehouseName: warehouses.name,
        actorName: users.full_name,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(products.id, inventoryMovements.product_id))
      .innerJoin(warehouses, eq(warehouses.id, inventoryMovements.warehouse_id))
      .leftJoin(users, eq(users.id, inventoryMovements.performed_by))
      .where(where)
      .orderBy(desc(inventoryMovements.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db
      .select({ value: count() })
      .from(inventoryMovements)
      .innerJoin(products, eq(products.id, inventoryMovements.product_id))
      .where(where),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const baseParams = {
    search: query.search,
    warehouse: query.filters.warehouse,
    type: query.filters.type,
    from: query.filters.from,
    to: query.filters.to,
  };

  return (
    <div className="page">
      <PageHeader
        title="Stock ledger"
        description="Every stock change, in order. Entries are immutable — corrections are made with new movements."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Ledger" },
        ]}
      />

      <Notice tone="info">
        The ledger is the authoritative record of stock. Current-stock figures are
        a synchronised balance derived from these entries.
      </Notice>

      <FilterBar>
        <SearchFilter placeholder="Search product or reference…" />
        {warehouseOptions.length > 1 ? (
          <SelectFilter
            paramName="warehouse"
            label="Warehouse"
            options={warehouseOptions.map((w) => ({
              value: w.id,
              label: w.name,
            }))}
          />
        ) : null}
        <SelectFilter
          paramName="type"
          label="Movement"
          options={Object.keys(MOVEMENT_TONES).map((t) => ({
            value: t,
            label: humanise(t),
          }))}
        />
        <DateRangeFilter />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>When</TH>
            <TH>Product</TH>
            <TH>Movement</TH>
            <TH>Warehouse</TH>
            <TH>Reference</TH>
            <TH>By</TH>
            <TH align="right">Change</TH>
            <TH align="right">Balance</TH>
            {canViewCost ? <TH align="right">Value</TH> : null}
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={canViewCost ? 9 : 8}>
                No movements match these filters.
              </EmptyRow>
            ) : (
              rows.map((row) => {
                const qty = toNumber(row.quantity);
                return (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TD>
                    <TD>
                      <Link
                        href={`/products/${row.productId}`}
                        className="font-medium hover:text-accent hover:underline"
                      >
                        {row.productName}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.productSku}
                      </div>
                    </TD>
                    <TD>
                      <Badge variant={MOVEMENT_TONES[row.type] ?? "soft-neutral"}>
                        {humanise(row.type)}
                      </Badge>
                      {row.state !== "available" ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {humanise(row.state)}
                        </div>
                      ) : null}
                    </TD>
                    <TD className="text-muted-foreground">{row.warehouseName}</TD>
                    <TD mono className="text-muted-foreground">
                      {row.referenceNumber ?? row.reason ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.actorName ?? "System"}
                    </TD>
                    <TD
                      align="right"
                      className={
                        qty < 0
                          ? "font-semibold text-destructive"
                          : "font-semibold text-success"
                      }
                    >
                      {qty > 0 ? "+" : ""}
                      {formatQuantity(row.quantity)}
                    </TD>
                    <TD align="right">{formatQuantity(row.balanceAfter)}</TD>
                    {canViewCost ? (
                      <TD align="right" className="text-muted-foreground">
                        {formatMoney(row.totalCost, { currency })}
                      </TD>
                    ) : null}
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
    </div>
  );
}
