import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { customerGroups, customers } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { formatPercent } from "@/lib/format";

import { deleteCustomerGroup, saveCustomerGroup } from "../actions";

export const metadata: Metadata = { title: "Customer groups" };

export default async function CustomerGroupsPage() {
  const ctx = await requirePermission("customers.update", {
    feature: "customers.groups",
  });

  const rows = await db
    .select({
      id: customerGroups.id,
      name: customerGroups.name,
      description: customerGroups.description,
      discountPercent: customerGroups.discount_percent,
      useWholesale: customerGroups.use_wholesale_price,
      isDefault: customerGroups.is_default,
      memberCount: db.$count(
        customers,
        and(
          eq(customers.group_id, customerGroups.id),
          isNull(customers.deleted_at),
        ),
      ),
    })
    .from(customerGroups)
    .where(eq(customerGroups.tenant_id, ctx.business.id))
    .orderBy(asc(customerGroups.name));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      name: row.name,
      description: row.description ?? "",
      discount_percent: String(Number(row.discountPercent)),
      use_wholesale_price: row.useWholesale,
    },
    deleteBlockedReason:
      row.memberCount > 0
        ? `${row.memberCount} customer${row.memberCount === 1 ? "" : "s"} assigned`
        : row.isDefault
          ? "This is the default group"
          : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isDefault ? <Badge variant="soft-neutral">Default</Badge> : null}
        </span>
      ),
      description: (
        <span className="text-muted-foreground">{row.description ?? "—"}</span>
      ),
      discount:
        Number(row.discountPercent) > 0
          ? formatPercent(row.discountPercent)
          : "—",
      pricing: row.useWholesale ? (
        <Badge variant="soft-accent">Wholesale price</Badge>
      ) : (
        <span className="text-muted-foreground">Retail price</span>
      ),
      members: row.memberCount,
    },
  }));

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="Customer groups"
        description="Groups drive default pricing and simplify reporting. A customer belongs to one group."
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: "Groups" },
        ]}
      />

      <CrudPanel
        title="Groups"
        description={`${rows.length} group${rows.length === 1 ? "" : "s"}`}
        addLabel="Add group"
        emptyMessage="No customer groups defined."
        columns={[
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "discount", label: "Discount", align: "right" },
          { key: "pricing", label: "Pricing" },
          { key: "members", label: "Customers", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          { name: "name", label: "Group name", placeholder: "Wholesale", required: true },
          { name: "description", label: "Description", placeholder: "Optional" },
          {
            name: "discount_percent",
            label: "Blanket discount (%)",
            type: "number",
            step: "0.01",
            defaultValue: "0",
            hint: "Applied automatically at billing.",
          },
          {
            name: "use_wholesale_price",
            label: "Use wholesale price",
            type: "boolean",
            defaultValue: false,
          },
        ]}
        saveAction={saveCustomerGroup}
        deleteAction={deleteCustomerGroup}
        canWrite
        canDelete
      />
    </div>
  );
}
