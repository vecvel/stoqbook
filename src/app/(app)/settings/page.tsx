import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requireUser } from "@/lib/authz/guard";
import { currencySymbol } from "@/lib/format";

import { OrganizationForm } from "./organization-form";
import { buildSettingGroups } from "./settings-data";
import { SettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireUser();

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenant_id, ctx.business.id))
    .limit(1);

  // The General group covers currency, locale and display defaults.
  const groups = await buildSettingGroups(ctx, {
    groups: ["General"],
    scopes: ["business"],
  });

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Settings"
        description="Organisation profile and business-wide defaults. Each module contributes its own settings automatically."
      />

      {hasPermission(ctx, "settings.organization") && organization ? (
        <OrganizationForm
          values={{
            name: organization.name,
            legalName: organization.legal_name ?? "",
            email: organization.email ?? "",
            phone: organization.phone ?? "",
            website: organization.website ?? "",
            addressLine1: organization.address_line1 ?? "",
            addressLine2: organization.address_line2 ?? "",
            city: organization.city ?? "",
            state: organization.state ?? "",
            postalCode: organization.postal_code ?? "",
            country: organization.country,
            taxNumber: organization.tax_number ?? "",
            registrationNumber: organization.registration_number ?? "",
            logoUrl: organization.logo_url ?? "",
          }}
        />
      ) : null}

      {groups.length > 0 ? (
        <SettingsPanel
          groups={groups}
          currencySymbol={currencySymbol(ctx.business.currency)}
        />
      ) : null}
    </div>
  );
}
