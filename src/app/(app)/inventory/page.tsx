import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  SortableTH,
  Table,
  TableShell,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { EmptyState, Notice } from "@/components/shared/empty-state";
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { SheetTools } from "@/components/shared/sheet-tools";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge, stockStatus } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { categories, inventoryLevels, products, units } from "@/db/schema";
import { parseListQuery, safeSort } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { canExport, canImport, SPEC_BY_SLUG } from "@/lib/excel";
import { formatMoney, formatQuantity } from "@/lib/format";
import { add, mul, toNumber } from "@/lib/money";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { resolveWarehouse, scopedWarehouses } from "./warehouse-scope";

export const metadata: Metadata = { title: "Current stock" };

const SORTABLE = ["name", "sku", "available", "value"] as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("inventory.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
    defaultSort: "name",
  });
  const sort = safeSort(query.sort, SORTABLE, {
    field: "name",
    direction: "asc",
  });

  const warehouseOptions = await scopedWarehouses(ctx);
  const warehouse = resolveWarehouse(
    warehouseOptions,
    typeof params.warehouse === "string" ? params.warehouse : undefined,
  );

  const currency = ctx.business.currency;
  const canViewCost = hasPermission(ctx, "products.view_cost");

  if (!warehouse) {
    return (
      <div className="page">
        <PageHeader title="Current stock" />
        <EmptyState
          icon="Warehouse"
          title="No warehouse available"
          description="Create a warehouse before recording stock."
          action={
            hasPermission(ctx, "settings.warehouses")
              ? { label: "Manage warehouses", href: "/settings/warehouses" }
              : undefined
          }
        />
      </div>
    );
  }

  /* ---- Filters ---------------------------------------------------------- */
  const filters = [
    eq(inventoryLevels.tenant_id, ctx.business.id),
    eq(inventoryLevels.warehouse_id, warehouse.id),
    isNull(products.deleted_at),
    sql`${products.status} <> 'archived'`,
  ];

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(products.name, term),
        ilike(products.sku, term),
        ilike(products.barcode, term),
      )!,
    );
  }
  if (query.filters.category) {
    filters.push(eq(products.category_id, query.filters.category));
  }

  const stockFilter = query.filters.stock;
  if (stockFilter === "low_stock") {
    filters.push(sql`${products.min_stock} > 0`);
    filters.push(
      sql`${inventoryLevels.quantity_available} <= ${products.min_stock}`,
    );
    filters.push(sql`${inventoryLevels.quantity_available} > 0`);
  } else if (stockFilter === "out_of_stock") {
    filters.push(sql`${inventoryLevels.quantity_available} <= 0`);
  } else if (stockFilter === "in_stock") {
    filters.push(sql`${inventoryLevels.quantity_available} > 0`);
  } else if (stockFilter === "damaged") {
    filters.push(sql`${inventoryLevels.quantity_damaged} > 0`);
  } else if (stockFilter === "reserved") {
    filters.push(sql`${inventoryLevels.quantity_reserved} > 0`);
  } else if (stockFilter === "overstock") {
    filters.push(sql`${products.max_stock} is not null`);
    filters.push(
      sql`${inventoryLevels.quantity_available} > ${products.max_stock}`,
    );
  }

  const where = and(...filters);

  const valueExpr = sql`${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}`;
  const orderBy = {
    name: products.name,
    sku: products.sku,
    available: inventoryLevels.quantity_available,
    value: valueExpr,
  }[sort.field];

  /* ---- Data ------------------------------------------------------------- */
  const [rows, totalRow, aggregate, categoryOptions] = await Promise.all([
    db
      .select({
        productId: products.id,
        sku: products.sku,
        name: products.name,
        minStock: products.min_stock,
        maxStock: products.max_stock,
        reorderQuantity: products.reorder_quantity,
        unitShort: units.short_name,
        categoryName: categories.name,
        available: inventoryLevels.quantity_available,
        reserved: inventoryLevels.quantity_reserved,
        damaged: inventoryLevels.quantity_damaged,
        inTransit: inventoryLevels.quantity_in_transit,
        averageCost: inventoryLevels.average_cost,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(products.id, inventoryLevels.product_id))
      .leftJoin(units, eq(units.id, products.unit_id))
      .leftJoin(categories, eq(categories.id, products.category_id))
      .where(where)
      .orderBy(sort.direction === "asc" ? asc(orderBy) : desc(orderBy))
      .limit(query.limit)
      .offset(query.offset),

    db
      .select({ value: count() })
      .from(inventoryLevels)
      .innerJoin(products, eq(products.id, inventoryLevels.product_id))
      .where(where),

    db
      .select({
        totalValue: sql<string>`coalesce(sum(${valueExpr}), 0)`,
        totalUnits: sql<string>`coalesce(sum(${inventoryLevels.quantity_available}), 0)`,
        lowCount: sql<number>`count(*) filter (
          where ${products.min_stock} > 0
            and ${inventoryLevels.quantity_available} <= ${products.min_stock}
            and ${inventoryLevels.quantity_available} > 0
        )::int`,
        outCount: sql<number>`count(*) filter (
          where ${inventoryLevels.quantity_available} <= 0
        )::int`,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(products.id, inventoryLevels.product_id))
      .where(
        and(
          eq(inventoryLevels.tenant_id, ctx.business.id),
          eq(inventoryLevels.warehouse_id, warehouse.id),
          isNull(products.deleted_at),
          eq(products.track_inventory, true),
        ),
      ),

    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.tenant_id, ctx.business.id),
          isNull(categories.deleted_at),
        ),
      )
      .orderBy(asc(categories.path)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];

  const pageValue = rows.reduce(
    (acc, r) => add(acc, mul(String(r.available), String(r.averageCost))),
    "0",
  );

  const baseParams = {
    warehouse: warehouse.id,
    search: query.search,
    category: query.filters.category,
    stock: stockFilter,
    sort: `${sort.direction === "desc" ? "-" : ""}${sort.field}`,
  };

  return (
    <div className="page">
      <PageHeader
        title="Current stock"
        description={`${warehouse.name} · ${total} tracked line${total === 1 ? "" : "s"}`}
        actions={
          <>
            <SheetTools
              slug="opening-stock"
              label="opening stock"
              canImport={canImport(ctx, SPEC_BY_SLUG["opening-stock"])}
              canExport={canExport(ctx, SPEC_BY_SLUG["opening-stock"])}
            />
            {hasPermission(ctx, "inventory.adjust") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/inventory/adjustments/new">Adjust stock</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "inventory.count") &&
            ctx.entitlements.features.has("inventory.count") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/inventory/counts">Stock count</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "inventory.view") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/inventory/ledger">View ledger</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid>
        {canViewCost ? (
          <StatTile
            label="Stock value"
            value={formatMoney(stats?.totalValue ?? "0", { currency })}
            sublabel="At average cost"
            icon="Wallet"
          />
        ) : null}
        <StatTile
          label="Units on hand"
          value={formatQuantity(stats?.totalUnits ?? "0")}
          sublabel={warehouse.name}
          icon="Boxes"
        />
        <StatTile
          label="Low stock"
          value={String(stats?.lowCount ?? 0)}
          sublabel="At or below minimum"
          tone={(stats?.lowCount ?? 0) > 0 ? "warning" : "neutral"}
          icon="AlertTriangle"
          href={`/inventory?warehouse=${warehouse.id}&stock=low_stock`}
        />
        <StatTile
          label="Out of stock"
          value={String(stats?.outCount ?? 0)}
          sublabel="Tracked items"
          tone={(stats?.outCount ?? 0) > 0 ? "danger" : "neutral"}
          icon="PackageSearch"
          href={`/inventory?warehouse=${warehouse.id}&stock=out_of_stock`}
        />
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search name, SKU or barcode…" />
        {warehouseOptions.length > 1 ? (
          <SelectFilter
            paramName="warehouse"
            label="Warehouse"
            allLabel={warehouse.name}
            options={warehouseOptions.map((w) => ({
              value: w.id,
              label: w.name,
            }))}
          />
        ) : null}
        <SelectFilter
          paramName="stock"
          label="Stock"
          options={[
            { value: "in_stock", label: "In stock" },
            { value: "low_stock", label: "Low stock" },
            { value: "out_of_stock", label: "Out of stock" },
            { value: "overstock", label: "Overstock" },
            { value: "reserved", label: "Has reserved" },
            { value: "damaged", label: "Has damaged" },
          ]}
        />
        <SelectFilter
          paramName="category"
          label="Category"
          options={categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
        />
        <ResetFilters keep={["warehouse"]} />
      </FilterBar>

      {stockFilter === "low_stock" && rows.length > 0 ? (
        <Notice tone="warning" title="These items are at or below their minimum">
          Raise a purchase order to replenish. Suggested quantities come from each
          product&apos;s reorder setting.
        </Notice>
      ) : null}

      {total === 0 && !query.search && !stockFilter ? (
        <EmptyState
          icon="Boxes"
          title="No stock recorded"
          description="Stock appears here once you record opening stock or receive a purchase order. Inventory is only ever changed through the ledger."
          action={
            hasPermission(ctx, "purchases.create")
              ? { label: "Create a purchase order", href: "/purchases/new" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <SortableTH field="name" currentSort={baseParams.sort} baseParams={baseParams}>
                Product
              </SortableTH>
              <SortableTH field="sku" currentSort={baseParams.sort} baseParams={baseParams}>
                SKU
              </SortableTH>
              <TH>Category</TH>
              <SortableTH
                field="available"
                currentSort={baseParams.sort}
                baseParams={baseParams}
                align="right"
              >
                Available
              </SortableTH>
              <TH align="right">Reserved</TH>
              <TH align="right">Damaged</TH>
              <TH align="right">In transit</TH>
              <TH align="right">Minimum</TH>
              {canViewCost ? <TH align="right">Avg. cost</TH> : null}
              {canViewCost ? (
                <SortableTH
                  field="value"
                  currentSort={baseParams.sort}
                  baseParams={baseParams}
                  align="right"
                >
                  Value
                </SortableTH>
              ) : null}
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={canViewCost ? 11 : 9}>
                  No stock matches these filters.
                </EmptyRow>
              ) : (
                rows.map((row) => {
                  const status = stockStatus(row.available, row.minStock);
                  const value = mul(
                    String(row.available),
                    String(row.averageCost),
                  );
                  return (
                    <TR key={row.productId}>
                      <TD>
                        <Link
                          href={`/products/${row.productId}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TD>
                      <TD mono>{row.sku}</TD>
                      <TD className="text-muted-foreground">
                        {row.categoryName ?? "—"}
                      </TD>
                      <TD align="right">
                        <span
                          className={
                            status === "out_of_stock"
                              ? "font-semibold text-destructive"
                              : status === "low_stock"
                                ? "font-semibold text-warning"
                                : "font-semibold"
                          }
                        >
                          {formatQuantity(row.available, { unit: row.unitShort })}
                        </span>
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {toNumber(row.reserved) > 0
                          ? formatQuantity(row.reserved)
                          : "—"}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {toNumber(row.damaged) > 0
                          ? formatQuantity(row.damaged)
                          : "—"}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {toNumber(row.inTransit) > 0
                          ? formatQuantity(row.inTransit)
                          : "—"}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {toNumber(row.minStock) > 0
                          ? formatQuantity(row.minStock)
                          : "—"}
                      </TD>
                      {canViewCost ? (
                        <TD align="right" className="text-muted-foreground">
                          {formatMoney(row.averageCost, { currency })}
                        </TD>
                      ) : null}
                      {canViewCost ? (
                        <TD align="right">{formatMoney(value, { currency })}</TD>
                      ) : null}
                      <TD align="right">
                        <StatusBadge status={status} />
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
            {canViewCost && rows.length > 0 ? (
              <TFoot>
                <TD colSpan={9} align="right">
                  Page total
                </TD>
                <TD align="right">{formatMoney(pageValue, { currency })}</TD>
                <TD />
              </TFoot>
            ) : null}
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
