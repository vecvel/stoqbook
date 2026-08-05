"use server";

import { and, count, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  branches,
  inventoryLevels,
  numberSequences,
  organizations,
  users,
  warehouses,
} from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/authz/errors";
import { SETTING_BY_KEY } from "@/lib/registry";
import { auditEvent, diff } from "@/lib/services/audit";
import { writeSetting } from "@/lib/services/settings";
import { assertWithinLimit } from "@/lib/services/business";
import {
  bool,
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

/* -------------------------------------------------------------------------- */
/* Organisation                                                               */
/* -------------------------------------------------------------------------- */

export async function saveOrganization(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.organization");

    const name = str(form, "name");
    if (!name) return failure("Company name is required.", { name: ["Required."] });

    const [before] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.tenant_id, ctx.business.id))
      .limit(1);
    if (!before) throw NotFoundError("Organisation profile not found.");

    const [after] = await db
      .update(organizations)
      .set({
        name,
        legal_name: optionalStr(form, "legal_name"),
        email: optionalStr(form, "email"),
        phone: optionalStr(form, "phone"),
        website: optionalStr(form, "website"),
        address_line1: optionalStr(form, "address_line1"),
        address_line2: optionalStr(form, "address_line2"),
        city: optionalStr(form, "city"),
        state: optionalStr(form, "state"),
        postal_code: optionalStr(form, "postal_code"),
        country: str(form, "country") || "IN",
        tax_number: optionalStr(form, "tax_number"),
        registration_number: optionalStr(form, "registration_number"),
        logo_url: optionalStr(form, "logo_url"),
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(organizations.id, before.id))
      .returning();

    await auditEvent(ctx, {
      event: "SettingUpdated",
      moduleSlug: "settings",
      entityType: "organization",
      entityId: before.id,
      summary: "Organisation profile updated",
      payload: { changes: diff(before, after) },
    });

    revalidate("/settings", "/dashboard");
    return success(undefined, "Organisation profile saved.");
  });
}

/* -------------------------------------------------------------------------- */
/* Dynamic module settings                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Persists any subset of registry-declared settings.
 *
 * Each key is validated against the registry, and the value is coerced to the
 * declared type — so an unknown or mistyped key can never be stored.
 */
export async function saveSettings(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.update");

    const submitted = form.getAll("__keys").map(String).filter(Boolean);
    if (submitted.length === 0) {
      return failure("Nothing to save.");
    }

    const changes: Record<string, unknown> = {};

    for (const key of submitted) {
      const definition = SETTING_BY_KEY[key];
      if (!definition) continue;

      // Changing a setting requires whatever permission it declares.
      if (definition.permission) {
        await requirePermission(definition.permission);
      }

      let value: unknown;
      switch (definition.type) {
        case "boolean":
          value = bool(form, key);
          break;
        case "number":
        case "money":
          value = num(form, key, Number(definition.default ?? 0));
          break;
        default:
          value = str(form, key);
      }

      await writeSetting(
        {
          businessId: ctx.business.id,
          storeId: ctx.activeStore?.id ?? null,
          userId: ctx.user.id,
        },
        key,
        value,
        { actorId: ctx.user.id },
      );

      changes[key] = value;
    }

    await auditEvent(ctx, {
      event: "SettingUpdated",
      moduleSlug: "settings",
      summary: `${Object.keys(changes).length} setting(s) updated`,
      payload: { changes },
    });

    // Settings affect nearly every screen, so revalidate broadly.
    revalidate(
      "/settings",
      "/settings/preferences",
      "/settings/security",
      "/dashboard",
      "/pos",
      "/products",
      "/inventory",
      "/sales",
      "/purchases",
    );

    return success(undefined, "Settings saved.");
  });
}

/* -------------------------------------------------------------------------- */
/* Stores                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveStore(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.stores", {
      feature: "settings.stores",
    });

    const id = uuid(form, "id");
    const name = str(form, "name");
    const code = str(form, "code").toUpperCase();

    if (!name) return failure("Store name is required.", { name: ["Required."] });
    if (!code) return failure("Store code is required.", { code: ["Required."] });

    const clash = await db
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.tenant_id, ctx.business.id),
          eq(branches.code, code),
          id ? ne(branches.id, id) : undefined,
        ),
      )
      .limit(1);
    if (clash.length > 0) {
      return failure("That store code is already in use.", {
        code: ["Already used."],
      });
    }

    const values = {
      code,
      name,
      email: optionalStr(form, "email"),
      phone: optionalStr(form, "phone"),
      address_line1: optionalStr(form, "address_line1"),
      city: optionalStr(form, "city"),
      state: optionalStr(form, "state"),
      postal_code: optionalStr(form, "postal_code"),
      document_prefix: optionalStr(form, "document_prefix"),
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(branches)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(
          and(eq(branches.id, id), eq(branches.tenant_id, ctx.business.id)),
        );
    } else {
      // Plan limits are enforced before creating the store.
      await assertWithinLimit(ctx.business.id, "stores", ctx.entitlements);

      const [organization] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.tenant_id, ctx.business.id))
        .limit(1);
      if (!organization) throw NotFoundError("Organisation not found.");

      await db.insert(branches).values({
        tenant_id: ctx.business.id,
        organization_id: organization.id,
        ...values,
        created_by: ctx.user.id,
      });
    }

    await auditEvent(ctx, {
      event: "StoreCreated",
      moduleSlug: "settings",
      entityType: "store",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} store ${name}`,
    });

    revalidate("/settings/stores", "/settings");
    return success(undefined, "Store saved.");
  });
}

export async function deleteStore(storeId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.stores", {
      feature: "settings.stores",
    });

    const [store] = await db
      .select()
      .from(branches)
      .where(
        and(eq(branches.id, storeId), eq(branches.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (!store) throw NotFoundError("Store not found.");

    if (store.is_default) {
      throw BusinessRuleError(
        "The default store cannot be deleted.",
        "DEFAULT_STORE_PROTECTED",
      );
    }

    // A store holding inventory cannot be removed (06-database-architecture.md).
    const [stock] = await db
      .select({ value: count() })
      .from(inventoryLevels)
      .where(eq(inventoryLevels.branch_id, storeId));
    if (Number(stock?.value ?? 0) > 0) {
      throw ConflictError(
        "This store still holds stock records. Transfer the stock out first.",
      );
    }

    const [staff] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.branch_id, storeId), isNull(users.deleted_at)));
    if (Number(staff?.value ?? 0) > 0) {
      throw ConflictError(
        `${staff.value} employee(s) are assigned to this store. Reassign them first.`,
      );
    }

    await db
      .update(branches)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        is_active: false,
      })
      .where(eq(branches.id, storeId));

    revalidate("/settings/stores");
    return success(undefined, `${store.name} removed.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Warehouses                                                                 */
/* -------------------------------------------------------------------------- */

export async function saveWarehouse(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.warehouses", {
      feature: "settings.warehouses",
    });

    const id = uuid(form, "id");
    const name = str(form, "name");
    const code = str(form, "code").toUpperCase();

    if (!name) return failure("Warehouse name is required.");
    if (!code) return failure("Warehouse code is required.");

    const clash = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenant_id, ctx.business.id),
          eq(warehouses.code, code),
          id ? ne(warehouses.id, id) : undefined,
        ),
      )
      .limit(1);
    if (clash.length > 0) {
      return failure("That warehouse code is already in use.");
    }

    const values = {
      code,
      name,
      branch_id: uuid(form, "branch_id"),
      address_line1: optionalStr(form, "address_line1"),
      city: optionalStr(form, "city"),
      valuation_method: (str(form, "valuation_method") ||
        "weighted_average") as "fifo" | "lifo" | "weighted_average" | "specific",
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(warehouses)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(
          and(eq(warehouses.id, id), eq(warehouses.tenant_id, ctx.business.id)),
        );
    } else {
      await assertWithinLimit(ctx.business.id, "warehouses", ctx.entitlements);
      await db.insert(warehouses).values({
        tenant_id: ctx.business.id,
        ...values,
        created_by: ctx.user.id,
      });
    }

    await auditEvent(ctx, {
      event: "WarehouseCreated",
      moduleSlug: "settings",
      entityType: "warehouse",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} warehouse ${name}`,
    });

    revalidate("/settings/warehouses", "/inventory");
    return success(undefined, "Warehouse saved.");
  });
}

export async function deleteWarehouse(
  warehouseId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.warehouses", {
      feature: "settings.warehouses",
    });

    const [warehouse] = await db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, warehouseId),
          eq(warehouses.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!warehouse) throw NotFoundError("Warehouse not found.");

    if (warehouse.is_default) {
      throw BusinessRuleError(
        "The default warehouse cannot be deleted.",
        "DEFAULT_WAREHOUSE_PROTECTED",
      );
    }

    const [stock] = await db
      .select({ value: count() })
      .from(inventoryLevels)
      .where(eq(inventoryLevels.warehouse_id, warehouseId));
    if (Number(stock?.value ?? 0) > 0) {
      throw ConflictError(
        "This warehouse still holds stock records. Transfer the stock out first.",
      );
    }

    await db
      .update(warehouses)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        is_active: false,
      })
      .where(eq(warehouses.id, warehouseId));

    revalidate("/settings/warehouses", "/inventory");
    return success(undefined, `${warehouse.name} removed.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Document numbering                                                         */
/* -------------------------------------------------------------------------- */

export async function saveNumberSequence(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings.numbering", {
      feature: "settings.numbering",
    });

    const id = uuid(form, "id");
    if (!id) return failure("Sequence not found.");

    const [before] = await db
      .select()
      .from(numberSequences)
      .where(
        and(
          eq(numberSequences.id, id),
          eq(numberSequences.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!before) throw NotFoundError("Sequence not found.");

    const nextNumberValue = num(form, "next_number", before.next_number);
    // Allocated numbers are never reused, so the counter cannot move backwards.
    if (nextNumberValue < before.next_number) {
      return failure(
        `The next number cannot be lowered below ${before.next_number} — issued numbers are never reused.`,
        { next_number: ["Must not be lower than the current value."] },
      );
    }

    const padding = Math.min(12, Math.max(1, num(form, "padding", 6)));

    const [after] = await db
      .update(numberSequences)
      .set({
        prefix: str(form, "prefix").toUpperCase(),
        suffix: str(form, "suffix").toUpperCase(),
        include_period: bool(form, "include_period"),
        padding,
        next_number: nextNumberValue,
        reset_rule: (str(form, "reset_rule") || "yearly") as
          | "never"
          | "yearly"
          | "monthly"
          | "daily",
        updated_at: new Date(),
      })
      .where(eq(numberSequences.id, id))
      .returning();

    await auditEvent(ctx, {
      event: "NumberSequenceUpdated",
      moduleSlug: "settings",
      entityType: "number_sequence",
      entityId: id,
      summary: `Numbering updated for ${after.document_type}`,
      payload: { changes: diff(before, after) },
    });

    revalidate("/settings/numbering");
    return success(undefined, "Numbering saved.");
  });
}
