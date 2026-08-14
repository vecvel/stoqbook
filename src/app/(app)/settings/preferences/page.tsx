import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/authz/guard";
import { currencySymbol } from "@/lib/format";

import { buildSettingGroups } from "../settings-data";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Preferences" };

/**
 * Module-contributed configuration. Everything shown here is declared by a
 * module in the registry, so this page never needs editing when a module is
 * added (17-settings.md § Dynamic Settings Registration).
 */
export default async function PreferencesPage() {
  const ctx = await requireUser();

  const groups = await buildSettingGroups(ctx, {
    // General lives on the main settings page; Security has its own screen.
    scopes: ["business", "branch", "user"],
  });

  const filtered = groups.filter(
    (g) => g.group !== "General" && g.group !== "Security",
  );

  return (
    <div className="page">
      <PageHeader
        title="Preferences"
        description="Operational defaults contributed by each enabled module."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Preferences" },
        ]}
      />
      <SettingsPanel
        groups={filtered}
        currencySymbol={currencySymbol(ctx.business.currency)}
      />
    </div>
  );
}
