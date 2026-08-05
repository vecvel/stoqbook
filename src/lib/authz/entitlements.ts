import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { featureFlags, licenses, plans } from "@/db/schema";
import {
  CORE_MODULE_SLUGS,
  DEFAULT_FEATURE_SLUGS,
  resolveModuleDependencies,
} from "@/lib/registry";

export type LicenseRow = typeof licenses.$inferSelect;
export type PlanRow = typeof plans.$inferSelect;

/**
 * The resolved answer to "what may this business use right now?".
 *
 * Resolution order, per 03-license-system.md:
 *   plan → licence overrides → dependency cascade → core guarantee
 * Overrides always win over the plan.
 */
export interface Entitlements {
  license: LicenseRow | null;
  plan: PlanRow | null;
  /** True only when the licence is active and unexpired. */
  isValid: boolean;
  /** Why the licence is unusable, when isValid is false. */
  invalidReason: string | null;
  /** Days remaining; null for lifetime/internal licences. */
  daysRemaining: number | null;
  modules: Set<string>;
  features: Set<string>;
  limits: Record<string, number | null>;
  flags: Set<string>;
}

export const UNLICENSED: Entitlements = {
  license: null,
  plan: null,
  isValid: false,
  invalidReason: "No licence assigned.",
  daysRemaining: null,
  modules: new Set(CORE_MODULE_SLUGS),
  features: new Set(DEFAULT_FEATURE_SLUGS),
  limits: {},
  flags: new Set(),
};

function evaluateValidity(license: LicenseRow): {
  isValid: boolean;
  reason: string | null;
  daysRemaining: number | null;
} {
  // Lifetime and internal licences never expire.
  const neverExpires =
    license.billing_mode === "lifetime" ||
    license.billing_mode === "internal" ||
    license.expires_at === null;

  const daysRemaining = neverExpires
    ? null
    : Math.ceil(
        (new Date(license.expires_at!).getTime() - Date.now()) / 86_400_000,
      );

  if (license.status === "suspended") {
    return { isValid: false, reason: "Licence suspended.", daysRemaining };
  }
  if (license.status === "cancelled") {
    return { isValid: false, reason: "Licence cancelled.", daysRemaining };
  }
  if (license.status === "pending") {
    return { isValid: false, reason: "Licence not yet activated.", daysRemaining };
  }
  if (license.status === "expired") {
    return { isValid: false, reason: "Licence expired.", daysRemaining };
  }
  if (!neverExpires && daysRemaining !== null && daysRemaining <= 0) {
    return { isValid: false, reason: "Licence expired.", daysRemaining };
  }

  return { isValid: true, reason: null, daysRemaining };
}

/** Applies a boolean override map on top of a base list. */
function applyOverrides(
  base: string[],
  overrides: Record<string, boolean>,
): Set<string> {
  const set = new Set(base);
  for (const [key, enabled] of Object.entries(overrides)) {
    if (enabled) set.add(key);
    else set.delete(key);
  }
  return set;
}

export async function resolveEntitlements(
  businessId: string,
): Promise<Entitlements> {
  const [row] = await db
    .select({ license: licenses, plan: plans })
    .from(licenses)
    .innerJoin(plans, eq(plans.id, licenses.plan_id))
    .where(and(eq(licenses.tenant_id, businessId), eq(licenses.is_current, true)))
    .limit(1);

  if (!row) return UNLICENSED;

  const { license, plan } = row;
  const validity = evaluateValidity(license);

  // Overrides take precedence over the plan.
  const featureSet = applyOverrides(
    [...plan.features, ...DEFAULT_FEATURE_SLUGS],
    license.feature_overrides,
  );

  const moduleSet = applyOverrides(plan.modules, license.module_overrides);
  // Core modules can never be switched off, and dependencies must hold.
  const modules = new Set(resolveModuleDependencies([...moduleSet]));

  const limits: Record<string, number | null> = {
    ...plan.limits,
    ...license.limit_overrides,
  };

  // Flags are evaluated last — they can only remove access, never grant it.
  const flags = await resolveFlags();

  return {
    license,
    plan,
    isValid: validity.isValid,
    invalidReason: validity.reason,
    daysRemaining: validity.daysRemaining,
    modules,
    features: featureSet,
    limits,
    flags,
  };
}

/**
 * A flag is simply on or off for the installation. There is no per-business
 * allowlist to consult, because there is only one business.
 */
async function resolveFlags(): Promise<Set<string>> {
  const rows = await db
    .select({ key: featureFlags.key })
    .from(featureFlags)
    .where(eq(featureFlags.enabled, true));
  return new Set(rows.map((f) => f.key));
}

/* -------------------------------------------------------------------------- */
/* Limit helpers                                                              */
/* -------------------------------------------------------------------------- */

export const LIMIT_KEYS = {
  stores: "max_stores",
  warehouses: "max_warehouses",
  employees: "max_employees",
  products: "max_products",
  customers: "max_customers",
  suppliers: "max_suppliers",
  storageMb: "max_storage_mb",
} as const;

/** null / undefined / -1 all mean unlimited. */
export function limitFor(
  entitlements: Entitlements,
  key: string,
): number | null {
  const value = entitlements.limits[key];
  if (value === undefined || value === null || value < 0) return null;
  return value;
}

export function isWithinLimit(
  entitlements: Entitlements,
  key: string,
  currentCount: number,
): boolean {
  const limit = limitFor(entitlements, key);
  if (limit === null) return true;
  return currentCount < limit;
}

export function describeLimit(
  entitlements: Entitlements,
  key: string,
): string {
  const limit = limitFor(entitlements, key);
  return limit === null ? "Unlimited" : String(limit);
}
