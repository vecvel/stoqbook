import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import {
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
  EmptyRow,
} from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatTile, StatGrid } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import {
  inventoryLevels,
  inventoryMovements,
  products,
  supplierProducts,
  suppliers,
  warehouses,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  currencySymbol,
  formatDateTime,
  formatMoney,
  formatQuantity,
  humanise,
} from "@/lib/format";
import { loadSettings, readBoolean } from "@/lib/services/settings";
import { add, mul, toNumber } from "@/lib/money";

import { loadProductFormOptions } from "../form-data";
import { ProductForm, toFormValues } from "../product-form";
import { ProductActions } from "./product-actions";

export const metadata: Metadata = { title: "Product" };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("products.view");

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenant_id, ctx.business.id)))
    .limit(1);

  if (!product) notFound();

  const canEdit = hasPermission(ctx, "products.update");
  const canViewCost = hasPermission(ctx, "products.view_cost");
  const currency = ctx.business.currency;

  const [levels, movements, mappedSuppliers, options, settings] = await Promise.all([
    db
      .select({
        warehouseId: inventoryLevels.warehouse_id,
        warehouseName: warehouses.name,
        available: inventoryLevels.quantity_available,
        reserved: inventoryLevels.quantity_reserved,
        damaged: inventoryLevels.quantity_damaged,
        inTransit: inventoryLevels.quantity_in_transit,
        averageCost: inventoryLevels.average_cost,
      })
      .from(inventoryLevels)
      .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouse_id))
      .where(
        and(
          eq(inventoryLevels.tenant_id, ctx.business.id),
          eq(inventoryLevels.product_id, id),
        ),
      )
      .orderBy(desc(warehouses.is_default)),

    hasPermission(ctx, "inventory.view")
      ? db
          .select({
            id: inventoryMovements.id,
            type: inventoryMovements.type,
            state: inventoryMovements.state,
            quantity: inventoryMovements.quantity,
            balanceAfter: inventoryMovements.balance_after,
            unitCost: inventoryMovements.unit_cost,
            referenceNumber: inventoryMovements.reference_number,
            reason: inventoryMovements.reason,
            createdAt: inventoryMovements.created_at,
            warehouseName: warehouses.name,
          })
          .from(inventoryMovements)
          .innerJoin(warehouses, eq(warehouses.id, inventoryMovements.warehouse_id))
          .where(
            and(
              eq(inventoryMovements.tenant_id, ctx.business.id),
              eq(inventoryMovements.product_id, id),
            ),
          )
          .orderBy(desc(inventoryMovements.created_at))
          .limit(40)
      : [],

    hasPermission(ctx, "suppliers.view")
      ? db
          .select({
            id: supplierProducts.id,
            supplierId: suppliers.id,
            supplierName: suppliers.company_name,
            supplierSku: supplierProducts.supplier_sku,
            purchasePrice: supplierProducts.purchase_price,
            leadTime: supplierProducts.lead_time_days,
            isPreferred: supplierProducts.is_preferred,
          })
          .from(supplierProducts)
          .innerJoin(suppliers, eq(suppliers.id, supplierProducts.supplier_id))
          .where(
            and(
              eq(supplierProducts.tenant_id, ctx.business.id),
              eq(supplierProducts.product_id, id),
            ),
          )
          .orderBy(desc(supplierProducts.is_preferred))
      : [],

    canEdit ? loadProductFormOptions(ctx.business.id) : null,
    loadSettings({ businessId: ctx.business.id }),
  ]);

  const totalAvailable = levels.reduce(
    (acc, l) => add(acc, String(l.available)),
    "0",
  );
  const totalValue = levels.reduce(
    (acc, l) => add(acc, mul(String(l.available), String(l.averageCost))),
    "0",
  );
  const margin =
    toNumber(product.selling_price) > 0
      ? ((toNumber(product.selling_price) - toNumber(product.cost_price)) /
          toNumber(product.selling_price)) *
        100
      : 0;

  return (
    <div className="page">
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku}${product.barcode ? ` · Barcode ${product.barcode}` : ""}`}
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: product.name },
        ]}
        actions={
          <>
            <StatusBadge status={product.status} />
            <ProductActions
              productId={product.id}
              status={product.status}
              canArchive={hasPermission(ctx, "products.archive")}
              canDelete={hasPermission(ctx, "products.delete")}
              canUpdate={canEdit}
            />
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="On hand"
          value={formatQuantity(totalAvailable)}
          sublabel={`Across ${levels.length} warehouse${levels.length === 1 ? "" : "s"}`}
          icon="Boxes"
          tone={toNumber(totalAvailable) <= 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Selling price"
          value={formatMoney(product.selling_price, { currency })}
          sublabel={
            product.wholesale_price
              ? `Wholesale ${formatMoney(product.wholesale_price, { currency })}`
              : undefined
          }
          icon="Coins"
          tone="accent"
        />
        {canViewCost ? (
          <StatTile
            label="Cost price"
            value={formatMoney(product.cost_price, { currency })}
            sublabel={`Margin ${margin.toFixed(1)}%`}
            icon="TrendingUp"
            tone={margin < 0 ? "danger" : "success"}
          />
        ) : null}
        {canViewCost ? (
          <StatTile
            label="Stock value"
            value={formatMoney(totalValue, { currency })}
            sublabel="At average cost"
            icon="Wallet"
          />
        ) : null}
      </StatGrid>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          {movements.length > 0 ? (
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          ) : null}
          {mappedSuppliers.length > 0 ? (
            <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          ) : null}
          {canEdit ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="stock" className="mt-3">
          <TableShell>
            <Table>
              <THead>
                <TH>Warehouse</TH>
                <TH align="right">Available</TH>
                <TH align="right">Reserved</TH>
                <TH align="right">Damaged</TH>
                <TH align="right">In transit</TH>
                {canViewCost ? <TH align="right">Avg. cost</TH> : null}
              </THead>
              <TBody>
                {levels.length === 0 ? (
                  <EmptyRow colSpan={canViewCost ? 6 : 5}>
                    No stock recorded for this product yet.
                  </EmptyRow>
                ) : (
                  levels.map((level) => (
                    <TR key={level.warehouseId}>
                      <TD className="font-medium">{level.warehouseName}</TD>
                      <TD align="right" className="font-semibold">
                        {formatQuantity(level.available)}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {formatQuantity(level.reserved)}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {formatQuantity(level.damaged)}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {formatQuantity(level.inTransit)}
                      </TD>
                      {canViewCost ? (
                        <TD align="right">
                          {formatMoney(level.averageCost, { currency })}
                        </TD>
                      ) : null}
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableShell>
        </TabsContent>

        {movements.length > 0 ? (
          <TabsContent value="ledger" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Movement</TH>
                  <TH>Warehouse</TH>
                  <TH>Reference</TH>
                  <TH align="right">Change</TH>
                  <TH align="right">Balance</TH>
                </THead>
                <TBody>
                  {movements.map((m) => {
                    const qty = toNumber(m.quantity);
                    return (
                      <TR key={m.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(m.createdAt)}
                        </TD>
                        <TD>
                          <div className="font-medium">{humanise(m.type)}</div>
                          {m.state !== "available" ? (
                            <div className="text-[11px] text-muted-foreground">
                              {humanise(m.state)}
                            </div>
                          ) : null}
                        </TD>
                        <TD className="text-muted-foreground">
                          {m.warehouseName}
                        </TD>
                        <TD mono className="text-muted-foreground">
                          {m.referenceNumber ?? m.reason ?? "—"}
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
                          {formatQuantity(m.quantity)}
                        </TD>
                        <TD align="right">{formatQuantity(m.balanceAfter)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableShell>
            <p className="mt-2 text-xs text-muted-foreground">
              Showing the 40 most recent movements. Ledger entries are immutable.
            </p>
          </TabsContent>
        ) : null}

        {mappedSuppliers.length > 0 ? (
          <TabsContent value="suppliers" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>Supplier</TH>
                  <TH>Their SKU</TH>
                  <TH align="right">Purchase price</TH>
                  <TH align="right">Lead time</TH>
                  <TH align="right">Preferred</TH>
                </THead>
                <TBody>
                  {mappedSuppliers.map((s) => (
                    <TR key={s.id}>
                      <TD>
                        <Link
                          href={`/suppliers/${s.supplierId}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {s.supplierName}
                        </Link>
                      </TD>
                      <TD mono className="text-muted-foreground">
                        {s.supplierSku ?? "—"}
                      </TD>
                      <TD align="right">
                        {formatMoney(s.purchasePrice, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {s.leadTime ? `${s.leadTime} days` : "—"}
                      </TD>
                      <TD align="right">
                        {s.isPreferred ? (
                          <StatusBadge status="active" label="Preferred" />
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          </TabsContent>
        ) : null}

        {canEdit && options ? (
          <TabsContent value="edit" className="mt-3">
            <ProductForm
              values={toFormValues({
                ...product,
                cost_price: String(product.cost_price),
                selling_price: String(product.selling_price),
                wholesale_price: product.wholesale_price
                  ? String(product.wholesale_price)
                  : null,
                discount_price: product.discount_price
                  ? String(product.discount_price)
                  : null,
                min_stock: String(product.min_stock),
                max_stock: product.max_stock ? String(product.max_stock) : null,
                reorder_quantity: product.reorder_quantity
                  ? String(product.reorder_quantity)
                  : null,
              })}
              categories={options.categories}
              brands={options.brands}
              units={options.units}
              taxGroups={options.taxGroups}
              canViewCost={canViewCost}
              canManageBatches={ctx.entitlements.features.has("inventory.batches")}
              currencySymbol={currencySymbol(currency)}
              autoSku={readBoolean(settings, "products.auto_generate_sku")}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
