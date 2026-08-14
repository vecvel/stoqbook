import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { warehouses } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";

export interface WarehouseOption {
  id: string;
  name: string;
  code: string;
  storeId: string | null;
  sortOrder: number;
}

/**
 * Warehouses the user may operate in.
 *
 * Multi-warehouse is a licensed feature; without it a tenant is limited to the
 * single default warehouse regardless of how many rows exist.
 */
export async function scopedWarehouses(
  ctx: BusinessContext,
): Promise<WarehouseOption[]> {
  const storeIds = new Set(ctx.stores.map((b) => b.id));

  const rows = await db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      code: warehouses.code,
      storeId: warehouses.store_id,
      sortOrder: warehouses.sort_order,
    })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenant_id, ctx.business.id),
        eq(warehouses.is_active, true),
        isNull(warehouses.deleted_at),
      ),
    )
    .orderBy(asc(warehouses.sort_order), asc(warehouses.name));

  // A warehouse with no store is tenant-wide and always visible.
  const visible = rows.filter(
    (w) => !w.storeId || storeIds.has(w.storeId),
  );

  if (!ctx.entitlements.features.has("inventory.multi_warehouse")) {
    const primary = visible[0];
    return primary ? [primary] : [];
  }

  return visible;
}

/** Resolves the warehouse to use, honouring a query parameter when valid. */
export function resolveWarehouse(
  options: WarehouseOption[],
  requested: string | undefined,
): WarehouseOption | null {
  if (requested) {
    const match = options.find((w) => w.id === requested);
    if (match) return match;
  }
  return options[0] ?? null;
}
