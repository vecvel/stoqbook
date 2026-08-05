import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { products, taxGroups } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";

import { deleteTaxGroup, saveTaxGroup } from "../actions";

export const metadata: Metadata = { title: "Tax groups" };

export default async function TaxGroupsPage() {
  const ctx = await requirePermission("products.manage_taxes", {
    feature: "products.taxes",
  });

  const rows = await db
    .select({
      id: taxGroups.id,
      name: taxGroups.name,
      rate: taxGroups.rate,
      mode: taxGroups.mode,
      components: taxGroups.components,
      isDefault: taxGroups.is_default,
      isActive: taxGroups.is_active,
      productCount: db.$count(
        products,
        and(
          eq(products.tax_group_id, taxGroups.id),
          isNull(products.deleted_at),
        ),
      ),
    })
    .from(taxGroups)
    .where(eq(taxGroups.tenant_id, ctx.business.id))
    .orderBy(asc(taxGroups.rate));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      rate: String(Number(row.rate)),
      mode: row.mode,
      is_active: row.isActive,
    },
    deleteBlockedReason:
      row.productCount > 0
        ? `Assigned to ${row.productCount} product${row.productCount === 1 ? "" : "s"}`
        : row.isDefault
          ? "This is the default tax group"
          : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isDefault ? <Badge variant="soft-neutral">Default</Badge> : null}
        </span>
      ),
      rate: <span className="font-semibold">{Number(row.rate)}%</span>,
      mode: (
        <span className="text-muted-foreground">
          {row.mode === "inclusive" ? "Price includes tax" : "Added at billing"}
        </span>
      ),
      components: (
        <span className="text-xs text-muted-foreground">
          {row.components.length > 0
            ? row.components.map((c) => `${c.name} ${c.rate}%`).join(" + ")
            : "—"}
        </span>
      ),
      products: row.productCount,
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="Tax groups"
        description="Each product belongs to one tax group. Tax is calculated at billing time from these rates."
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: "Tax groups" },
        ]}
      />

      <Notice tone="info">
        Rates above zero are split evenly into CGST and SGST components, matching
        Indian GST. Edit a group to change its total rate.
      </Notice>

      <CrudPanel
        title="Tax groups"
        description={`${rows.length} group${rows.length === 1 ? "" : "s"}`}
        addLabel="Add tax group"
        emptyMessage="No tax groups defined."
        columns={[
          { key: "name", label: "Name" },
          { key: "rate", label: "Rate", align: "right" },
          { key: "mode", label: "Mode" },
          { key: "components", label: "Components" },
          { key: "products", label: "Products", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          { name: "name", label: "Group name", placeholder: "GST 18%", required: true },
          {
            name: "rate",
            label: "Total rate (%)",
            type: "number",
            step: "0.01",
            placeholder: "18",
            required: true,
          },
          {
            name: "mode",
            label: "Tax mode",
            type: "select",
            options: [
              { value: "exclusive", label: "Exclusive — added at billing" },
              { value: "inclusive", label: "Inclusive — price contains tax" },
            ],
          },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveTaxGroup}
        deleteAction={deleteTaxGroup}
        canWrite
        canDelete
      />
    </div>
  );
}
