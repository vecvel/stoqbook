"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { changePlan, saveLicenseOverrides, updateLicense } from "../../../actions";

export interface PlanOption {
  id: string;
  name: string;
  modules: string[];
  features: string[];
  limits: Record<string, number | null>;
}

export interface LicenceView {
  id: string;
  planId: string;
  planName: string;
  status: string;
  billingMode: string;
  billingCycle: string;
  licenseKey: string;
  expiresAt: string;
  notes: string;
  moduleOverrides: Record<string, boolean>;
  featureOverrides: Record<string, boolean>;
  limitOverrides: Record<string, number | null>;
}

const LIMIT_KEYS = [
  { key: "max_stores", label: "Stores" },
  { key: "max_warehouses", label: "Warehouses" },
  { key: "max_employees", label: "Employees" },
  { key: "max_products", label: "Products" },
  { key: "max_customers", label: "Customers" },
  { key: "max_suppliers", label: "Suppliers" },
  { key: "max_storage_mb", label: "Storage (MB)" },
];

export function LicenseEditor({
  licence,
  plans,
  modules,
  features,
  effectiveModules,
  effectiveFeatures,
  storeId,
}: {
  licence: LicenceView | null;
  plans: PlanOption[];
  modules: { slug: string; name: string; isCore: boolean }[];
  features: { slug: string; name: string; moduleSlug: string }[];
  effectiveModules: string[];
  effectiveFeatures: string[];
  storeId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {licence ? (
        <UpdateLicenceForm licence={licence} />
      ) : (
        <p className="rounded-xs border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          This store has no licence. Issue one below to restore access.
        </p>
      )}

      <ChangePlanForm plans={plans} currentPlanId={licence?.planId} storeId={storeId} />

      {licence ? (
        <OverrideForm
          licence={licence}
          plan={plans.find((p) => p.id === licence.planId)}
          modules={modules}
          features={features}
          effectiveModules={effectiveModules}
          effectiveFeatures={effectiveFeatures}
        />
      ) : null}
    </div>
  );
}

function UpdateLicenceForm({ licence }: { licence: LicenceView }) {
  const [state, action] = useActionState<ActionResult, FormData>(updateLicense, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="license_id" value={licence.id} />
      <FormSection
        title="Current licence"
        description={`${licence.planName} · ${licence.billingMode.replace("_", " ")}`}
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={3}>
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={licence.status}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field
            label="Expires"
            htmlFor="expires_at"
            hint="Blank means it never expires."
          >
            <Input
              id="expires_at"
              name="expires_at"
              type="date"
              defaultValue={licence.expiresAt}
            />
          </Field>
          <Field
            label="Licence key"
            htmlFor="license_key"
            hint="As issued with your purchase."
          >
            <Input
              id="license_key"
              name="license_key"
              defaultValue={licence.licenseKey}
              placeholder="STQB-XXXX-XXXX-XXXX"
              className="font-mono"
            />
          </Field>
        </FieldRow>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={licence.notes}
            placeholder="Purchase reference, reseller, renewal contact."
          />
        </Field>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
            Update licence
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}

function ChangePlanForm({
  plans,
  currentPlanId,
  storeId,
}: {
  plans: PlanOption[];
  currentPlanId?: string;
  storeId: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(changePlan, {
    ok: true,
  });
  // Lifetime is the default: StoqBook is sold as a perpetual per-installation
  // licence, and a subscription is the exception rather than the norm.
  const [billingMode, setBillingMode] = useState("lifetime");

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const neverExpires = billingMode === "lifetime" || billingMode === "internal";

  return (
    <form action={action}>
      <input type="hidden" name="store_id" value={storeId} />
      <FormSection
        title="Change plan"
        description="Issuing a licence supersedes the current one, which is kept as history. A downgrade is refused while usage exceeds the target plan's limits."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <FieldRow cols={4}>
          <Field label="Plan" htmlFor="plan_id" required>
            <select
              id="plan_id"
              name="plan_id"
              defaultValue={currentPlanId ?? plans[0]?.id}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              required
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Billing mode" htmlFor="billing_mode">
            <select
              id="billing_mode"
              name="billing_mode"
              value={billingMode}
              onChange={(e) => setBillingMode(e.target.value)}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="lifetime">Lifetime (perpetual)</option>
              <option value="subscription">Subscription / AMC</option>
              <option value="trial">Trial</option>
              <option value="manual">Manual</option>
              <option value="internal">Internal</option>
            </select>
          </Field>
          {billingMode === "subscription" ? (
            <Field label="Cycle" htmlFor="billing_cycle">
              <select
                id="billing_cycle"
                name="billing_cycle"
                defaultValue="yearly"
                className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          ) : (
            <Field
              label="Expires"
              htmlFor="change_expires_at"
              hint={neverExpires ? "Never expires." : "Blank = never."}
            >
              <Input
                id="change_expires_at"
                name="expires_at"
                type="date"
                disabled={neverExpires}
              />
            </Field>
          )}
          <Field label="Licence key" htmlFor="change_license_key">
            <Input
              id="change_license_key"
              name="license_key"
              placeholder="Optional"
              className="font-mono"
            />
          </Field>
        </FieldRow>

        <Field label="Notes" htmlFor="change_notes">
          <Input id="change_notes" name="notes" placeholder="Optional" />
        </Field>

        <div>
          <SubmitButton variant="accent" size="sm" pendingLabel="Issuing…">
            Issue licence
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}

function OverrideForm({
  licence,
  plan,
  modules,
  features,
  effectiveModules,
  effectiveFeatures,
}: {
  licence: LicenceView;
  plan?: PlanOption;
  modules: { slug: string; name: string; isCore: boolean }[];
  features: { slug: string; name: string; moduleSlug: string }[];
  effectiveModules: string[];
  effectiveFeatures: string[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    saveLicenseOverrides,
    { ok: true },
  );

  const [enabledModules, setEnabledModules] = useState<Set<string>>(
    () => new Set(effectiveModules),
  );
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(
    () => new Set(effectiveFeatures),
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const planModules = useMemo(() => new Set(plan?.modules ?? []), [plan]);
  const planFeatures = useMemo(() => new Set(plan?.features ?? []), [plan]);

  const overrideCount =
    modules.filter((m) => planModules.has(m.slug) !== enabledModules.has(m.slug))
      .length +
    features.filter(
      (f) => planFeatures.has(f.slug) !== enabledFeatures.has(f.slug),
    ).length;

  const featuresByModule = useMemo(() => {
    const map = new Map<string, typeof features>();
    for (const feature of features) {
      const list = map.get(feature.moduleSlug) ?? [];
      list.push(feature);
      map.set(feature.moduleSlug, list);
    }
    return map;
  }, [features]);

  return (
    <form action={action}>
      <input type="hidden" name="license_id" value={licence.id} />

      <FormSection
        title="Overrides"
        description="Grant or withhold specific modules, features and limits without creating a bespoke plan. Overrides always win over the plan."
      >
        {!state.ok ? <FormError message={state.message} /> : null}

        <p className="text-xs text-muted-foreground">
          {overrideCount === 0
            ? "This business currently matches its plan exactly."
            : `${overrideCount} difference(s) from the ${plan?.name ?? "plan"} will be stored as overrides.`}
        </p>

        {/* Hidden inputs carry the selections. */}
        {[...enabledModules].map((slug) => (
          <input key={`m-${slug}`} type="hidden" name="modules" value={slug} />
        ))}
        {[...enabledFeatures].map((slug) => (
          <input key={`f-${slug}`} type="hidden" name="features" value={slug} />
        ))}

        <div className="grid gap-3 lg:grid-cols-2">
          {modules.map((module) => {
            const moduleOn = enabledModules.has(module.slug);
            const differs = planModules.has(module.slug) !== moduleOn;
            const moduleFeatures = featuresByModule.get(module.slug) ?? [];

            return (
              <section
                key={module.slug}
                className={cn(
                  "rounded-xs border bg-card",
                  differs ? "border-accent" : "border-border",
                )}
              >
                <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2">
                    <Checkbox
                      checked={moduleOn}
                      disabled={module.isCore}
                      onCheckedChange={() =>
                        setEnabledModules((current) => {
                          const next = new Set(current);
                          if (next.has(module.slug)) next.delete(module.slug);
                          else next.add(module.slug);
                          return next;
                        })
                      }
                      aria-label={module.name}
                    />
                    <span className="truncate text-sm font-medium">
                      {module.name}
                    </span>
                    {module.isCore ? (
                      <Badge variant="soft-neutral">Core</Badge>
                    ) : null}
                  </label>
                  {differs ? <Badge variant="soft-accent">Override</Badge> : null}
                </header>

                {moduleFeatures.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {moduleFeatures.map((feature) => {
                      const on = enabledFeatures.has(feature.slug);
                      const featureDiffers =
                        planFeatures.has(feature.slug) !== on;
                      return (
                        <li key={feature.slug}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
                              !moduleOn && "opacity-50",
                            )}
                          >
                            <Checkbox
                              checked={on}
                              disabled={!moduleOn}
                              onCheckedChange={() =>
                                setEnabledFeatures((current) => {
                                  const next = new Set(current);
                                  if (next.has(feature.slug))
                                    next.delete(feature.slug);
                                  else next.add(feature.slug);
                                  return next;
                                })
                              }
                              aria-label={feature.name}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {feature.name}
                            </span>
                            {featureDiffers ? (
                              <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    No optional features.
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <div className="mt-2">
          <h3 className="section-title mb-2">Limit overrides</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LIMIT_KEYS.map(({ key, label }) => {
              const planLimit = plan?.limits[key];
              const override = licence.limitOverrides[key];
              const current =
                override !== undefined ? override : (planLimit ?? null);

              return (
                <Field
                  key={key}
                  label={label}
                  htmlFor={`limit_${key}`}
                  hint={
                    planLimit === null || planLimit === undefined
                      ? "Plan: unlimited"
                      : `Plan: ${planLimit}`
                  }
                >
                  <Input
                    id={`limit_${key}`}
                    name={`limit_${key}`}
                    type="text"
                    defaultValue={current === null ? "unlimited" : String(current)}
                    placeholder="unlimited"
                    className="text-right"
                  />
                </Field>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Enter a number, or the word <code>unlimited</code>. Leave blank to
            inherit the plan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SubmitButton variant="accent" size="sm" pendingLabel="Applying…">
            Apply overrides
          </SubmitButton>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              // Reset to exactly what the plan grants.
              setEnabledModules(new Set(plan?.modules ?? []));
              setEnabledFeatures(new Set(plan?.features ?? []));
            }}
          >
            Match plan exactly
          </Button>
        </div>
      </FormSection>
    </form>
  );
}
