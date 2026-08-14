import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { customerGroups } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { currencySymbol } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { CustomerForm, EMPTY_CUSTOMER } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const ctx = await requirePermission("customers.create");

  const [groups, settings] = await Promise.all([
    db
      .select({ id: customerGroups.id, name: customerGroups.name })
      .from(customerGroups)
      .where(eq(customerGroups.tenant_id, ctx.business.id))
      .orderBy(asc(customerGroups.name)),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  const defaultCreditLimit = readNumber(
    settings,
    "customers.default_credit_limit",
    0,
  );

  return (
    <div className="page">
      <PageHeader
        title="New customer"
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: "New" },
        ]}
      />
      <CustomerForm
        values={{
          ...EMPTY_CUSTOMER,
          creditLimit: String(defaultCreditLimit),
        }}
        groups={groups}
        currencySymbol={currencySymbol(ctx.business.currency)}
        creditEnabled={ctx.entitlements.features.has("customers.credit")}
        defaultCreditLimit={defaultCreditLimit}
      />
    </div>
  );
}
