import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { EMPTY_SUPPLIER, SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  const ctx = await requirePermission("suppliers.create");
  const settings = await loadSettings({ businessId: ctx.business.id });
  const defaultCreditDays = readNumber(
    settings,
    "purchases.default_credit_days",
    30,
  );

  return (
    <div className="page">
      <PageHeader
        title="New supplier"
        breadcrumbs={[
          { label: "Suppliers", href: "/suppliers" },
          { label: "New" },
        ]}
      />
      <SupplierForm
        values={{ ...EMPTY_SUPPLIER, creditDays: String(defaultCreditDays) }}
        ratingsEnabled={ctx.entitlements.features.has("suppliers.ratings")}
        defaultCreditDays={defaultCreditDays}
      />
    </div>
  );
}
