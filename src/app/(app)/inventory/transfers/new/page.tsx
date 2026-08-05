import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/authz/guard";

import { scopedWarehouses } from "../../warehouse-scope";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "New stock transfer" };

export default async function NewTransferPage() {
  const ctx = await requirePermission("inventory.transfer", {
    feature: "inventory.transfer",
  });

  const warehouses = await scopedWarehouses(ctx);

  // A transfer needs somewhere to go.
  if (warehouses.length < 2) {
    return (
      <div className="page">
        <PageHeader
          title="New stock transfer"
          breadcrumbs={[
            { label: "Inventory", href: "/inventory" },
            { label: "Transfers", href: "/inventory/transfers" },
            { label: "New" },
          ]}
        />
        <EmptyState
          icon="Warehouse"
          title="At least two warehouses are needed"
          description="Transfers move stock between warehouses. Create a second warehouse first."
          action={{ label: "Manage warehouses", href: "/settings/warehouses" }}
        />
      </div>
    );
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="New stock transfer"
        description="Stock leaves the source on dispatch and becomes sellable at the destination on receipt."
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Transfers", href: "/inventory/transfers" },
          { label: "New" },
        ]}
      />
      <TransferForm
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
      />
    </div>
  );
}
