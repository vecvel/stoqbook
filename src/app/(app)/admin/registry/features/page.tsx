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
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { features, modules, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";

import { RegistryTabs } from "../registry-tabs";

export const metadata: Metadata = { title: "Features" };

export default async function FeaturesPage({
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

  const [rows, moduleOptions, planRows] = await Promise.all([
    db
      .select({
        id: features.id,
        slug: features.slug,
        name: features.name,
        description: features.description,
        isDefault: features.is_default,
        moduleSlug: features.module_slug,
        moduleName: modules.name,
      })
      .from(features)
      .innerJoin(modules, eq(modules.slug, features.module_slug))
      .orderBy(asc(modules.sort_order), asc(features.slug)),

    db
      .select({ slug: modules.slug, name: modules.name })
      .from(modules)
      .orderBy(asc(modules.sort_order)),

    db
      .select({ name: plans.name, features: plans.features })
      .from(plans)
      .where(eq(plans.archived, false))
      .orderBy(asc(plans.sort_order)),
  ]);

  const filtered = rows.filter((row) => {
    if (moduleFilter && row.moduleSlug !== moduleFilter) return false;
    if (!search) return true;
    return (
      row.slug.toLowerCase().includes(search) ||
      row.name.toLowerCase().includes(search)
    );
  });

  return (
    <div className="page">
      <PageHeader
        title="Features"
        description="Capabilities within each module. The plan switches these on; licence overrides adjust them for this installation."
        breadcrumbs={[
          { label: "Registry", href: "/admin/registry" },
          { label: "Features" },
        ]}
      />

      <RegistryTabs active="/admin/registry/features" />

      <FilterBar>
        <SearchFilter placeholder="Search feature name or slug…" />
        <SelectFilter
          paramName="module"
          label="Module"
          options={moduleOptions.map((m) => ({ value: m.slug, label: m.name }))}
        />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Feature</TH>
            <TH>Module</TH>
            <TH>Slug</TH>
            <TH align="center">In every plan</TH>
            {planRows.map((plan) => (
              <TH key={plan.name} align="center">
                {plan.name}
              </TH>
            ))}
          </THead>
          <TBody>
            {filtered.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="font-medium">{row.name}</div>
                  {row.description ? (
                    <div className="text-[11px] text-muted-foreground">
                      {row.description}
                    </div>
                  ) : null}
                </TD>
                <TD className="text-muted-foreground">{row.moduleName}</TD>
                <TD mono className="text-muted-foreground">
                  {row.slug}
                </TD>
                <TD align="center">
                  {row.isDefault ? (
                    <Badge variant="soft-success">Default</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
                {planRows.map((plan) => (
                  <TD key={plan.name} align="center">
                    {plan.features.includes(row.slug) ? (
                      <span className="text-success" aria-label="Included">
                        ✓
                      </span>
                    ) : (
                      <span className="text-muted-foreground" aria-label="Not included">
                        ·
                      </span>
                    )}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} features.
      </p>
    </div>
  );
}
