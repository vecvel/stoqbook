import "server-only";

import { cache } from "react";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import { settingHistory, settings } from "@/db/schema";
import { SETTING_BY_KEY, SETTING_DEFAULTS } from "@/lib/registry";

/**
 * Settings resolution follows the scope hierarchy: business -> store ->
 * warehouse -> user. The most specific value present wins; registry defaults
 * back-stop everything (17-settings.md § Settings Hierarchy).
 *
 * The `branch` scope value and `branch_id` column name identify a store — the
 * database keeps the structural names, everything above it says "store".
 */

export interface SettingScopeRef {
  businessId: string;
  storeId?: string | null;
  warehouseId?: string | null;
  userId?: string | null;
}

/** Specificity ranking — higher wins. */
const SCOPE_RANK: Record<string, number> = {
  business: 0,
  branch: 1,
  warehouse: 2,
  user: 3,
};

export type SettingsBag = Record<string, unknown>;

/**
 * Loads the effective setting map for a scope. Cached per request so multiple
 * consumers in one render share a single query.
 */
export const loadSettings = cache(
  async (ref: SettingScopeRef): Promise<SettingsBag> => {
    const rows = await db
      .select()
      .from(settings)
      .where(
        and(
          or(isNull(settings.tenant_id), eq(settings.tenant_id, ref.businessId)),
          // Only rows matching this scope chain are relevant.
          or(
            isNull(settings.branch_id),
            ref.storeId ? eq(settings.branch_id, ref.storeId) : isNull(settings.branch_id),
          ),
          or(
            isNull(settings.warehouse_id),
            ref.warehouseId
              ? eq(settings.warehouse_id, ref.warehouseId)
              : isNull(settings.warehouse_id),
          ),
          or(
            isNull(settings.user_id),
            ref.userId ? eq(settings.user_id, ref.userId) : isNull(settings.user_id),
          ),
        ),
      );

    const bag: SettingsBag = { ...SETTING_DEFAULTS };
    const rank: Record<string, number> = {};

    for (const row of rows) {
      const r = SCOPE_RANK[row.scope] ?? 0;
      if (rank[row.key] !== undefined && rank[row.key] > r) continue;
      rank[row.key] = r;
      bag[row.key] = row.value;
    }

    return bag;
  },
);

/** Typed single-value read with registry default fallback. */
export function readSetting<T>(bag: SettingsBag, key: string, fallback?: T): T {
  const value = bag[key];
  if (value === undefined || value === null) {
    return (fallback ?? (SETTING_DEFAULTS[key] as T)) as T;
  }
  return value as T;
}

export function readBoolean(bag: SettingsBag, key: string): boolean {
  return Boolean(readSetting(bag, key, false));
}

export function readNumber(bag: SettingsBag, key: string, fallback = 0): number {
  const v = readSetting<unknown>(bag, key, fallback);
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readString(bag: SettingsBag, key: string, fallback = ""): string {
  const v = readSetting<unknown>(bag, key, fallback);
  return v === null || v === undefined ? fallback : String(v);
}

/**
 * Writes a setting at the scope declared in the registry, recording the previous
 * value in setting_history so configuration changes remain auditable.
 */
export async function writeSetting(
  ref: SettingScopeRef,
  key: string,
  value: unknown,
  options: { actorId?: string; client?: DbClient } = {},
): Promise<void> {
  const client = options.client ?? db;
  const def = SETTING_BY_KEY[key];
  const scope = def?.scope ?? "business";

  const storeId = scope === "branch" ? (ref.storeId ?? null) : null;
  const warehouseId = scope === "warehouse" ? (ref.warehouseId ?? null) : null;
  const userId = scope === "user" ? (ref.userId ?? null) : null;

  const [existing] = await client
    .select()
    .from(settings)
    .where(
      and(
        eq(settings.scope, scope),
        eq(settings.tenant_id, ref.businessId),
        storeId ? eq(settings.branch_id, storeId) : isNull(settings.branch_id),
        warehouseId
          ? eq(settings.warehouse_id, warehouseId)
          : isNull(settings.warehouse_id),
        userId ? eq(settings.user_id, userId) : isNull(settings.user_id),
        eq(settings.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    await client
      .update(settings)
      .set({ value, updated_at: new Date(), updated_by: options.actorId ?? null })
      .where(eq(settings.id, existing.id));
  } else {
    await client.insert(settings).values({
      scope,
      tenant_id: ref.businessId,
      branch_id: storeId,
      warehouse_id: warehouseId,
      user_id: userId,
      module_slug: def?.moduleSlug ?? null,
      key,
      value,
      created_by: options.actorId ?? null,
    });
  }

  await client.insert(settingHistory).values({
    setting_id: existing?.id ?? null,
    tenant_id: ref.businessId,
    key,
    previous_value: existing?.value ?? null,
    new_value: value,
    changed_by: options.actorId ?? null,
  });
}

export async function writeSettings(
  ref: SettingScopeRef,
  values: Record<string, unknown>,
  options: { actorId?: string; client?: DbClient } = {},
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await writeSetting(ref, key, value, options);
  }
}

/** Seeds business-scope defaults so the settings page renders real rows. */
export async function provisionSettings(
  businessId: string,
  keys: string[],
  client: DbClient = db,
): Promise<void> {
  const rows = keys
    .map((key) => ({ key, def: SETTING_BY_KEY[key] }))
    .filter((r) => r.def && r.def.scope === "business")
    .map((r) => ({
      scope: "business" as const,
      tenant_id: businessId,
      key: r.key,
      module_slug: r.def!.moduleSlug,
      value: r.def!.default,
    }));

  if (rows.length === 0) return;
  await client.insert(settings).values(rows).onConflictDoNothing();
}

/** Removes settings belonging to modules the business no longer has. */
export async function pruneModuleSettings(
  businessId: string,
  removedModuleSlugs: string[],
  client: DbClient = db,
): Promise<void> {
  if (removedModuleSlugs.length === 0) return;
  await client
    .delete(settings)
    .where(
      and(
        eq(settings.tenant_id, businessId),
        inArray(settings.module_slug, removedModuleSlugs),
      ),
    );
}
