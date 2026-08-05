import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { products, units } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";

import { deleteUnit, saveUnit } from "../actions";

export const metadata: Metadata = { title: "Units" };

export default async function UnitsPage() {
  const ctx = await requirePermission("products.manage_taxonomy", {
    feature: "products.units",
  });

  const rows = await db
    .select({
      id: units.id,
      name: units.name,
      shortName: units.short_name,
      allowDecimal: units.allow_decimal,
      isActive: units.is_active,
      productCount: db.$count(
        products,
        and(eq(products.unit_id, units.id), isNull(products.deleted_at)),
      ),
    })
    .from(units)
    .where(eq(units.tenant_id, ctx.business.id))
    .orderBy(asc(units.name));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      short_name: row.shortName,
      allow_decimal: row.allowDecimal,
      is_active: row.isActive,
    },
    // A unit in use cannot be removed without reassigning its products.
    deleteBlockedReason:
      row.productCount > 0
        ? `Used by ${row.productCount} product${row.productCount === 1 ? "" : "s"}`
        : undefined,
    cells: {
      name: <span className="font-medium">{row.name}</span>,
      short: <span className="font-mono text-xs">{row.shortName}</span>,
      decimal: row.allowDecimal ? "Fractional" : "Whole only",
      products: row.productCount,
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Units of measure"
        description="Whole units cannot be sold in fractions; fractional units support quantities like 1.5 kg."
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: "Units" },
        ]}
      />

      <CrudPanel
        title="Units"
        description={`${rows.length} unit${rows.length === 1 ? "" : "s"}`}
        addLabel="Add unit"
        emptyMessage="No units defined."
        columns={[
          { key: "name", label: "Name" },
          { key: "short", label: "Short" },
          { key: "decimal", label: "Precision" },
          { key: "products", label: "Products", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          { name: "name", label: "Unit name", placeholder: "Kilogram", required: true },
          {
            name: "short_name",
            label: "Short name",
            placeholder: "kg",
            required: true,
            hint: "Shown on invoices and stock lists.",
          },
          {
            name: "allow_decimal",
            label: "Allow fractional quantities",
            type: "boolean",
            defaultValue: false,
          },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveUnit}
        deleteAction={deleteUnit}
        canWrite
        canDelete
      />
    </div>
  );
}
