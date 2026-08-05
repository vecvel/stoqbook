import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";

import {
  EmptyRow,
  Pagination,
  SortableTH,
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
import { SheetTools } from "@/components/shared/sheet-tools";
import { StatusBadge, stockStatus } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  brands,
  categories,
  inventoryLevels,
  products,
  taxGroups,
  units,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { canExport, canImport, SPEC_BY_SLUG } from "@/lib/excel";
import { formatMoney, formatQuantity } from "@/lib/format";
import { parseListQuery, safeSort } from "@/lib/api/query";
import { readNumber, loadSettings } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Products" };

const SORTABLE = ["name", "sku", "selling_price", "cost_price", "created_at"] as const;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("products.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const defaultPageSize = readNumber(settings, "general.page_size", 25);

  const query = parseListQuery(params, {
    defaultLimit: defaultPageSize,
    defaultSort: "name",
  });
  const sort = safeSort(query.sort, SORTABLE, {
    field: "name",
    direction: "asc",
  });

  const canViewCost = hasPermission(ctx, "products.view_cost");
  const currency = ctx.business.currency;
  const warehouseId = await defaultWarehouseId(ctx.business.id, ctx.activeStore?.id);

  /* ---- Filters ---------------------------------------------------------- */
  const filters = [
    eq(products.tenant_id, ctx.business.id),
    isNull(products.deleted_at),
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
  if (query.filters.status) {
    filters.push(
      eq(
        products.status,
        query.filters.status as
          | "draft"
          | "active"
          | "inactive"
          | "discontinued"
          | "archived",
      ),
    );
  } else {
    // Archived products are hidden unless explicitly requested.
    filters.push(sql`${products.status} <> 'archived'`);
  }
  if (query.filters.category) {
    filters.push(eq(products.category_id, query.filters.category));
  }
  if (query.filters.brand) {
    filters.push(eq(products.brand_id, query.filters.brand));
  }

  const where = and(...filters);

  const orderColumn = {
    name: products.name,
    sku: products.sku,
    selling_price: products.selling_price,
    cost_price: products.cost_price,
    created_at: products.created_at,
  }[sort.field];

  /* ---- Data ------------------------------------------------------------- */
  const [rows, totalRow, categoryOptions, brandOptions] = await Promise.all([
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        barcode: products.barcode,
        status: products.status,
        costPrice: products.cost_price,
        sellingPrice: products.selling_price,
        minStock: products.min_stock,
        trackInventory: products.track_inventory,
        categoryName: categories.name,
        brandName: brands.name,
        unitShort: units.short_name,
        taxRate: taxGroups.rate,
        available: warehouseId
          ? sql<string>`coalesce(${inventoryLevels.quantity_available}, 0)`
          : sql<string>`0`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.category_id))
      .leftJoin(brands, eq(brands.id, products.brand_id))
      .leftJoin(units, eq(units.id, products.unit_id))
      .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id))
      .leftJoin(
        inventoryLevels,
        warehouseId
          ? and(
              eq(inventoryLevels.product_id, products.id),
              eq(inventoryLevels.warehouse_id, warehouseId),
            )
          : sql`false`,
      )
      .where(where)
      .orderBy(sort.direction === "asc" ? asc(orderColumn) : desc(orderColumn))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(products).where(where),

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

    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(and(eq(brands.tenant_id, ctx.business.id), isNull(brands.deleted_at)))
      .orderBy(asc(brands.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const baseParams = {
    search: query.search,
    status: query.filters.status,
    category: query.filters.category,
    brand: query.filters.brand,
    sort: `${sort.direction === "desc" ? "-" : ""}${sort.field}`,
    limit: query.limit === defaultPageSize ? null : query.limit,
  };

  const isFiltered = Boolean(
    query.search ||
      query.filters.status ||
      query.filters.category ||
      query.filters.brand,
  );

  return (
    <div className="page">
      <PageHeader
        title="Products"
        description={`${total} product${total === 1 ? "" : "s"} in the catalogue`}
        actions={
          <>
            <SheetTools
              slug="products"
              label="products"
              canImport={canImport(ctx, SPEC_BY_SLUG.products)}
              canExport={canExport(ctx, SPEC_BY_SLUG.products)}
            />
            {hasPermission(ctx, "products.export") ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/api/v1/products/export">CSV</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "products.create") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/products/new" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New product
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <FilterBar>
        <SearchFilter placeholder="Search name, SKU or barcode…" />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "draft", label: "Draft" },
            { value: "inactive", label: "Inactive" },
            { value: "discontinued", label: "Discontinued" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <SelectFilter
          paramName="category"
          label="Category"
          options={categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectFilter
          paramName="brand"
          label="Brand"
          options={brandOptions.map((b) => ({ value: b.id, label: b.name }))}
        />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="Package"
          title="No products yet"
          description="The catalogue is the foundation of inventory, purchasing and sales. Add your first product to get started."
          action={
            hasPermission(ctx, "products.create")
              ? { label: "Add a product", href: "/products/new" }
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
              <TH>Brand</TH>
              {canViewCost ? (
                <SortableTH
                  field="cost_price"
                  currentSort={baseParams.sort}
                  baseParams={baseParams}
                  align="right"
                >
                  Cost
                </SortableTH>
              ) : null}
              <SortableTH
                field="selling_price"
                currentSort={baseParams.sort}
                baseParams={baseParams}
                align="right"
              >
                Price
              </SortableTH>
              <TH align="right">Tax</TH>
              <TH align="right">Stock</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={canViewCost ? 9 : 8}>
                  No products match these filters.
                </EmptyRow>
              ) : (
                rows.map((row) => {
                  const stock = stockStatus(row.available, row.minStock);
                  return (
                    <TR key={row.id} muted={row.status === "archived"}>
                      <TD>
                        <Link
                          href={`/products/${row.id}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.barcode ? (
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {row.barcode}
                          </div>
                        ) : null}
                      </TD>
                      <TD mono>{row.sku}</TD>
                      <TD className="text-muted-foreground">
                        {row.categoryName ?? "—"}
                      </TD>
                      <TD className="text-muted-foreground">
                        {row.brandName ?? "—"}
                      </TD>
                      {canViewCost ? (
                        <TD align="right" className="text-muted-foreground">
                          {formatMoney(row.costPrice, { currency })}
                        </TD>
                      ) : null}
                      <TD align="right" className="font-medium">
                        {formatMoney(row.sellingPrice, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {row.taxRate ? `${Number(row.taxRate)}%` : "—"}
                      </TD>
                      <TD align="right">
                        {row.trackInventory ? (
                          <span
                            className={
                              stock === "out_of_stock"
                                ? "font-semibold text-destructive"
                                : stock === "low_stock"
                                  ? "font-semibold text-warning"
                                  : ""
                            }
                          >
                            {formatQuantity(row.available, {
                              unit: row.unitShort,
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not tracked</span>
                        )}
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
            baseParams={baseParams}
          />
        </TableShell>
      )}
    </div>
  );
}

/** Stock figures are shown for the active branch's default warehouse. */
async function defaultWarehouseId(
  businessId: string,
  storeId: string | undefined,
): Promise<string | null> {
  const { warehouses } = await import("@/db/schema");
  const [row] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenant_id, businessId),
        eq(warehouses.is_active, true),
        storeId ? eq(warehouses.branch_id, storeId) : undefined,
      ),
    )
    .orderBy(desc(warehouses.is_default))
    .limit(1);
  return row?.id ?? null;
}
