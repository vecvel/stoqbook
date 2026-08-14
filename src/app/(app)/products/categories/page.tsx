import type { Metadata } from "next";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";

import { deleteCategory, saveCategory } from "../actions";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await requirePermission("products.manage_taxonomy", {
    feature: "products.categories",
  });

  // The child lookup reads the same table as the outer query, so it needs its
  // own alias for the parent/child correlation to be unambiguous.
  const childCategories = alias(categories, "child_categories");

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      parentId: categories.parent_id,
      description: categories.description,
      depth: categories.depth,
      path: categories.path,
      isActive: categories.is_active,
      productCount: db.$count(
        products,
        and(eq(products.category_id, categories.id), isNull(products.deleted_at)),
      ),
      // $count cannot name an aliased source, so this one goes through a
      // sub-select instead.
      childCount: sql<number>`(${db
        .select({ v: sql`count(*)::int` })
        .from(childCategories)
        .where(eq(childCategories.parent_id, categories.id))})`,
    })
    .from(categories)
    .where(
      and(eq(categories.tenant_id, ctx.business.id), isNull(categories.deleted_at)),
    )
    .orderBy(asc(categories.path));

  const canWrite = true; // guarded by requirePermission above
  const parentOptions = [
    { value: "", label: "— Top level —" },
    ...rows.map((r) => ({
      value: r.id,
      label: `${"— ".repeat(r.depth)}${r.name}`,
    })),
  ];

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      parent_id: row.parentId ?? "",
      description: row.description ?? "",
      is_active: row.isActive,
    },
    // Subcategories must be moved before a parent can be removed.
    deleteBlockedReason:
      row.childCount > 0
        ? `Has ${row.childCount} subcategor${row.childCount === 1 ? "y" : "ies"}`
        : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-1.5">
          {row.depth > 0 ? (
            <span
              className="text-muted-foreground"
              style={{ paddingLeft: `${(row.depth - 1) * 14}px` }}
              aria-hidden
            >
              └
            </span>
          ) : null}
          <span className={row.depth === 0 ? "font-medium" : ""}>{row.name}</span>
        </span>
      ),
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
        title="Categories"
        description="Organise the catalogue. Nesting is unlimited; products belong to exactly one category."
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: "Categories" },
        ]}
      />

      <CrudPanel
        title="Category tree"
        description={`${rows.length} categor${rows.length === 1 ? "y" : "ies"}`}
        addLabel="Add category"
        emptyMessage="No categories yet. Add one to start grouping products."
        columns={[
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "products", label: "Products", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "name",
            label: "Category name",
            placeholder: "Beverages",
            required: true,
          },
          {
            name: "parent_id",
            label: "Parent category",
            type: "select",
            options: parentOptions,
          },
          {
            name: "description",
            label: "Description",
            placeholder: "Optional",
          },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveCategory}
        deleteAction={deleteCategory}
        canWrite={canWrite}
        canDelete={hasPermission(ctx, "products.manage_taxonomy")}
      />
    </div>
  );
}
