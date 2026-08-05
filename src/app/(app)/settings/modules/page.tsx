import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/layout/icon";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/authz/guard";
import {
  ALL_FEATURES,
  ALL_MODULES,
  dependentModules,
} from "@/lib/registry";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Modules" };

/**
 * Read-only view of what the licence enables. Module availability is controlled
 * by the plan and platform overrides, never edited by the tenant directly
 * (03-license-system.md).
 */
export default async function ModulesPage() {
  const ctx = await requirePermission("settings.modules");

  const { entitlements } = ctx;

  const modules = ALL_MODULES.map((module) => {
    const enabled = module.isCore || entitlements.modules.has(module.slug);
    const features = ALL_FEATURES.filter((f) => f.moduleSlug === module.slug);
    const entitled = features.filter((f) => entitlements.features.has(f.slug));
    const missingDependency = module.dependencies.filter(
      (dep) => !entitlements.modules.has(dep),
    );

    return {
      ...module,
      enabled,
      features,
      entitledFeatures: entitled,
      missingDependency,
      dependents: dependentModules(module.slug),
    };
  });

  const enabledCount = modules.filter((m) => m.enabled).length;
  const featureCount = ALL_FEATURES.filter((f) =>
    entitlements.features.has(f.slug),
  ).length;

  return (
    <div className="page">
      <PageHeader
        title="Modules"
        description="What your licence enables. Disabled modules disappear from navigation, reports, dashboards and the API automatically."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Modules" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/license">View licence</Link>
          </Button>
        }
      />

      <StatGrid>
        <StatTile
          label="Modules enabled"
          value={`${enabledCount} / ${modules.length}`}
          sublabel={entitlements.plan?.name ?? "No plan"}
          tone="accent"
          icon="Blocks"
        />
        <StatTile
          label="Features entitled"
          value={`${featureCount} / ${ALL_FEATURES.length}`}
          icon="ToggleRight"
        />
        <StatTile
          label="Core modules"
          value={String(modules.filter((m) => m.isCore).length)}
          sublabel="Always available"
          icon="ShieldCheck"
        />
      </StatGrid>

      <Notice tone="info">
        Module access is granted by your plan and can be adjusted by the platform
        administrator through licence overrides. Dependencies cascade — disabling
        Products would also disable Inventory and Point of Sale.
      </Notice>

      <div className="grid gap-3 lg:grid-cols-2">
        {modules.map((module) => (
          <section
            key={module.slug}
            className={cn(
              "rounded-xs border bg-card",
              module.enabled ? "border-border" : "border-dashed border-border opacity-70",
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <Icon
                  name={module.icon}
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    module.enabled ? "text-accent" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    {module.name}
                    {module.isCore ? (
                      <Badge variant="soft-neutral">Core</Badge>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {module.description}
                  </p>
                </div>
              </div>
              {module.enabled ? (
                <Badge variant="soft-success">Enabled</Badge>
              ) : (
                <Badge variant="soft-neutral">Not licensed</Badge>
              )}
            </header>

            <div className="px-4 py-3">
              {module.dependencies.length > 0 ? (
                <p className="mb-2 text-[11px] text-muted-foreground">
                  Requires{" "}
                  {module.dependencies.map((dep, i) => (
                    <span key={dep}>
                      {i > 0 ? ", " : ""}
                      <span
                        className={
                          entitlements.modules.has(dep)
                            ? "text-foreground"
                            : "text-destructive"
                        }
                      >
                        {dep}
                      </span>
                    </span>
                  ))}
                </p>
              ) : null}

              {module.missingDependency.length > 0 ? (
                <p className="mb-2 rounded-xs bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                  Unavailable because {module.missingDependency.join(", ")} is not
                  enabled.
                </p>
              ) : null}

              {module.features.length > 0 ? (
                <>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Features {module.entitledFeatures.length}/
                    {module.features.length}
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {module.features.map((feature) => {
                      const on = entitlements.features.has(feature.slug);
                      return (
                        <li key={feature.slug}>
                          <span
                            className={cn(
                              "inline-block rounded-xs border px-1.5 py-0.5 text-[11px]",
                              on
                                ? "border-success/30 bg-success/10 text-success"
                                : "border-border text-muted-foreground",
                            )}
                            title={feature.slug}
                          >
                            {feature.name}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  No optional features.
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
