import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { branches, inventoryLevels, users, warehouses } from "@/db/schema";
import { limitFor } from "@/lib/authz/entitlements";
import { requirePermission } from "@/lib/authz/guard";
import Link from "next/link";

import { deleteStore, saveStore } from "../actions";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresPage() {
  const ctx = await requirePermission("settings.stores", {
    feature: "settings.stores",
  });

  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      city: branches.city,
      phone: branches.phone,
      email: branches.email,
      documentPrefix: branches.document_prefix,
      isDefault: branches.is_default,
      isActive: branches.is_active,
      addressLine1: branches.address_line1,
      state: branches.state,
      postalCode: branches.postal_code,
      warehouseCount: db.$count(
        warehouses,
        and(
          eq(warehouses.branch_id, branches.id),
          isNull(warehouses.deleted_at),
        ),
      ),
      staffCount: db.$count(
        users,
        and(eq(users.branch_id, branches.id), isNull(users.deleted_at)),
      ),
      stockLines: db.$count(
        inventoryLevels,
        eq(inventoryLevels.branch_id, branches.id),
      ),
    })
    .from(branches)
    .where(
      and(eq(branches.tenant_id, ctx.business.id), isNull(branches.deleted_at)),
    )
    .orderBy(asc(branches.name));

  const limit = limitFor(ctx.entitlements, "max_stores");
  const atLimit = limit !== null && rows.length >= limit;

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      code: row.code,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      address_line1: row.addressLine1 ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      postal_code: row.postalCode ?? "",
      document_prefix: row.documentPrefix ?? "",
      is_active: row.isActive,
    },
    deleteBlockedReason: row.isDefault
      ? "This is the default store"
      : row.stockLines > 0
        ? `Holds ${row.stockLines} stock record${row.stockLines === 1 ? "" : "s"}`
        : row.staffCount > 0
          ? `${row.staffCount} employee${row.staffCount === 1 ? "" : "s"} assigned`
          : undefined,
    cells: {
      name: (
        <span className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isDefault ? <Badge variant="soft-neutral">Default</Badge> : null}
        </span>
      ),
      code: <span className="font-mono text-xs">{row.code}</span>,
      location: (
        <span className="text-muted-foreground">
          {[row.city, row.state].filter(Boolean).join(", ") || "—"}
        </span>
      ),
      contact: (
        <span className="text-muted-foreground">
          {row.phone ?? row.email ?? "—"}
        </span>
      ),
      prefix: row.documentPrefix ? (
        <span className="font-mono text-xs">{row.documentPrefix}</span>
      ) : (
        <span className="text-muted-foreground">Business default</span>
      ),
      warehouses: row.warehouseCount,
      staff: row.staffCount,
      status: <StatusBadge status={row.isActive ? "active" : "inactive"} />,
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Stores"
        description="Each store owns its own sales, purchases, stock and employees. Every transaction belongs to exactly one store."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Stores" },
        ]}
      />

      {atLimit ? (
        <Notice
          tone="warning"
          title={`Store limit reached (${limit})`}
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/settings/license">Change plan</Link>
            </Button>
          }
        >
          Your {ctx.entitlements.plan?.name} plan allows {limit} store
          {limit === 1 ? "" : "s"}.
        </Notice>
      ) : null}

      <CrudPanel
        title="Store network"
        description={
          limit === null
            ? `${rows.length} store${rows.length === 1 ? "" : "s"} · unlimited on your plan`
            : `${rows.length} of ${limit} store${limit === 1 ? "" : "s"} used`
        }
        addLabel="Add store"
        emptyMessage="No stores configured."
        columns={[
          { key: "name", label: "Store" },
          { key: "code", label: "Code" },
          { key: "location", label: "Location" },
          { key: "contact", label: "Contact" },
          { key: "prefix", label: "Doc. prefix" },
          { key: "warehouses", label: "Warehouses", align: "right" },
          { key: "staff", label: "Staff", align: "right" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "name",
            label: "Store name",
            placeholder: "Downtown Store",
            required: true,
          },
          {
            name: "code",
            label: "Code",
            placeholder: "DTN",
            required: true,
            hint: "Short, unique, used in references.",
          },
          {
            name: "document_prefix",
            label: "Document prefix",
            placeholder: "Leave blank to use the business default",
          },
          { name: "phone", label: "Phone" },
          { name: "email", label: "Email" },
          { name: "address_line1", label: "Address" },
          { name: "city", label: "City" },
          { name: "state", label: "State" },
          { name: "postal_code", label: "Postal code" },
          { name: "is_active", label: "Active", type: "boolean" },
        ]}
        saveAction={saveStore}
        deleteAction={deleteStore}
        canWrite={!atLimit || rows.length > 0}
        canDelete
      />
    </div>
  );
}
