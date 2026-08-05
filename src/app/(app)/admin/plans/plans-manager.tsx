"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  SubmitButton,
} from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { savePlan } from "../actions";

export interface PlanRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceOnce: string;
  priceMonthly: string;
  priceYearly: string;
  modules: string[];
  features: string[];
  limits: Record<string, number | null>;
  isPublic: boolean;
  archived: boolean;
  sortOrder: number;
  /** True when this installation's current licence uses the plan. */
  isCurrent: boolean;
}

const LIMIT_KEYS = [
  { key: "max_stores", label: "Maximum stores" },
  { key: "max_warehouses", label: "Warehouses" },
  { key: "max_employees", label: "Employees" },
  { key: "max_products", label: "Products" },
  { key: "max_customers", label: "Customers" },
  { key: "max_suppliers", label: "Suppliers" },
  { key: "max_storage_mb", label: "Storage (MB)" },
];

/**
 * A perpetual licence is priced once and leaves the recurring prices at zero,
 * so the headline price follows whichever of the two is actually set.
 */
function headlinePrice(plan: PlanRow): { amount: string; period: string | null } {
  if (Number(plan.priceOnce) > 0) {
    return {
      amount: formatMoney(plan.priceOnce, { currency: "INR" }),
      period: "one-time",
    };
  }
  if (Number(plan.priceMonthly) > 0) {
    return {
      amount: formatMoney(plan.priceMonthly, { currency: "INR" }),
      period: "/ month",
    };
  }
  return { amount: "Negotiated", period: null };
}

export function PlansManager({
  plans,
  allModules,
  allFeatures,
  canManage,
}: {
  plans: PlanRow[];
  allModules: {
    slug: string;
    name: string;
    isCore: boolean;
    dependencies: string[];
  }[];
  allFeatures: {
    slug: string;
    name: string;
    moduleSlug: string;
    isDefault: boolean;
  }[];
  canManage: boolean;
}) {
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);

  const open = creating || editing !== null;

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex justify-end">
          {open ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          ) : (
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              <Plus className="size-3.5" />
              New plan
            </Button>
          )}
        </div>
      ) : null}

      {open ? (
        <PlanForm
          key={editing?.id ?? "new"}
          plan={editing}
          allModules={allModules}
          allFeatures={allFeatures}
          onDone={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const price = headlinePrice(plan);

          return (
            <section
              key={plan.id}
              className={cn(
                "flex flex-col rounded-xs border bg-card",
                plan.archived ? "border-dashed border-border opacity-60" : "border-border",
                editing?.id === plan.id && "border-accent",
              )}
            >
              <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    {plan.name}
                    {!plan.isPublic ? (
                      <Badge variant="soft-neutral">Private</Badge>
                    ) : null}
                    {plan.archived ? (
                      <Badge variant="soft-warning">Archived</Badge>
                    ) : null}
                  </h2>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {plan.slug}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      setCreating(false);
                      setEditing(plan);
                    }}
                    aria-label={`Edit ${plan.name}`}
                  >
                    <Pencil />
                  </Button>
                ) : null}
              </header>

              <div className="flex flex-1 flex-col gap-2 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  {plan.description || "No description."}
                </p>

                <p className="text-lg font-semibold tabular">
                  {price.amount}
                  {price.period ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      {price.period}
                    </span>
                  ) : null}
                </p>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  <Stat label="Modules" value={`${plan.modules.length}`} />
                  <Stat label="Features" value={`${plan.features.length}`} />
                  {LIMIT_KEYS.slice(0, 4).map(({ key, label }) => (
                    <Stat
                      key={key}
                      label={label}
                      value={
                        plan.limits[key] === null || plan.limits[key] === undefined
                          ? "Unlimited"
                          : String(plan.limits[key])
                      }
                    />
                  ))}
                </dl>
              </div>

              <footer className="border-t border-border px-4 py-2">
                {plan.isCurrent ? (
                  <Badge variant="soft-success">Current plan</Badge>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Not in use
                  </p>
                )}
              </footer>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value}</dd>
    </div>
  );
}

function PlanForm({
  plan,
  allModules,
  allFeatures,
  onDone,
}: {
  plan: PlanRow | null;
  allModules: {
    slug: string;
    name: string;
    isCore: boolean;
    dependencies: string[];
  }[];
  allFeatures: {
    slug: string;
    name: string;
    moduleSlug: string;
    isDefault: boolean;
  }[];
  onDone: () => void;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(savePlan, {
    ok: true,
  });

  const [modules, setModules] = useState<Set<string>>(
    () =>
      new Set(
        plan?.modules ?? allModules.filter((m) => m.isCore).map((m) => m.slug),
      ),
  );
  const [features, setFeatures] = useState<Set<string>>(
    () =>
      new Set(
        plan?.features ?? allFeatures.filter((f) => f.isDefault).map((f) => f.slug),
      ),
  );

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const featuresByModule = useMemo(() => {
    const map = new Map<string, typeof allFeatures>();
    for (const feature of allFeatures) {
      const list = map.get(feature.moduleSlug) ?? [];
      list.push(feature);
      map.set(feature.moduleSlug, list);
    }
    return map;
  }, [allFeatures]);

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-xs border-2 border-accent/40 bg-card px-4 py-4"
    >
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      {[...modules].map((slug) => (
        <input key={`m-${slug}`} type="hidden" name="modules" value={slug} />
      ))}
      {[...features].map((slug) => (
        <input key={`f-${slug}`} type="hidden" name="features" value={slug} />
      ))}

      <h2 className="text-sm font-semibold">
        {plan ? `Edit ${plan.name}` : "New plan"}
      </h2>

      {!state.ok ? <FormError message={state.message} /> : null}

      <FieldRow cols={2}>
        <Field label="Plan name" htmlFor="name" error={state.errors?.name} required>
          <Input
            id="name"
            name="name"
            defaultValue={plan?.name ?? ""}
            placeholder="Professional"
            required
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="description">
          <Input
            id="description"
            name="description"
            defaultValue={plan?.description ?? ""}
          />
        </Field>
      </FieldRow>

      <FieldRow cols={4}>
        <Field
          label="One-time price"
          htmlFor="price_once"
          hint="Perpetual licence — leave the recurring prices at 0."
        >
          <Input
            id="price_once"
            name="price_once"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plan?.priceOnce ?? "0"}
            className="text-right"
          />
        </Field>
        <Field
          label="Monthly price"
          htmlFor="price_monthly"
          hint="Subscription only — 0 for a perpetual licence."
        >
          <Input
            id="price_monthly"
            name="price_monthly"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plan?.priceMonthly ?? "0"}
            className="text-right"
          />
        </Field>
        <Field
          label="Yearly price"
          htmlFor="price_yearly"
          hint="Subscription only — 0 for a perpetual licence."
        >
          <Input
            id="price_yearly"
            name="price_yearly"
            type="number"
            step="0.01"
            min="0"
            defaultValue={plan?.priceYearly ?? "0"}
            className="text-right"
          />
        </Field>
        <Field label="Display order" htmlFor="sort_order">
          <Input
            id="sort_order"
            name="sort_order"
            type="number"
            min="0"
            defaultValue={plan?.sortOrder ?? 50}
            className="text-right"
          />
        </Field>
      </FieldRow>

      <FieldRow cols={2}>
        <label className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-1.5 text-sm">
          <span>Public</span>
          <Switch name="is_public" defaultChecked={plan?.isPublic ?? true} />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-1.5 text-sm">
          <span>Archived</span>
          <Switch name="archived" defaultChecked={plan?.archived ?? false} />
        </label>
      </FieldRow>

      <div>
        <h3 className="section-title mb-2">Resource limits</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LIMIT_KEYS.map(({ key, label }) => {
            const value = plan?.limits[key];
            return (
              <Field
                key={key}
                label={label}
                htmlFor={key}
                hint="Blank = unlimited"
              >
                <Input
                  id={key}
                  name={key}
                  type="number"
                  min="0"
                  defaultValue={
                    value === null || value === undefined ? "" : String(value)
                  }
                  placeholder="Unlimited"
                  className="text-right"
                />
              </Field>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="section-title mb-2">
          Modules and features ({modules.size} / {features.size})
        </h3>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Dependencies are resolved on save — enabling Inventory automatically
          pulls in Products.
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          {allModules.map((module) => {
            const on = modules.has(module.slug);
            const moduleFeatures = featuresByModule.get(module.slug) ?? [];

            return (
              <section
                key={module.slug}
                className="rounded-xs border border-border"
              >
                <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Checkbox
                    checked={on}
                    disabled={module.isCore}
                    onCheckedChange={() =>
                      setModules((current) => {
                        const next = new Set(current);
                        if (next.has(module.slug)) next.delete(module.slug);
                        else next.add(module.slug);
                        return next;
                      })
                    }
                    aria-label={module.name}
                  />
                  <span className="flex-1 text-sm font-medium">{module.name}</span>
                  {module.isCore ? (
                    <Badge variant="soft-neutral">Core</Badge>
                  ) : null}
                  {moduleFeatures.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setFeatures((current) => {
                          const next = new Set(current);
                          const allOn = moduleFeatures.every((f) =>
                            next.has(f.slug),
                          );
                          for (const f of moduleFeatures) {
                            if (allOn) next.delete(f.slug);
                            else next.add(f.slug);
                          }
                          return next;
                        })
                      }
                      className="text-[11px] font-medium text-accent hover:underline"
                    >
                      Toggle all
                    </button>
                  ) : null}
                </header>

                {moduleFeatures.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {moduleFeatures.map((feature) => (
                      <li key={feature.slug}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50",
                            !on && "opacity-50",
                          )}
                        >
                          <Checkbox
                            checked={features.has(feature.slug)}
                            disabled={!on}
                            onCheckedChange={() =>
                              setFeatures((current) => {
                                const next = new Set(current);
                                if (next.has(feature.slug))
                                  next.delete(feature.slug);
                                else next.add(feature.slug);
                                return next;
                              })
                            }
                            aria-label={feature.name}
                          />
                          <span className="flex-1 truncate">{feature.name}</span>
                          {feature.isDefault ? (
                            <span className="text-[10px] text-muted-foreground">
                              default
                            </span>
                          ) : null}
                        </label>
                      </li>
                    ))}
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
      </div>

      <div>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {plan ? "Save plan" : "Create plan"}
        </SubmitButton>
      </div>
    </form>
  );
}
