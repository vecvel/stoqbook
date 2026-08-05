import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import {
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { modules, permissions } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";

import { RegistryTabs } from "../registry-tabs";

export const metadata: Metadata = { title: "Permissions" };

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("admin.registry_view");
  const params = await searchParams;

  const search =
    typeof params.search === "string" ? params.search.toLowerCase() : "";
  const moduleFilter =
    typeof params.module === "string" && params.module !== "all"
      ? params.module
      : null;
  const scopeFilter =
    typeof params.scope === "string" && params.scope !== "all"
      ? params.scope
      : null;

  const [rows, moduleOptions] = await Promise.all([
    db
      .select({
        id: permissions.id,
        key: permissions.key,
        action: permissions.action,
        name: permissions.name,
        description: permissions.description,
        featureSlug: permissions.feature_slug,
        isAdmin: permissions.is_admin,
        archived: permissions.archived,
        moduleSlug: permissions.module_slug,
        moduleName: modules.name,
      })
      .from(permissions)
      .innerJoin(modules, eq(modules.slug, permissions.module_slug))
      .orderBy(asc(modules.sort_order), asc(permissions.sort_order)),

    db
      .select({ slug: modules.slug, name: modules.name })
      .from(modules)
      .orderBy(asc(modules.sort_order)),
  ]);

  const filtered = rows.filter((row) => {
    if (moduleFilter && row.moduleSlug !== moduleFilter) return false;
    if (scopeFilter === "admin" && !row.isAdmin) return false;
    if (scopeFilter === "business" && row.isAdmin) return false;
    if (!search) return true;
    return (
      row.key.toLowerCase().includes(search) ||
      row.name.toLowerCase().includes(search)
    );
  });

  const businessCount = rows.filter((r) => !r.isAdmin).length;
  const adminCount = rows.filter((r) => r.isAdmin).length;

  return (
    <div className="page">
      <PageHeader
        title="Permissions"
        description="The complete permission catalogue. Administrative permissions sit in the same namespace as operational ones but are grouped apart in the role editor."
        breadcrumbs={[
          { label: "Registry", href: "/admin/registry" },
          { label: "Permissions" },
        ]}
      />

      <RegistryTabs active="/admin/registry/permissions" />

      <StatGrid>
        <StatTile
          label="Total"
          value={String(rows.length)}
          tone="accent"
          icon="ShieldCheck"
        />
        <StatTile
          label="Business permissions"
          value={String(businessCount)}
          sublabel="Assignable through roles"
          icon="Building2"
        />
        <StatTile
          label="Admin permissions"
          value={String(adminCount)}
          sublabel="Owner-level capability"
          icon="KeyRound"
        />
        <StatTile
          label="Feature-gated"
          value={String(rows.filter((r) => r.featureSlug).length)}
          sublabel="Require an entitlement"
          icon="ToggleRight"
        />
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search key or name…" />
        <SelectFilter
          paramName="module"
          label="Module"
          options={moduleOptions.map((m) => ({ value: m.slug, label: m.name }))}
        />
        <SelectFilter
          paramName="scope"
          label="Scope"
          options={[
            { value: "admin", label: "Admin" },
            { value: "business", label: "Business" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Key</TH>
            <TH>Name</TH>
            <TH>Module</TH>
            <TH>Requires feature</TH>
            <TH>Description</TH>
            <TH align="right">Scope</TH>
          </THead>
          <TBody>
            {filtered.map((row) => (
              <TR key={row.id} muted={row.archived}>
                <TD mono className="font-medium">
                  {row.key}
                </TD>
                <TD>{row.name}</TD>
                <TD className="text-muted-foreground">{row.moduleName}</TD>
                <TD mono className="text-[11px] text-muted-foreground">
                  {row.featureSlug ?? "—"}
                </TD>
                <TD className="max-w-sm text-muted-foreground">
                  {row.description ?? "—"}
                </TD>
                <TD align="right">
                  {row.isAdmin ? (
                    <Badge variant="soft-warning">Admin</Badge>
                  ) : (
                    <Badge variant="soft-neutral">Business</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} permissions. Permissions are
        never deleted once used — they are archived instead.
      </p>
    </div>
  );
}
