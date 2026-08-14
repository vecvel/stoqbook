import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { featureFlags } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";

import { deleteFeatureFlag, saveFeatureFlag } from "../actions";

export const metadata: Metadata = { title: "Feature flags" };

export default async function FeatureFlagsPage() {
  await requireAdmin("admin.flag_manage");

  const rows = await db
    .select()
    .from(featureFlags)
    .orderBy(asc(featureFlags.key));

  const crudRows: CrudRow[] = rows.map((row) => ({
    id: row.id,
    values: {
      key: row.key,
      name: row.name,
      description: row.description ?? "",
      enabled: row.enabled,
    },
    cells: {
      key: <span className="font-mono text-xs font-medium">{row.key}</span>,
      name: <span className="font-medium">{row.name}</span>,
      description: (
        <span className="text-muted-foreground">{row.description ?? "—"}</span>
      ),
      status: (
        <StatusBadge
          status={row.enabled ? "active" : "inactive"}
          label={row.enabled ? "On" : "Off"}
        />
      ),
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Feature flags"
        description="Kill switches for this installation, independent of the licence. A flag can only remove access, never grant something the licence does not include."
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Feature flags" }]}
      />

      <Notice tone="info">
        Flags are evaluated after the plan and licence overrides, so switching one
        on cannot unlock a capability the licence excludes. Each flag is simply on
        or off for everyone signed in.
      </Notice>

      <CrudPanel
        title="Flags"
        description={`${rows.length} flag${rows.length === 1 ? "" : "s"}`}
        addLabel="Add flag"
        emptyMessage="No feature flags defined."
        columns={[
          { key: "key", label: "Key" },
          { key: "name", label: "Name" },
          { key: "description", label: "Description" },
          { key: "status", label: "Status", align: "right" },
        ]}
        rows={crudRows}
        fields={[
          {
            name: "key",
            label: "Flag key",
            placeholder: "pos.offline_mode",
            required: true,
            hint: "Referenced in code. Cannot be changed casually.",
          },
          {
            name: "name",
            label: "Display name",
            placeholder: "Offline POS",
            required: true,
          },
          { name: "description", label: "Description" },
          {
            name: "enabled",
            label: "Enabled",
            type: "boolean",
            defaultValue: false,
          },
        ]}
        saveAction={saveFeatureFlag}
        deleteAction={deleteFeatureFlag}
        canWrite
        canDelete
      />
    </div>
  );
}
