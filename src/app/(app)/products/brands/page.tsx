import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";

import { deleteBrand, saveBrand } from "../actions";

export const metadata: Metadata = { title: "Brands" };

export default async function BrandsPage() {
  const ctx = await requirePermission("products.manage_taxonomy", {
    feature: "products.brands",
  });

  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      description: brands.description,
      isActive: brands.is_active,
      productCount: db.$count(
        products,
        and(eq(products.brand_id, brands.id), isNull(products.deleted_at)),
      ),
    })
    .from(brands)
    .where(and(eq(brands.tenant_id, ctx.business.id), isNull(brands.deleted_at)))
    .orderBy(asc(brands.name));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      description: row.description ?? "",
      is_active: row.isActive,
    },
    cells: {
      name: <span className="font-medium">{row.name}</span>,
      description: (
        <span className="text-muted-foreground">{row.description ?? "—"}</span>
      ),
      products: row.productCount,
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Brands"
        description="Optional manufacturer grouping used for filtering and reporting."
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: "Brands" },
        ]}
      />

      <CrudPanel
        title="Brands"
        description={`${rows.length} brand${rows.length === 1 ? "" : "s"}`}
        addLabel="Add brand"
        emptyMessage="No brands yet."
        columns={[
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "products", label: "Products", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          { name: "name", label: "Brand name", placeholder: "Amul", required: true },
          { name: "description", label: "Description", placeholder: "Optional" },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveBrand}
        deleteAction={deleteBrand}
        canWrite
        canDelete
      />
    </div>
  );
}
