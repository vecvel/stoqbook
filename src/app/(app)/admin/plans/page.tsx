import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";

import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { licenses, plans } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requireAdmin } from "@/lib/authz/guard";
import { ALL_FEATURES, ALL_MODULES } from "@/lib/registry";

import { PlansManager } from "./plans-manager";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage() {
  const ctx = await requireAdmin("admin.plan_manage");

  const rows = await db
    .select({
      id: plans.id,
      slug: plans.slug,
      name: plans.name,
      description: plans.description,
      priceOnce: plans.price_once,
      priceMonthly: plans.price_monthly,
      priceYearly: plans.price_yearly,
      modules: plans.modules,
      features: plans.features,
      limits: plans.limits,
      isPublic: plans.is_public,
      archived: plans.archived,
      sortOrder: plans.sort_order,
      isCurrent: sql<boolean>`exists (
        select 1 from ${licenses}
        where ${licenses.plan_id} = ${plans.id}
          and ${licenses.tenant_id} = ${ctx.business.id}
          and ${licenses.is_current} = true
      )`,
    })
    .from(plans)
    .orderBy(asc(plans.sort_order));

  return (
    <div className="page">
      <PageHeader
        title="Plans"
        description="A plan is an entitlement template: the modules, features and limits an installation is licensed for. Differences from the plan are applied as licence overrides."
      />

      <PlansManager
        plans={rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description ?? "",
          priceOnce: String(Number(row.priceOnce)),
          priceMonthly: String(Number(row.priceMonthly)),
          priceYearly: String(Number(row.priceYearly)),
          modules: row.modules,
          features: row.features,
          limits: row.limits,
          isPublic: row.isPublic,
          archived: row.archived,
          sortOrder: row.sortOrder,
          isCurrent: row.isCurrent,
        }))}
        allModules={ALL_MODULES.map((m) => ({
          slug: m.slug,
          name: m.name,
          isCore: m.isCore,
          dependencies: m.dependencies,
        }))}
        allFeatures={ALL_FEATURES.map((f) => ({
          slug: f.slug,
          name: f.name,
          moduleSlug: f.moduleSlug,
          isDefault: Boolean(f.isDefault),
        }))}
        canManage={hasPermission(ctx, "admin.plan_manage")}
      />
    </div>
  );
}
