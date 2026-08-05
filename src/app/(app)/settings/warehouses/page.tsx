import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { branches, inventoryLevels, warehouses } from "@/db/schema";
import { limitFor } from "@/lib/authz/entitlements";
import { requirePermission } from "@/lib/authz/guard";
import { formatMoney, humanise } from "@/lib/format";

import { deleteWarehouse, saveWarehouse } from "../actions";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const ctx = await requirePermission("settings.warehouses", {
    feature: "settings.warehouses",
  });

  const [rows, storeOptions] = await Promise.all([
    db
      .select({
        id: warehouses.id,
        code: warehouses.code,
        name: warehouses.name,
        storeId: warehouses.branch_id,
        storeName: branches.name,
        city: warehouses.city,
        addressLine1: warehouses.address_line1,
        valuationMethod: warehouses.valuation_method,
        isDefault: warehouses.is_default,
        isActive: warehouses.is_active,
        stockLines: db.$count(
          inventoryLevels,
          eq(inventoryLevels.warehouse_id, warehouses.id),
        ),
        stockValue: sql<string>`(${db
          .select({
            v: sql`coalesce(sum(${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}), 0)`,
          })
          .from(inventoryLevels)
          .where(eq(inventoryLevels.warehouse_id, warehouses.id))})`,
      })
      .from(warehouses)
      .leftJoin(branches, eq(branches.id, warehouses.branch_id))
      .where(
        and(
          eq(warehouses.tenant_id, ctx.business.id),
          isNull(warehouses.deleted_at),
        ),
      )
      .orderBy(asc(warehouses.name)),

    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(
        and(eq(branches.tenant_id, ctx.business.id), isNull(branches.deleted_at)),
      )
      .orderBy(asc(branches.name)),
  ]);

  const limit = limitFor(ctx.entitlements, "max_warehouses");
  const atLimit = limit !== null && rows.length >= limit;
  const multiWarehouse = ctx.entitlements.features.has(
    "inventory.multi_warehouse",
  );
  const currency = ctx.business.currency;

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      code: row.code,
      name: row.name,
      branch_id: row.storeId ?? "",
      address_line1: row.addressLine1 ?? "",
      city: row.city ?? "",
      valuation_method: row.valuationMethod,
      is_active: row.isActive,
    },
    deleteBlockedReason: row.isDefault
      ? "This is the default warehouse"
      : row.stockLines > 0
        ? `Holds ${row.stockLines} stock record${row.stockLines === 1 ? "" : "s"}`
        : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isDefault ? <Badge variant="soft-neutral">Default</Badge> : null}
        </span>
      ),
      code: <span className="font-mono text-xs">{row.code}</span>,
      branch: (
        <span className="text-muted-foreground">
          {row.storeName ?? "Business-wide"}
        </span>
      ),
      valuation: (
        <span className="text-muted-foreground">
          {humanise(row.valuationMethod)}
        </span>
      ),
      lines: row.stockLines,
      value: formatMoney(row.stockValue, { currency }),
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Warehouses"
        description="Inventory belongs to a warehouse. Stock figures, transfers and counts are all warehouse-scoped."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Warehouses" },
        ]}
      />

      {!multiWarehouse ? (
        <Notice
          tone="warning"
          title="Multiple warehouses are not included in your plan"
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/settings/license">View plans</Link>
            </Button>
          }
        >
          You can define warehouses here, but the application will operate against
          the default warehouse only until the feature is enabled.
        </Notice>
      ) : null}

      {atLimit ? (
        <Notice tone="warning" title={`Warehouse limit reached (${limit})`}>
          Your {ctx.entitlements.plan?.name} plan allows {limit} warehouse
          {limit === 1 ? "" : "s"}.
        </Notice>
      ) : null}

      <CrudPanel
        title="Warehouses"
        description={
          limit === null
            ? `${rows.length} warehouse${rows.length === 1 ? "" : "s"} · unlimited on your plan`
            : `${rows.length} of ${limit} used`
        }
        addLabel="Add warehouse"
        emptyMessage="No warehouses configured."
        columns={[
          { key: "name", label: "Warehouse" },
          { key: "code", label: "Code" },
          { key: "store", label: "Serves store" },
          { key: "valuation", label: "Valuation" },
          { key: "lines", label: "Stock lines", align: "right" },
          { key: "value", label: "Stock value", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "name",
            label: "Warehouse name",
            placeholder: "Main Warehouse",
            required: true,
          },
          { name: "code", label: "Code", placeholder: "WH-MAIN", required: true },
          {
            name: "branch_id",
            label: "Serves store",
            type: "select",
            options: [
              { value: "", label: "Business-wide" },
              ...storeOptions.map((b) => ({ value: b.id, label: b.name })),
            ],
          },
          {
            name: "valuation_method",
            label: "Valuation method",
            type: "select",
            options: [
              { value: "weighted_average", label: "Weighted average" },
              { value: "fifo", label: "FIFO" },
              { value: "lifo", label: "LIFO" },
              { value: "specific", label: "Specific identification" },
            ],
          },
          { name: "address_line1", label: "Address" },
          { name: "city", label: "City" },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveWarehouse}
        deleteAction={deleteWarehouse}
        canWrite={!atLimit || rows.length > 0}
        canDelete
      />
    </div>
  );
}
