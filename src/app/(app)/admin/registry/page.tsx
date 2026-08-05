import type { Metadata } from "next";
import { asc, count, eq } from "drizzle-orm";

import { Icon } from "@/components/layout/icon";
import {
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { features, modules, permissions } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { humanise } from "@/lib/format";
import { ALL_MODULES } from "@/lib/registry";

import { RegistryTabs } from "./registry-tabs";

export const metadata: Metadata = { title: "Module registry" };

/**
 * The registry as persisted. Definitions live in code and are mirrored into the
 * database by the seeder — this page is the reconciliation view.
 */
export default async function ModuleRegistryPage() {
  await requireAdmin("admin.registry_view");

  const rows = await db
    .select({
      id: modules.id,
      slug: modules.slug,
      name: modules.name,
      description: modules.description,
      category: modules.category,
      icon: modules.icon,
      version: modules.version,
      state: modules.state,
      visibility: modules.visibility,
      isCore: modules.is_core,
      dependencies: modules.dependencies,
      sortOrder: modules.sort_order,
      // $count builds the correlation through the query builder, so the
      // reference to the outer row is table-qualified. An unqualified "slug"
      // would bind to features.slug instead of modules.slug.
      featureCount: db.$count(features, eq(features.module_slug, modules.slug)),
      permissionCount: db.$count(
        permissions,
        eq(permissions.module_slug, modules.slug),
      ),
    })
    .from(modules)
    .orderBy(asc(modules.sort_order));

  const [featureTotal] = await db.select({ value: count() }).from(features);
  const [permissionTotal] = await db.select({ value: count() }).from(permissions);

  // A code-defined module missing from the database means the seed is stale.
  const persisted = new Set(rows.map((r) => r.slug));
  const missing = ALL_MODULES.filter((m) => !persisted.has(m.slug));

  return (
    <div className="page">
      <PageHeader
        title="Module registry"
        description="Every capability this installation knows about. Modules, features and permissions are declared in code and mirrored here."
      />

      <RegistryTabs active="/admin/registry" />

      <StatGrid>
        <StatTile
          label="Modules"
          value={String(rows.length)}
          sublabel={`${rows.filter((r) => r.isCore).length} core`}
          tone="accent"
          icon="Blocks"
        />
        <StatTile
          label="Features"
          value={String(Number(featureTotal?.value ?? 0))}
          icon="ToggleRight"
        />
        <StatTile
          label="Permissions"
          value={String(Number(permissionTotal?.value ?? 0))}
          icon="ShieldCheck"
        />
        <StatTile
          label="Business-facing"
          value={String(rows.filter((r) => r.visibility !== "admin").length)}
          icon="Building2"
        />
      </StatGrid>

      {missing.length > 0 ? (
        <Notice tone="warning" title="Registry out of sync">
          {missing.length} module(s) are declared in code but not present in the
          database: {missing.map((m) => m.slug).join(", ")}. Run{" "}
          <code className="font-mono">npm run db:seed</code> to mirror them.
        </Notice>
      ) : (
        <Notice tone="success" title="Registry in sync">
          Every code-declared module is present in the database.
        </Notice>
      )}

      <TableShell>
        <Table>
          <THead>
            <TH>Module</TH>
            <TH>Category</TH>
            <TH>Visibility</TH>
            <TH>Dependencies</TH>
            <TH align="right">Features</TH>
            <TH align="right">Permissions</TH>
            <TH align="right">Version</TH>
            <TH align="right">State</TH>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <Icon
                      name={row.icon}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        {row.name}
                        {row.isCore ? (
                          <Badge variant="soft-neutral">Core</Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.slug}
                      </div>
                    </div>
                  </div>
                </TD>
                <TD className="text-muted-foreground">
                  {humanise(row.category)}
                </TD>
                <TD className="text-muted-foreground">
                  {humanise(row.visibility)}
                </TD>
                <TD className="text-xs text-muted-foreground">
                  {row.dependencies.length > 0
                    ? row.dependencies.join(", ")
                    : "None"}
                </TD>
                <TD align="right">{row.featureCount}</TD>
                <TD align="right">{row.permissionCount}</TD>
                <TD align="right" mono className="text-muted-foreground">
                  {row.version}
                </TD>
                <TD align="right">
                  <StatusBadge status={row.state} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>

      <p className="text-xs text-muted-foreground">
        Which modules the business can actually use is decided by the licence,
        not here. This view is the catalogue of what exists.
      </p>
    </div>
  );
}
