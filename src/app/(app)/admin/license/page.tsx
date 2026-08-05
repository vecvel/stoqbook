import type { Metadata } from "next";
import { asc, desc, eq } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import { licenses, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import { ALL_FEATURES, ALL_MODULES } from "@/lib/registry";
import { usageSummary } from "@/lib/services/business";
import { cn } from "@/lib/utils";

import { LicenseEditor, type LicenceView, type PlanOption } from "./license-editor";

export const metadata: Metadata = { title: "Licence" };

/** `<input type="date">` needs a bare yyyy-mm-dd value. */
function dateInputValue(value: Date | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

export default async function AdminLicensePage() {
  // Deliberately reachable with an invalid licence — this is where it gets fixed.
  const ctx = await requireAdmin("admin.license_manage");
  const { entitlements } = ctx;

  const [usage, availablePlans, history] = await Promise.all([
    usageSummary(ctx.business.id, entitlements),
    db.select().from(plans).where(eq(plans.archived, false)).orderBy(asc(plans.sort_order)),
    db
      .select({
        id: licenses.id,
        planName: plans.name,
        status: licenses.status,
        billingMode: licenses.billing_mode,
        startsAt: licenses.starts_at,
        expiresAt: licenses.expires_at,
        isCurrent: licenses.is_current,
      })
      .from(licenses)
      .leftJoin(plans, eq(plans.id, licenses.plan_id))
      .where(eq(licenses.tenant_id, ctx.business.id))
      .orderBy(desc(licenses.created_at))
      .limit(10),
  ]);

  const currency = ctx.business.currency;
  const licence = entitlements.license;
  const plan = entitlements.plan;

  const licenceView: LicenceView | null = licence
    ? {
        id: licence.id,
        planId: licence.plan_id,
        planName: plan?.name ?? "Unknown plan",
        status: licence.status,
        billingMode: licence.billing_mode,
        billingCycle: licence.billing_cycle,
        licenseKey: licence.license_key ?? "",
        expiresAt: dateInputValue(licence.expires_at),
        notes: licence.notes ?? "",
        moduleOverrides: licence.module_overrides,
        featureOverrides: licence.feature_overrides,
        limitOverrides: licence.limit_overrides,
      }
    : null;

  const planOptions: PlanOption[] = availablePlans.map((p) => ({
    id: p.id,
    name: p.name,
    modules: p.modules,
    features: p.features,
    limits: p.limits,
  }));

  const overrideCount =
    Object.keys(licence?.module_overrides ?? {}).length +
    Object.keys(licence?.feature_overrides ?? {}).length +
    Object.keys(licence?.limit_overrides ?? {}).length;

  return (
    <div className="page">
      <PageHeader
        title="Licence"
        description="What this installation is entitled to, and how much of it is in use."
        breadcrumbs={[
          { label: "Administration", href: "/admin" },
          { label: "Licence" },
        ]}
        actions={licence ? <StatusBadge status={licence.status} /> : null}
      />

      {!entitlements.isValid ? (
        <Notice tone="danger" title="Licence not active">
          {entitlements.invalidReason} Operational screens stay locked until this
          is resolved. No business data has been affected.
        </Notice>
      ) : entitlements.daysRemaining !== null &&
        entitlements.daysRemaining <= 30 ? (
        <Notice
          tone="warning"
          title={`${entitlements.daysRemaining} day${entitlements.daysRemaining === 1 ? "" : "s"} remaining`}
        >
          Renew before{" "}
          {licence?.expires_at ? formatDate(licence.expires_at) : "expiry"} to
          avoid interruption. A lifetime licence never expires.
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile
          label="Plan"
          value={plan?.name ?? "None"}
          sublabel={licence ? humanise(licence.billing_mode) : "No licence"}
          tone="accent"
          icon="KeyRound"
        />
        <StatTile
          label="Status"
          value={licence ? humanise(licence.status) : "—"}
          sublabel={
            entitlements.daysRemaining === null
              ? "Never expires"
              : `${entitlements.daysRemaining} days left`
          }
          tone={entitlements.isValid ? "success" : "danger"}
          icon="ShieldCheck"
        />
        <StatTile
          label="Modules"
          value={`${entitlements.modules.size} / ${ALL_MODULES.length}`}
          icon="Blocks"
          href="/admin/registry"
        />
        <StatTile
          label="Features"
          value={`${entitlements.features.size} / ${ALL_FEATURES.length}`}
          icon="ToggleRight"
          href="/admin/registry/features"
        />
      </StatGrid>

      {/* Usage against limits */}
      <section className="rounded-xs border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Resource usage</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Creating a record beyond its limit is refused before anything is
            written.
          </p>
        </header>
        <ul className="divide-y divide-border">
          {usage.map((row) => {
            const pct =
              row.limit === null
                ? 0
                : Math.min(100, (row.used / Math.max(1, row.limit)) * 100);
            const nearLimit = row.limit !== null && pct >= 80;
            const atLimit = row.limit !== null && row.used >= row.limit;

            return (
              <li key={row.resource} className="flex items-center gap-4 px-4 py-2.5">
                <span className="w-28 shrink-0 text-sm capitalize">
                  {row.label}
                </span>
                <span className="flex-1">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        atLimit
                          ? "bg-destructive"
                          : nearLimit
                            ? "bg-warning"
                            : "bg-accent",
                      )}
                      style={{ width: `${row.limit === null ? 100 : pct}%` }}
                    />
                  </span>
                </span>
                <span className="w-32 shrink-0 text-right text-sm tabular">
                  <span
                    className={cn(
                      "font-medium",
                      atLimit && "text-destructive",
                      nearLimit && !atLimit && "text-warning",
                    )}
                  >
                    {row.used}
                  </span>
                  <span className="text-muted-foreground">
                    {" / "}
                    {row.limit === null ? "Unlimited" : row.limit}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Licence detail */}
      {licence ? (
        <section className="grid gap-px overflow-hidden rounded-xs border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Billing mode" value={humanise(licence.billing_mode)} />
          <Detail
            label="Billing cycle"
            value={
              licence.billing_cycle === "none"
                ? "Not applicable"
                : humanise(licence.billing_cycle)
            }
          />
          <Detail label="Started" value={formatDate(licence.starts_at)} />
          <Detail
            label="Expires"
            value={licence.expires_at ? formatDate(licence.expires_at) : "Never"}
          />
          <Detail label="Licence key" value={licence.license_key ?? "Not recorded"} />
          {plan ? (
            <Detail
              label="One-time price"
              value={
                Number(plan.price_once) > 0
                  ? formatMoney(plan.price_once, { currency })
                  : "Not applicable"
              }
            />
          ) : null}
          <Detail
            label="Overrides applied"
            value={overrideCount > 0 ? String(overrideCount) : "None"}
          />
          <Detail label="Installation" value={ctx.business.slug} />
        </section>
      ) : null}

      <LicenseEditor
        licence={licenceView}
        plans={planOptions}
        modules={ALL_MODULES.map((m) => ({
          slug: m.slug,
          name: m.name,
          isCore: m.isCore,
        }))}
        features={ALL_FEATURES.map((f) => ({
          slug: f.slug,
          name: f.name,
          moduleSlug: f.moduleSlug,
        }))}
        effectiveModules={[...entitlements.modules]}
        effectiveFeatures={[...entitlements.features]}
      />

      {/* Superseded licences are retained as history, never overwritten. */}
      <section className="overflow-hidden rounded-xs border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">Licence history</h2>
        </header>
        <TableShell className="rounded-none border-0">
          <Table>
            <THead>
              <TH>Plan</TH>
              <TH>Mode</TH>
              <TH>Started</TH>
              <TH>Expires</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {history.length === 0 ? (
                <EmptyRow colSpan={5}>No licences recorded.</EmptyRow>
              ) : (
                history.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <span className="font-medium">{row.planName ?? "—"}</span>
                      {row.isCurrent ? (
                        <span className="ml-2 text-[11px] text-accent">
                          Current
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-muted-foreground">
                      {humanise(row.billingMode)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDate(row.startsAt)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.expiresAt ? formatDate(row.expiresAt) : "Never"}
                    </TD>
                    <TD align="right">
                      <StatusBadge status={row.status} />
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="field-label">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
