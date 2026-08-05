/**
 * Plan catalogue (03-license-system.md § Plans).
 *
 * A plan is a template of entitlements a licence can grant this installation.
 * `priceOnce` is the perpetual per-installation price and is the primary figure
 * for a lifetime licence; the recurring prices only apply to a subscription or
 * annual maintenance contract.
 *
 * Module and feature lists reference registry slugs; the seeder validates them
 * so a typo fails loudly. `null` limits mean unlimited.
 */
import {
  ALL_FEATURE_SLUGS,
  DEFAULT_FEATURE_SLUGS,
  MODULE_SLUGS,
} from "@/lib/registry";

export interface PlanSeed {
  slug: string;
  name: string;
  description: string;
  /** One-time perpetual price. */
  priceOnce: string;
  priceMonthly: string;
  priceYearly: string;
  modules: string[] | "all";
  features: string[] | "all" | "defaults";
  limits: Record<string, number | null>;
  isPublic: boolean;
  sortOrder: number;
}

const CORE = ["dashboard", "notifications", "settings", "admin"];

export const PLAN_SEEDS: PlanSeed[] = [
  {
    slug: "trial",
    name: "Trial",
    description: "Full Professional access for 14 days.",
    priceOnce: "0",
    priceMonthly: "0",
    priceYearly: "0",
    modules: [
      ...CORE,
      "products",
      "inventory",
      "sales",
      "pos",
      "purchases",
      "customers",
      "suppliers",
      "employees",
      "expenses",
      "reports",
    ],
    features: [
      ...DEFAULT_FEATURE_SLUGS,
      "products.variants",
      "products.barcode",
      "products.bulk_import",
      "products.bulk_export",
      "inventory.transfer",
      "inventory.count",
      "inventory.valuation",
      "inventory.multi_warehouse",
      "purchases.approvals",
      "purchases.returns",
      "purchases.partial_receipt",
      "sales.quotations",
      "sales.credit",
      "sales.split_payment",
      "pos.sessions",
      "customers.credit",
      "customers.loyalty",
      "customers.addresses",
      "suppliers.contacts",
      "suppliers.product_mapping",
      "employees.attendance",
      "employees.departments",
      "reports.advanced",
      "reports.financial",
      "reports.export",
      "settings.stores",
      "settings.warehouses",
      "settings.security",
    ],
    limits: {
      max_stores: 3,
      max_warehouses: 3,
      max_employees: 10,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: 2000,
    },
    isPublic: false,
    sortOrder: 15,
  },
  {
    slug: "starter",
    name: "Starter",
    description: "Counter billing, stock and purchasing for one store.",
    priceOnce: "24999",
    priceMonthly: "799",
    priceYearly: "7990",
    modules: [
      ...CORE,
      "products",
      "inventory",
      "sales",
      "pos",
      "purchases",
      "customers",
      "suppliers",
      "reports",
    ],
    features: [
      ...DEFAULT_FEATURE_SLUGS,
      "products.barcode",
      "products.bulk_import",
      "products.bulk_export",
      "inventory.count",
      "purchases.returns",
      "purchases.partial_receipt",
      "pos.sessions",
      "reports.export",
    ],
    limits: {
      max_stores: 1,
      max_warehouses: 2,
      max_employees: 5,
      max_products: 2000,
      max_customers: 5000,
      max_suppliers: 200,
      max_storage_mb: 1000,
    },
    isPublic: true,
    sortOrder: 20,
  },
  {
    slug: "professional",
    name: "Professional",
    description: "Variants, credit, loyalty and financial reporting.",
    priceOnce: "49999",
    priceMonthly: "1999",
    priceYearly: "19990",
    modules: [
      ...CORE,
      "products",
      "inventory",
      "sales",
      "pos",
      "purchases",
      "customers",
      "suppliers",
      "employees",
      "expenses",
      "reports",
    ],
    features: [
      ...DEFAULT_FEATURE_SLUGS,
      "products.variants",
      "products.barcode",
      "products.qr",
      "products.bulk_import",
      "products.bulk_export",
      "inventory.transfer",
      "inventory.count",
      "inventory.valuation",
      "inventory.reservation",
      "inventory.import",
      "inventory.export",
      "purchases.requisitions",
      "purchases.approvals",
      "purchases.returns",
      "purchases.partial_receipt",
      "purchases.export",
      "sales.quotations",
      "sales.orders",
      "sales.credit",
      "sales.split_payment",
      "sales.export",
      "pos.sessions",
      "customers.credit",
      "customers.loyalty",
      "customers.addresses",
      "customers.notes",
      "customers.import",
      "customers.export",
      "suppliers.contacts",
      "suppliers.product_mapping",
      "suppliers.ratings",
      "suppliers.import",
      "suppliers.export",
      "employees.attendance",
      "employees.departments",
      "employees.leave",
      "employees.export",
      "expenses.export",
      "reports.advanced",
      "reports.financial",
      "reports.export",
      "settings.security",
      "settings.warehouses",
    ],
    limits: {
      max_stores: 2,
      max_warehouses: 4,
      max_employees: 15,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: 5000,
    },
    isPublic: true,
    sortOrder: 30,
  },
  {
    slug: "business",
    name: "Business",
    description: "Multi-store operations, transfers and advanced analytics.",
    priceOnce: "99999",
    priceMonthly: "4499",
    priceYearly: "44990",
    modules: "all",
    features: [
      ...ALL_FEATURE_SLUGS.filter(
        (f) =>
          !f.startsWith("pos.offline") &&
          !f.startsWith("settings.backup") &&
          !f.startsWith("reports.custom"),
      ),
    ],
    limits: {
      max_stores: 10,
      max_warehouses: 20,
      max_employees: 60,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: 20000,
    },
    isPublic: true,
    sortOrder: 40,
  },
  {
    slug: "lifetime",
    name: "Lifetime",
    description:
      "Every module and feature, bought once and owned outright. The default for a StoqBook installation.",
    priceOnce: "149999",
    priceMonthly: "0",
    priceYearly: "0",
    modules: "all",
    features: "all",
    limits: {
      max_stores: null,
      max_warehouses: null,
      max_employees: null,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: null,
    },
    isPublic: true,
    sortOrder: 45,
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Everything enabled, no limits, negotiated terms.",
    priceOnce: "0",
    priceMonthly: "0",
    priceYearly: "0",
    modules: "all",
    features: "all",
    limits: {
      max_stores: null,
      max_warehouses: null,
      max_employees: null,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: null,
    },
    isPublic: true,
    sortOrder: 50,
  },
  {
    slug: "internal",
    name: "Internal",
    description: "Used by the company that builds StoqBook. Billing disabled.",
    priceOnce: "0",
    priceMonthly: "0",
    priceYearly: "0",
    modules: "all",
    features: "all",
    limits: {
      max_stores: null,
      max_warehouses: null,
      max_employees: null,
      max_products: null,
      max_customers: null,
      max_suppliers: null,
      max_storage_mb: null,
    },
    isPublic: false,
    sortOrder: 90,
  },
];

export function resolvePlanModules(seed: PlanSeed): string[] {
  return seed.modules === "all" ? [...MODULE_SLUGS] : seed.modules;
}

export function resolvePlanFeatures(seed: PlanSeed): string[] {
  if (seed.features === "all") return [...ALL_FEATURE_SLUGS];
  if (seed.features === "defaults") return [...DEFAULT_FEATURE_SLUGS];
  return [...new Set(seed.features)];
}

/** Feature slugs referenced by a plan that the registry does not define. */
export function unknownPlanReferences(): string[] {
  const validFeatures = new Set(ALL_FEATURE_SLUGS);
  const validModules = new Set(MODULE_SLUGS);
  const problems: string[] = [];

  for (const seed of PLAN_SEEDS) {
    for (const m of resolvePlanModules(seed)) {
      if (!validModules.has(m)) problems.push(`${seed.slug} → module ${m}`);
    }
    for (const f of resolvePlanFeatures(seed)) {
      if (!validFeatures.has(f)) problems.push(`${seed.slug} → feature ${f}`);
    }
  }
  return problems;
}
