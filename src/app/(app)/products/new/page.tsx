import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { currencySymbol } from "@/lib/format";
import { loadSettings, readBoolean } from "@/lib/services/settings";

import { loadProductFormOptions } from "../form-data";
import { EMPTY_PRODUCT, ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await requirePermission("products.create");

  const [options, settings] = await Promise.all([
    loadProductFormOptions(ctx.business.id),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  // Default the unit to the first available so the form is immediately valid.
  const defaults = {
    ...EMPTY_PRODUCT,
    unitId: options.units[0]?.id ?? "",
    taxGroupId: options.taxGroups[0]?.id ?? "",
  };

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="New product"
        breadcrumbs={[
          { label: "Products", href: "/products" },
          { label: "New" },
        ]}
      />
      <ProductForm
        values={defaults}
        categories={options.categories}
        brands={options.brands}
        units={options.units}
        taxGroups={options.taxGroups}
        canViewCost={hasPermission(ctx, "products.view_cost")}
        canManageBatches={ctx.entitlements.features.has("inventory.batches")}
        currencySymbol={currencySymbol(ctx.business.currency)}
        autoSku={readBoolean(settings, "products.auto_generate_sku")}
      />
    </div>
  );
}
