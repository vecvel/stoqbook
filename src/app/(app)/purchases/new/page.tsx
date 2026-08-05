import type { Metadata } from "next";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readBoolean, readNumber } from "@/lib/services/settings";

import { scopedWarehouses } from "../../inventory/warehouse-scope";
import { PurchaseOrderForm } from "./purchase-order-form";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage() {
  const ctx = await requirePermission("purchases.create");

  const [supplierRows, warehouses, settings] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        name: suppliers.company_name,
        creditDays: suppliers.credit_days,
        terms: suppliers.payment_terms,
      })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenant_id, ctx.business.id),
          isNull(suppliers.deleted_at),
          // Blocked suppliers cannot receive new orders.
          ne(suppliers.status, "blocked"),
          ne(suppliers.status, "archived"),
        ),
      )
      .orderBy(asc(suppliers.company_name)),
    scopedWarehouses(ctx),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  if (supplierRows.length === 0) {
    return (
      <div className="page">
        <PageHeader
          title="New purchase order"
          breadcrumbs={[
            { label: "Purchases", href: "/purchases" },
            { label: "New" },
          ]}
        />
        <EmptyState
          icon="Truck"
          title="No suppliers available"
          description="Every purchase order belongs to a supplier. Add one first."
          action={
            hasPermission(ctx, "suppliers.create")
              ? { label: "Add a supplier", href: "/suppliers/new" }
              : undefined
          }
        />
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <div className="page">
        <PageHeader title="New purchase order" />
        <EmptyState
          icon="Warehouse"
          title="No warehouse available"
          description="Goods need a warehouse to be received into."
        />
      </div>
    );
  }

  return (
    <div className="page max-w-6xl">
      <PageHeader
        title="New purchase order"
        description="Creating an order does not change stock. Post a goods receipt when the delivery arrives."
        breadcrumbs={[
          { label: "Purchases", href: "/purchases" },
          { label: "New" },
        ]}
      />
      <PurchaseOrderForm
        suppliers={supplierRows}
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        currency={ctx.business.currency}
        approvalRequired={
          readBoolean(settings, "purchases.approval_required") &&
          ctx.entitlements.features.has("purchases.approvals")
        }
        approvalThreshold={readNumber(settings, "purchases.approval_threshold", 0)}
      />
    </div>
  );
}
