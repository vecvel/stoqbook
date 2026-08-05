import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { requireUser } from "@/lib/authz/guard";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import { ALL_FEATURES, ALL_MODULES } from "@/lib/registry";
import { usageSummary } from "@/lib/services/business";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Licence" };

export default async function LicensePage() {
  // Reachable even when the licence is invalid — this is where you come to fix it.
  const ctx = await requireUser();
  const { entitlements } = ctx;

  const [usage, availablePlans] = await Promise.all([
    usageSummary(ctx.business.id, entitlements),
    db
      .select()
      .from(plans)
      .where(eq(plans.is_public, true))
      .orderBy(asc(plans.sort_order)),
  ]);

  const currency = ctx.business.currency;
  const licence = entitlements.license;
  const plan = entitlements.plan;

  const overrideCount =
    Object.keys(licence?.module_overrides ?? {}).length +
    Object.keys(licence?.feature_overrides ?? {}).length +
    Object.keys(licence?.limit_overrides ?? {}).length;

  /* StoqBook is sold per installation, so most licences are perpetual and carry
     no recurring charge. Price framing is shown only when the licence actually
     recurs — a subscription, usually an AMC or maintenance contract. */
  const recurring =
    licence?.billing_mode === "subscription" ||
    (licence?.billing_cycle !== undefined && licence.billing_cycle !== "none");

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title="Licence"
        description="What this business is entitled to use, and how much of it you are using."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Licence" },
        ]}
        actions={
          licence ? <StatusBadge status={licence.status} /> : null
        }
      />

      {!entitlements.isValid ? (
        <Notice tone="danger" title="Licence not active">
          {entitlements.invalidReason} The business owner can restore access
          from the admin panel. No business data has been affected.
        </Notice>
      ) : entitlements.daysRemaining !== null &&
        entitlements.daysRemaining <= 14 ? (
        <Notice
          tone="warning"
          title={`${entitlements.daysRemaining} day${entitlements.daysRemaining === 1 ? "" : "s"} remaining`}
        >
          Renew before {licence?.expires_at ? formatDate(licence.expires_at) : "expiry"}{" "}
          to avoid interruption.
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile
          label="Plan"
          value={plan?.name ?? "None"}
          sublabel={
            licence ? humanise(licence.billing_mode) : "No licence assigned"
          }
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
          href="/settings/modules"
        />
        <StatTile
          label="Features"
          value={`${entitlements.features.size} / ${ALL_FEATURES.length}`}
          icon="ToggleRight"
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
              <li
                key={row.resource}
                className="flex items-center gap-4 px-4 py-2.5"
              >
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
            value={
              licence.expires_at ? formatDate(licence.expires_at) : "Never"
            }
          />
          {/* Recurring prices only mean something on a recurring licence. On a
              perpetual (lifetime) licence the software was bought once, so a
              monthly figure would misrepresent what this business owes. */}
          {plan && recurring ? (
            <>
              <Detail
                label="Monthly price"
                value={formatMoney(plan.price_monthly, { currency })}
              />
              <Detail
                label="Yearly price"
                value={formatMoney(plan.price_yearly, { currency })}
              />
            </>
          ) : null}
          <Detail
            label="Overrides applied"
            value={overrideCount > 0 ? String(overrideCount) : "None"}
          />
          <Detail label="Installation" value={ctx.business.slug} />
        </section>
      ) : null}

      {overrideCount > 0 ? (
        <Notice tone="info" title="Custom overrides are active">
          Specific modules, features or limits have been adjusted on top of the{" "}
          {plan?.name} plan. Overrides always take precedence over the plan.
        </Notice>
      ) : null}

      {/* Plans defined for this installation.
          Not a price list: this installation belongs to one business that has
          already bought the software. Plans exist here only because entitlements
          are configurable, so this reads as "what each plan grants" — worth
          showing when there is more than one to compare, and pure noise when
          there is not. */}
      {availablePlans.length > 1 ? (
        <section>
          <h2 className="section-title mb-2">Plans on this installation</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {availablePlans.map((p) => {
              const current = p.id === plan?.id;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex flex-col rounded-xs border bg-card px-4 py-3",
                    current ? "border-accent" : "border-border",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{p.name}</h3>
                    {current ? (
                      <Badge variant="soft-accent">Current</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.description}
                  </p>
                  {/* "Contact us" would be vendor-storefront copy inside a
                      business's own installation. A zero price here means the
                      plan carries no recurring charge, which is what a
                      perpetual licence looks like — so say that. */}
                  <p className="mt-2 text-lg font-semibold tabular">
                    {Number(p.price_monthly) === 0 ? (
                      <span className="text-sm font-medium text-muted-foreground">
                        No recurring charge
                      </span>
                    ) : (
                      <>
                        {formatMoney(p.price_monthly, { currency })}
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}
                          / month
                        </span>
                      </>
                    )}
                  </p>
                  <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    <li>{p.modules.length} modules</li>
                    <li>{p.features.length} features</li>
                    <li>
                      {p.limits.max_stores === null ||
                      p.limits.max_stores === undefined
                        ? "Unlimited stores"
                        : `${p.limits.max_stores} store${p.limits.max_stores === 1 ? "" : "s"}`}
                    </li>
                    <li>
                      {p.limits.max_employees === null ||
                      p.limits.max_employees === undefined
                        ? "Unlimited employees"
                        : `${p.limits.max_employees} employees`}
                    </li>
                    <li>
                      {p.limits.max_products === null ||
                      p.limits.max_products === undefined
                        ? "Unlimited products"
                        : `${p.limits.max_products} products`}
                    </li>
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            The business owner changes plan from the admin panel. A downgrade is
            blocked while current usage exceeds the target plan&apos;s limits.
          </p>
        </section>
      ) : null}
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
