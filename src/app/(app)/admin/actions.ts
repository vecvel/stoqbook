"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  announcements,
  featureFlags,
  licenses,
  plans,
  tenants,
} from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { NotFoundError } from "@/lib/authz/errors";
import { slugify } from "@/lib/format";
import {
  ALL_FEATURE_SLUGS,
  MODULE_SLUGS,
  resolveModuleDependencies,
} from "@/lib/registry";
import { auditAdmin, diff } from "@/lib/services/audit";
import {
  activateBusiness,
  archiveBusiness,
  suspendBusiness,
  validatePlanChange,
} from "@/lib/services/business";
import {
  bool,
  dateOrNull,
  decimalStr,
  failure,
  num,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/**
 * Business admin panel actions.
 *
 * Everything here is owner-level configuration of the installation itself:
 * business status, licence, plans, feature flags and announcements.
 */

const LIMIT_KEYS = [
  "max_stores",
  "max_warehouses",
  "max_employees",
  "max_products",
  "max_customers",
  "max_suppliers",
  "max_storage_mb",
];

/* -------------------------------------------------------------------------- */
/* Business profile and status                                                */
/* -------------------------------------------------------------------------- */

export async function updateBusinessProfile(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    const name = str(form, "name");
    if (!name) return failure("Name is required.", { name: ["Required."] });

    const [after] = await db
      .update(tenants)
      .set({
        name,
        contact_name: optionalStr(form, "contact_name"),
        contact_email: str(form, "contact_email") || ctx.business.contact_email,
        contact_phone: optionalStr(form, "contact_phone"),
        country: str(form, "country") || ctx.business.country,
        currency: str(form, "currency") || ctx.business.currency,
        timezone: str(form, "timezone") || ctx.business.timezone,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(tenants.id, ctx.business.id))
      .returning();

    await auditAdmin(ctx, {
      event: "BusinessUpdated",
      entityType: "business",
      entityId: ctx.business.id,
      summary: `Updated ${after.name}`,
      payload: { changes: diff(ctx.business, after) },
    });

    revalidate("/admin", "/settings");
    return success(undefined, "Business profile updated.");
  });
}

export async function setBusinessStatus(
  action: "activate" | "suspend" | "archive",
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.business_status");
    const id = ctx.business.id;

    let message: string;
    let event: string;

    switch (action) {
      case "activate":
        await activateBusiness(id);
        event = "BusinessActivated";
        message = `${ctx.business.name} is active.`;
        break;
      case "suspend":
        if (!reason?.trim()) {
          return failure("A reason is required when suspending the business.");
        }
        await suspendBusiness(id, reason.trim());
        event = "BusinessSuspended";
        message = `${ctx.business.name} suspended. All data is preserved.`;
        break;
      case "archive":
        await archiveBusiness(id);
        event = "BusinessArchived";
        message = `${ctx.business.name} archived. All data is retained.`;
        break;
    }

    await auditAdmin(ctx, {
      event,
      entityType: "business",
      entityId: id,
      summary: message,
      payload: { reason },
    });

    revalidate("/admin", "/dashboard");
    return success(undefined, message);
  });
}

/* -------------------------------------------------------------------------- */
/* Plans                                                                      */
/* -------------------------------------------------------------------------- */

export async function savePlan(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.plan_manage");

    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Plan name is required.", { name: ["Required."] });

    // Only registry-defined slugs are stored, and dependencies are enforced.
    const validModules = new Set(MODULE_SLUGS);
    const validFeatures = new Set(ALL_FEATURE_SLUGS);

    const requestedModules = form
      .getAll("modules")
      .map(String)
      .filter((m) => validModules.has(m));
    const modules = resolveModuleDependencies(requestedModules);

    const features = [...new Set(form.getAll("features").map(String))].filter(
      (f) => validFeatures.has(f),
    );

    const limits: Record<string, number | null> = {};
    for (const key of LIMIT_KEYS) {
      const raw = str(form, key);
      // Blank means unlimited.
      limits[key] = raw === "" ? null : Math.max(0, Number(raw) || 0);
    }

    const values = {
      name,
      description: optionalStr(form, "description"),
      price_once: decimalStr(form, "price_once"),
      price_monthly: decimalStr(form, "price_monthly"),
      price_yearly: decimalStr(form, "price_yearly"),
      modules,
      features,
      limits,
      is_public: bool(form, "is_public"),
      archived: bool(form, "archived"),
      sort_order: num(form, "sort_order", 50),
    };

    if (id) {
      await db
        .update(plans)
        .set({ ...values, updated_at: new Date() })
        .where(eq(plans.id, id));
    } else {
      const slug = slugify(name);
      const [clash] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.slug, slug))
        .limit(1);
      if (clash) {
        return failure("A plan with that name already exists.", {
          name: ["Already used."],
        });
      }
      await db.insert(plans).values({ slug, ...values });
    }

    await auditAdmin(ctx, {
      event: id ? "PlanUpdated" : "PlanCreated",
      entityType: "plan",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} plan ${name}`,
      payload: { modules: modules.length, features: features.length },
    });

    revalidate("/admin/plans", "/admin/license");
    return success(undefined, "Plan saved.");
  });
}

/* -------------------------------------------------------------------------- */
/* Licence                                                                    */
/* -------------------------------------------------------------------------- */

/** Switches the installation onto a different plan, issuing a new licence. */
export async function changePlan(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.license_manage");

    const planId = uuid(form, "plan_id");
    if (!planId) return failure("Select a plan.");

    const storeId = uuid(form, "store_id");
    if (!storeId) return failure("Store not found.");

    // A downgrade is refused while usage exceeds the target plan.
    const check = await validatePlanChange(ctx.business.id, planId);
    if (!check.ok) {
      return failure(
        `This plan cannot be applied yet: ${check.violations.join(" ")}`,
      );
    }

    const billingMode = (str(form, "billing_mode") || "lifetime") as
      | "lifetime"
      | "subscription"
      | "trial"
      | "manual"
      | "internal";

    const expiresAt = dateOrNull(form, "expires_at");

    await db.transaction(async (tx) => {
      // Exactly one current licence at a time; superseded ones stay as history.
      await tx
        .update(licenses)
        .set({ is_current: false, updated_at: new Date() })
        .where(
          and(
            eq(licenses.tenant_id, ctx.business.id),
            eq(licenses.store_id, storeId),
            eq(licenses.is_current, true),
          ),
        );

      await tx.insert(licenses).values({
        tenant_id: ctx.business.id,
        store_id: storeId,
        plan_id: planId,
        status: "active",
        billing_mode: billingMode,
        billing_cycle:
          billingMode === "subscription"
            ? ((str(form, "billing_cycle") || "yearly") as
                | "monthly"
                | "quarterly"
                | "yearly")
            : "none",
        license_key: optionalStr(form, "license_key"),
        // Perpetual and internal licences never expire.
        expires_at:
          billingMode === "lifetime" || billingMode === "internal"
            ? null
            : expiresAt,
        notes: optionalStr(form, "notes"),
        is_current: true,
        created_by: ctx.user.id,
      });
    });

    await auditAdmin(ctx, {
      event: "LicenseAssigned",
      entityType: "license",
      entityId: ctx.business.id,
      summary: "Licence issued",
      payload: { plan_id: planId, billing_mode: billingMode },
    });

    revalidate("/admin", `/admin/stores/${storeId}/license`, "/settings/license");
    return success(undefined, "Licence updated.");
  });
}

export async function updateLicense(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.license_manage");

    const licenseId = uuid(form, "license_id");
    if (!licenseId) return failure("Licence not found.");

    const [before] = await db
      .select()
      .from(licenses)
      .where(
        and(eq(licenses.id, licenseId), eq(licenses.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (!before) throw NotFoundError("Licence not found.");

    const status = (str(form, "status") || before.status) as
      | "pending"
      | "active"
      | "expired"
      | "suspended"
      | "cancelled";

    const [after] = await db
      .update(licenses)
      .set({
        status,
        license_key: optionalStr(form, "license_key"),
        expires_at: dateOrNull(form, "expires_at"),
        notes: optionalStr(form, "notes"),
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(licenses.id, licenseId))
      .returning();

    await auditAdmin(ctx, {
      event: "LicenseExtended",
      entityType: "license",
      entityId: licenseId,
      summary: `Licence updated to ${status}`,
      payload: { changes: diff(before, after) },
    });

    revalidate("/admin", `/admin/stores/${before.store_id}/license`, "/settings/license");
    return success(undefined, "Licence updated.");
  });
}

/**
 * Applies module, feature and limit overrides on top of the plan.
 * Overrides always take precedence (03-license-system.md § License Overrides).
 */
export async function saveLicenseOverrides(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.license_manage");

    const licenseId = uuid(form, "license_id");
    if (!licenseId) return failure("Licence not found.");

    const [before] = await db
      .select()
      .from(licenses)
      .where(
        and(eq(licenses.id, licenseId), eq(licenses.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (!before) throw NotFoundError("Licence not found.");

    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, before.plan_id))
      .limit(1);
    if (!plan) throw NotFoundError("Plan not found.");

    /* Only record a difference from the plan — otherwise the override list
       grows meaninglessly and hides what was actually customised. */
    const enabledModules = new Set(form.getAll("modules").map(String));
    const moduleOverrides: Record<string, boolean> = {};
    for (const slug of MODULE_SLUGS) {
      const inPlan = plan.modules.includes(slug);
      const requested = enabledModules.has(slug);
      if (inPlan !== requested) moduleOverrides[slug] = requested;
    }

    const enabledFeatures = new Set(form.getAll("features").map(String));
    const featureOverrides: Record<string, boolean> = {};
    for (const slug of ALL_FEATURE_SLUGS) {
      const inPlan = plan.features.includes(slug);
      const requested = enabledFeatures.has(slug);
      if (inPlan !== requested) featureOverrides[slug] = requested;
    }

    const limitOverrides: Record<string, number | null> = {};
    for (const key of LIMIT_KEYS) {
      const raw = str(form, `limit_${key}`);
      if (raw === "") continue;
      const value = raw === "unlimited" ? null : Math.max(0, Number(raw) || 0);
      if (plan.limits[key] !== value) limitOverrides[key] = value;
    }

    const [after] = await db
      .update(licenses)
      .set({
        module_overrides: moduleOverrides,
        feature_overrides: featureOverrides,
        limit_overrides: limitOverrides,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(licenses.id, licenseId))
      .returning();

    const total =
      Object.keys(moduleOverrides).length +
      Object.keys(featureOverrides).length +
      Object.keys(limitOverrides).length;

    await auditAdmin(ctx, {
      event: "LicenseOverridden",
      entityType: "license",
      entityId: licenseId,
      summary: `${total} override(s) applied`,
      payload: { changes: diff(before, after) },
    });

    revalidate("/admin/license", "/settings/license", "/settings/modules");
    return success(
      undefined,
      total === 0
        ? "Overrides cleared — the business now matches the plan exactly."
        : `${total} override(s) applied.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Feature flags                                                              */
/* -------------------------------------------------------------------------- */

export async function saveFeatureFlag(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.flag_manage");

    const id = uuid(form, "id");
    const key = str(form, "key").trim();
    const name = str(form, "name");

    if (!key) return failure("Flag key is required.");
    if (!name) return failure("Flag name is required.");

    const values = {
      key,
      name,
      description: optionalStr(form, "description"),
      enabled: bool(form, "enabled"),
    };

    if (id) {
      await db
        .update(featureFlags)
        .set({ ...values, updated_at: new Date() })
        .where(eq(featureFlags.id, id));
    } else {
      const [clash] = await db
        .select({ id: featureFlags.id })
        .from(featureFlags)
        .where(eq(featureFlags.key, key))
        .limit(1);
      if (clash) return failure("A flag with that key already exists.");
      await db.insert(featureFlags).values(values);
    }

    await auditAdmin(ctx, {
      event: "FeatureFlagUpdated",
      entityType: "feature_flag",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} flag ${key}`,
      payload: { enabled: values.enabled },
    });

    revalidate("/admin/flags");
    return success(undefined, "Feature flag saved.");
  });
}

export async function deleteFeatureFlag(flagId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.flag_manage");
    await db.delete(featureFlags).where(eq(featureFlags.id, flagId));
    await auditAdmin(ctx, {
      event: "FeatureFlagUpdated",
      entityType: "feature_flag",
      entityId: flagId,
      summary: "Feature flag deleted",
    });
    revalidate("/admin/flags");
    return success(undefined, "Feature flag deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                              */
/* -------------------------------------------------------------------------- */

export async function saveAnnouncement(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.announcement_manage");

    const id = uuid(form, "id");
    const title = str(form, "title");
    const body = str(form, "body");

    if (!title) return failure("Title is required.");
    if (!body) return failure("Message body is required.");

    const values = {
      title,
      body,
      severity: str(form, "severity") || "info",
      starts_at: dateOrNull(form, "starts_at") ?? new Date(),
      ends_at: dateOrNull(form, "ends_at"),
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(announcements)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(eq(announcements.id, id));
    } else {
      await db
        .insert(announcements)
        .values({ ...values, created_by: ctx.user.id });
    }

    await auditAdmin(ctx, {
      event: "AnnouncementPublished",
      entityType: "announcement",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Published"} announcement: ${title}`,
    });

    revalidate("/admin/announcements", "/dashboard");
    return success(undefined, "Announcement saved.");
  });
}

export async function deleteAnnouncement(
  announcementId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.announcement_manage");
    await db.delete(announcements).where(eq(announcements.id, announcementId));
    await auditAdmin(ctx, {
      event: "AnnouncementPublished",
      entityType: "announcement",
      entityId: announcementId,
      summary: "Announcement deleted",
    });
    revalidate("/admin/announcements", "/dashboard");
    return success(undefined, "Announcement deleted.");
  });
}
