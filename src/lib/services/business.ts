import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { db, type Transaction } from "@/db";
import {
  branches,
  customerGroups,
  customers,
  departments,
  designations,
  expenseCategories,
  leaveTypes,
  licenses,
  organizations,
  plans,
  rolePermissions,
  roles,
  shifts,
  taxGroups,
  tenants,
  units,
  userRoles,
  users,
  warehouses,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { ConflictError, LimitExceededError, ValidationError } from "@/lib/authz/errors";
import { limitFor, resolveEntitlements, type Entitlements } from "@/lib/authz/entitlements";
import { slugify } from "@/lib/format";
import { ALL_SETTINGS } from "@/lib/registry";

import { auditSystem } from "./audit";
import { provisionSequences } from "./numbering";
import { DEFAULT_ROLES, resolveRolePermissions } from "./default-roles";
import { provisionSettings } from "./settings";

/**
 * Business setup.
 *
 * StoqBook is installed for one business. Setup runs once, from the first-run
 * wizard, and provisions the business record, its organisation profile, the
 * default store and warehouse, the standard role set, the owner account, base
 * reference data, document sequences, settings and a licence — all in one
 * transaction (02-business-structure.md § Business Setup Flow).
 */

function isUndefinedTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  return err.code === "42P01" || (Boolean(err.message) && err.message!.includes("does not exist"));
}

/** True when this installation has not been set up yet. */
export async function isInstalled(): Promise<boolean> {
  try {
    const [row] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    return Boolean(row);
  } catch (error) {
    if (isUndefinedTableError(error)) return false;
    throw error;
  }
}

/** The single business row, or null before setup. */
export async function getBusiness() {
  try {
    const [row] = await db.select().from(tenants).limit(1);
    return row ?? null;
  } catch (error) {
    if (isUndefinedTableError(error)) return null;
    throw error;
  }
}

export interface SetupBusinessInput {
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  /** Plan slug; defaults to `lifetime` for a perpetual installation. */
  planSlug?: string;
  billingMode?:
    | "lifetime"
    | "subscription"
    | "trial"
    | "manual"
    | "internal";
  trialDays?: number;
  licenseKey?: string;
  country?: string;
  currency?: string;
  timezone?: string;
  contactPhone?: string;
  /** Name of the first store. Defaults to "Main Store". */
  storeName?: string;
}

export interface SetupBusinessResult {
  businessId: string;
  organizationId: string;
  ownerUserId: string;
  storeId: string;
  warehouseId: string;
  licenseId: string;
  slug: string;
}

export async function setupBusiness(
  input: SetupBusinessInput,
): Promise<SetupBusinessResult> {
  /* Setup is a one-time operation: a second run would create a second business,
     which this product does not support.

     This check is the friendly path, not the guarantee — it reads before the
     transaction opens, so two simultaneous submissions could both pass it. The
     `tenants_singleton` unique index is what actually makes a second business
     impossible; the catch below turns its constraint violation back into this
     same message. */
  if (await isInstalled()) {
    throw ConflictError("This installation is already set up.");
  }

  const email = input.ownerEmail.trim().toLowerCase();
  if (!email.includes("@")) throw ValidationError("A valid email is required.");

  const desiredSlug = slugify(input.businessName);
  if (!desiredSlug) throw ValidationError("Business name is required.");

  const plan = await resolvePlan(input.planSlug);
  const passwordHash = await hashPassword(input.ownerPassword);

  try {
    return await runSetup(input, { email, desiredSlug, plan, passwordHash });
  } catch (error) {
    if (isSingletonViolation(error)) {
      throw ConflictError("This installation is already set up.");
    }
    throw error;
  }
}

/** True when the failure is the one-business-per-installation index firing. */
function isSingletonViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const constraint = (error as { constraint?: string } | null)?.constraint;
  return code === "23505" && constraint === "tenants_singleton";
}

async function runSetup(
  input: SetupBusinessInput,
  prepared: {
    email: string;
    desiredSlug: string;
    plan: Awaited<ReturnType<typeof resolvePlan>>;
    passwordHash: string;
  },
): Promise<SetupBusinessResult> {
  const { email, desiredSlug, plan, passwordHash } = prepared;

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, desiredSlug);

    /* ---- Business ------------------------------------------------------ */
    const [business] = await tx
      .insert(tenants)
      .values({
        slug,
        name: input.businessName.trim(),
        // The wizard completes in one submission, so the business goes straight
        // to active — there is no email-verification step to wait on.
        status: "active",
        contact_name: input.ownerName.trim(),
        contact_email: email,
        contact_phone: input.contactPhone ?? null,
        country: input.country ?? "IN",
        currency: input.currency ?? "INR",
        timezone: input.timezone ?? "Asia/Kolkata",
        activated_at: new Date(),
        setup_completed_at: new Date(),
      })
      .returning();

    /* ---- Licence ------------------------------------------------------- */
    const billingMode = input.billingMode ?? "lifetime";
    const trialDays = input.trialDays ?? 14;
    // A lifetime or internal licence never expires — that is the point of a
    // perpetual per-installation sale (03-license-system.md § Billing Modes).
    const expiresAt =
      billingMode === "trial"
        ? new Date(Date.now() + trialDays * 86_400_000)
        : billingMode === "subscription"
          ? new Date(Date.now() + 365 * 86_400_000)
          : null;

    const [license] = await tx
      .insert(licenses)
      .values({
        tenant_id: business.id,
        plan_id: plan.id,
        status: "active",
        billing_mode: billingMode,
        billing_cycle: billingMode === "subscription" ? "yearly" : "none",
        license_key: input.licenseKey?.trim() || null,
        expires_at: expiresAt,
        is_current: true,
      })
      .returning();

    /* ---- Organisation -------------------------------------------------- */
    const [organization] = await tx
      .insert(organizations)
      .values({
        tenant_id: business.id,
        name: input.businessName.trim(),
        email,
        phone: input.contactPhone ?? null,
        country: input.country ?? "IN",
      })
      .returning();

    /* ---- Default store and warehouse ----------------------------------- */
    const [store] = await tx
      .insert(branches)
      .values({
        tenant_id: business.id,
        organization_id: organization.id,
        code: "MAIN",
        name: input.storeName?.trim() || "Main Store",
        document_prefix: null,
        is_default: true,
        is_active: true,
      })
      .returning();

    const [warehouse] = await tx
      .insert(warehouses)
      .values({
        tenant_id: business.id,
        branch_id: store.id,
        code: "WH-MAIN",
        name: "Main Warehouse",
        is_default: true,
        is_active: true,
      })
      .returning();

    /* ---- Roles --------------------------------------------------------- */
    const roleIdBySlug = new Map<string, string>();
    for (const definition of DEFAULT_ROLES) {
      const [role] = await tx
        .insert(roles)
        .values({
          tenant_id: business.id,
          slug: definition.slug,
          name: definition.name,
          description: definition.description,
          is_system: true,
          is_owner: definition.isOwner ?? false,
        })
        .returning();

      roleIdBySlug.set(definition.slug, role.id);

      // The Owner role derives its permissions dynamically at request time, so
      // storing rows for it would go stale as modules are added.
      if (!definition.isOwner) {
        const keys = resolveRolePermissions(definition);
        if (keys.length > 0) {
          await tx.insert(rolePermissions).values(
            keys.map((permission_key) => ({
              role_id: role.id,
              permission_key,
            })),
          );
        }
      }
    }

    /* ---- Owner user ---------------------------------------------------- */
    const [owner] = await tx
      .insert(users)
      .values({
        tenant_id: business.id,
        employee_code: "EMP-000001",
        full_name: input.ownerName.trim(),
        email,
        phone: input.contactPhone ?? null,
        password_hash: passwordHash,
        login_enabled: true,
        status: "active",
        joining_date: new Date(),
        employment_type: "permanent",
        branch_id: store.id,
      })
      .returning();

    await tx.insert(userRoles).values({
      user_id: owner.id,
      role_id: roleIdBySlug.get("owner")!,
    });

    /* ---- Reference data ------------------------------------------------ */
    await provisionReferenceData(tx, business.id);
    await provisionSequences(business.id, tx);
    await provisionSettings(
      business.id,
      ALL_SETTINGS.filter((s) => s.scope === "business").map((s) => s.key),
      tx,
    );

    await auditSystem(
      {
        businessId: business.id,
        event: "BusinessSetupCompleted",
        moduleSlug: "admin",
        entityType: "business",
        entityId: business.id,
        summary: `${business.name} set up on the ${plan.name} plan`,
        payload: { slug, plan: plan.slug, billing_mode: billingMode },
        actorName: input.ownerName,
      },
      tx,
    );

    return {
      businessId: business.id,
      organizationId: organization.id,
      ownerUserId: owner.id,
      storeId: store.id,
      warehouseId: warehouse.id,
      licenseId: license.id,
      slug,
    };
  });
}

async function resolvePlan(planSlug?: string) {
  const candidates = [planSlug, "lifetime", "professional", "starter", "trial"]
    .filter(Boolean) as string[];

  for (const slug of candidates) {
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.slug, slug))
      .limit(1);
    if (plan) return plan;
  }

  const [any] = await db.select().from(plans).limit(1);
  if (!any) {
    throw ValidationError(
      "No plans are configured. Run the seed before setting up the business.",
    );
  }
  return any;
}

/** Appends a numeric suffix until the slug is free. */
async function uniqueSlug(tx: Transaction, base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const [existing] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
  throw ConflictError("Could not allocate a unique business identifier.");
}

/** Units, tax groups, customer groups, expense categories and walk-in customer. */
async function provisionReferenceData(
  tx: Transaction,
  businessId: string,
): Promise<void> {
  await tx.insert(units).values([
    { tenant_id: businessId, name: "Piece", short_name: "pc", allow_decimal: false },
    { tenant_id: businessId, name: "Box", short_name: "box", allow_decimal: false },
    { tenant_id: businessId, name: "Carton", short_name: "ctn", allow_decimal: false },
    { tenant_id: businessId, name: "Packet", short_name: "pkt", allow_decimal: false },
    { tenant_id: businessId, name: "Kilogram", short_name: "kg", allow_decimal: true },
    { tenant_id: businessId, name: "Gram", short_name: "g", allow_decimal: true },
    { tenant_id: businessId, name: "Litre", short_name: "L", allow_decimal: true },
    { tenant_id: businessId, name: "Metre", short_name: "m", allow_decimal: true },
  ]);

  await tx.insert(taxGroups).values([
    {
      tenant_id: businessId,
      name: "Exempt",
      rate: "0",
      mode: "exclusive" as const,
      is_default: true,
      components: [],
    },
    {
      tenant_id: businessId,
      name: "GST 5%",
      rate: "5",
      mode: "exclusive" as const,
      components: [
        { name: "CGST", rate: 2.5 },
        { name: "SGST", rate: 2.5 },
      ],
    },
    {
      tenant_id: businessId,
      name: "GST 12%",
      rate: "12",
      mode: "exclusive" as const,
      components: [
        { name: "CGST", rate: 6 },
        { name: "SGST", rate: 6 },
      ],
    },
    {
      tenant_id: businessId,
      name: "GST 18%",
      rate: "18",
      mode: "exclusive" as const,
      components: [
        { name: "CGST", rate: 9 },
        { name: "SGST", rate: 9 },
      ],
    },
    {
      tenant_id: businessId,
      name: "GST 28%",
      rate: "28",
      mode: "exclusive" as const,
      components: [
        { name: "CGST", rate: 14 },
        { name: "SGST", rate: 14 },
      ],
    },
  ]);

  const [retailGroup] = await tx
    .insert(customerGroups)
    .values([
      { tenant_id: businessId, name: "Retail", is_default: true },
      { tenant_id: businessId, name: "Wholesale", use_wholesale_price: true },
      { tenant_id: businessId, name: "VIP", discount_percent: "5" },
      { tenant_id: businessId, name: "Corporate" },
    ])
    .returning();

  // A walk-in customer must exist so POS works out of the box.
  await tx.insert(customers).values({
    tenant_id: businessId,
    code: "WALK-IN",
    name: "Walk-in Customer",
    type: "walk_in",
    group_id: retailGroup?.id ?? null,
    is_walk_in: true,
    status: "active",
  });

  await tx.insert(expenseCategories).values([
    { tenant_id: businessId, name: "Rent" },
    { tenant_id: businessId, name: "Salaries" },
    { tenant_id: businessId, name: "Utilities" },
    { tenant_id: businessId, name: "Transport" },
    { tenant_id: businessId, name: "Marketing" },
    { tenant_id: businessId, name: "Maintenance" },
    { tenant_id: businessId, name: "Other" },
  ]);

  /* Leave types and shifts must exist or leave cannot be requested and
     attendance cannot judge lateness (13-employees.md). */
  await tx.insert(leaveTypes).values([
    { tenant_id: businessId, name: "Casual Leave", is_paid: true, annual_quota: 12 },
    { tenant_id: businessId, name: "Sick Leave", is_paid: true, annual_quota: 8 },
    { tenant_id: businessId, name: "Paid Leave", is_paid: true, annual_quota: 15 },
    { tenant_id: businessId, name: "Unpaid Leave", is_paid: false, annual_quota: 0 },
    { tenant_id: businessId, name: "Maternity Leave", is_paid: true, annual_quota: 180 },
    { tenant_id: businessId, name: "Emergency Leave", is_paid: false, annual_quota: 0 },
  ]);

  await tx.insert(shifts).values([
    {
      tenant_id: businessId,
      name: "Morning",
      start_time: "09:00",
      end_time: "18:00",
      break_minutes: 45,
      grace_minutes: 10,
    },
    {
      tenant_id: businessId,
      name: "Evening",
      start_time: "14:00",
      end_time: "23:00",
      break_minutes: 45,
      grace_minutes: 10,
    },
    {
      tenant_id: businessId,
      name: "Night",
      start_time: "22:00",
      end_time: "07:00",
      break_minutes: 60,
      grace_minutes: 15,
    },
  ]);

  await tx.insert(departments).values([
    { tenant_id: businessId, name: "Store Operations" },
    { tenant_id: businessId, name: "Warehouse" },
    { tenant_id: businessId, name: "Accounts" },
    { tenant_id: businessId, name: "Administration" },
  ]);

  await tx.insert(designations).values([
    { tenant_id: businessId, name: "Store Manager" },
    { tenant_id: businessId, name: "Cashier" },
    { tenant_id: businessId, name: "Stock Assistant" },
    { tenant_id: businessId, name: "Accountant" },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Lifecycle — 02-business-structure.md § Business Status                     */
/* -------------------------------------------------------------------------- */

export async function activateBusiness(businessId: string): Promise<void> {
  await db
    .update(tenants)
    .set({
      status: "active",
      activated_at: new Date(),
      suspended_reason: null,
      archived_at: null,
      updated_at: new Date(),
    })
    .where(eq(tenants.id, businessId));
}

export async function suspendBusiness(
  businessId: string,
  reason: string,
): Promise<void> {
  await db
    .update(tenants)
    .set({ status: "suspended", suspended_reason: reason, updated_at: new Date() })
    .where(eq(tenants.id, businessId));
}

/**
 * Archives the business. Data is retained in full — archiving makes the
 * installation read-only rather than destroying anything.
 */
export async function archiveBusiness(businessId: string): Promise<void> {
  await db
    .update(tenants)
    .set({ status: "archived", archived_at: new Date(), updated_at: new Date() })
    .where(eq(tenants.id, businessId));
}

/* -------------------------------------------------------------------------- */
/* Limit enforcement                                                          */
/* -------------------------------------------------------------------------- */

export type LimitedResource =
  | "stores"
  | "warehouses"
  | "employees"
  | "products"
  | "customers"
  | "suppliers";

const LIMIT_KEY: Record<LimitedResource, string> = {
  stores: "max_stores",
  warehouses: "max_warehouses",
  employees: "max_employees",
  products: "max_products",
  customers: "max_customers",
  suppliers: "max_suppliers",
};

const LABEL: Record<LimitedResource, string> = {
  stores: "stores",
  warehouses: "warehouses",
  employees: "employees",
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
};

/** Current usage for a limited resource. */
export async function usageFor(
  businessId: string,
  resource: LimitedResource,
): Promise<number> {
  const table = {
    stores: branches,
    warehouses,
    employees: users,
    products: (await import("@/db/schema")).products,
    customers,
    suppliers: (await import("@/db/schema")).suppliers,
  }[resource];

  const [row] = await db
    .select({ value: count() })
    .from(table)
    // Soft-deleted rows do not count against a plan limit.
    .where(and(eq(table.tenant_id, businessId), isNull(table.deleted_at)));

  return Number(row?.value ?? 0);
}

/** Throws when creating one more of `resource` would breach the plan limit. */
export async function assertWithinLimit(
  businessId: string,
  resource: LimitedResource,
  entitlements?: Entitlements,
): Promise<void> {
  const ent = entitlements ?? (await resolveEntitlements(businessId));
  const limit = limitFor(ent, LIMIT_KEY[resource]);
  if (limit === null) return;

  const used = await usageFor(businessId, resource);
  if (used >= limit) {
    throw LimitExceededError(
      `Your ${ent.plan?.name ?? "current"} licence allows ${limit} ${LABEL[resource]}. ` +
        "Change plan to add more.",
    );
  }
}

export interface UsageSummary {
  resource: LimitedResource;
  label: string;
  used: number;
  limit: number | null;
}

const LIMITED_RESOURCES: LimitedResource[] = [
  "stores",
  "warehouses",
  "employees",
  "products",
  "customers",
  "suppliers",
];

/** Usage vs limits for the licence page. */
export async function usageSummary(
  businessId: string,
  entitlements?: Entitlements,
): Promise<UsageSummary[]> {
  const ent = entitlements ?? (await resolveEntitlements(businessId));

  return Promise.all(
    LIMITED_RESOURCES.map(async (resource) => ({
      resource,
      label: LABEL[resource],
      used: await usageFor(businessId, resource),
      limit: limitFor(ent, LIMIT_KEY[resource]),
    })),
  );
}

/**
 * Validates a plan change. A downgrade is blocked while current usage exceeds the
 * target plan's limits (03-license-system.md § Downgrade Flow).
 */
export async function validatePlanChange(
  businessId: string,
  targetPlanId: string,
): Promise<{ ok: boolean; violations: string[] }> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, targetPlanId))
    .limit(1);
  if (!plan) throw ValidationError("Target plan not found.");

  const violations: string[] = [];
  for (const resource of LIMITED_RESOURCES) {
    const raw = plan.limits[LIMIT_KEY[resource]];
    if (raw === undefined || raw === null || raw < 0) continue;
    const used = await usageFor(businessId, resource);
    if (used > raw) {
      violations.push(
        `${used} ${LABEL[resource]} in use but ${plan.name} allows only ${raw}.`,
      );
    }
  }

  return { ok: violations.length === 0, violations };
}
