import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { scopedWarehouses } from "../../warehouse-scope";
import { AdjustmentForm } from "./adjustment-form";

export const metadata: Metadata = { title: "New stock adjustment" };

export default async function NewAdjustmentPage() {
  const ctx = await requirePermission("inventory.adjust", {
    feature: "inventory.adjustment",
  });

  const [warehouses, settings] = await Promise.all([
    scopedWarehouses(ctx),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  if (warehouses.length === 0) {
    return (
      <div className="page">
        <PageHeader title="New stock adjustment" />
        <EmptyState
          icon="Warehouse"
          title="No warehouse available"
          description="Create a warehouse before adjusting stock."
        />
      </div>
    );
  }

  return (
    <div className="page max-w-6xl">
      <PageHeader
        title="New stock adjustment"
        description="Correct a discrepancy between recorded and physical stock."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: "New" },
        ]}
      />
      <AdjustmentForm
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        defaultWarehouseId={warehouses[0].id}
        approvalThreshold={readNumber(
          settings,
          "inventory.adjustment_approval_threshold",
          0,
        )}
        canApprove={hasPermission(ctx, "inventory.approve_adjustment")}
      />
    </div>
  );
}
