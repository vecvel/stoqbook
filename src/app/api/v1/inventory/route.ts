import { type NextRequest } from "next/server";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { inventoryLevels, products, units, warehouses } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { failFrom, ok, paginationMeta } from "@/lib/api/response";
import { requirePermission } from "@/lib/authz/guard";

/**
 * GET /api/v1/inventory — current stock across warehouses.
 *
 * Joined rather than generic because the useful shape spans three tables.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("inventory.view", { onDenied: "throw" });
    const query = parseListQuery(request.nextUrl.searchParams, {
      defaultLimit: 50,
    });

    const conditions = [
      eq(inventoryLevels.tenant_id, ctx.business.id),
      isNull(products.deleted_at),
    ];

    if (query.filters.warehouse) {
      conditions.push(eq(inventoryLevels.warehouse_id, query.filters.warehouse));
    }
    if (query.filters.store) {
      conditions.push(eq(inventoryLevels.store_id, query.filters.store));
    }
    if (query.filters.product) {
      conditions.push(eq(inventoryLevels.product_id, query.filters.product));
    }
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        or(
          ilike(products.name, term),
          ilike(products.sku, term),
          ilike(products.barcode, term),
        )!,
      );
    }
    if (query.filters.stock === "low") {
      conditions.push(sql`${products.min_stock} > 0`);
      conditions.push(
        sql`${inventoryLevels.quantity_available} <= ${products.min_stock}`,
      );
    } else if (query.filters.stock === "out") {
      conditions.push(sql`${inventoryLevels.quantity_available} <= 0`);
    }

    const where = and(...conditions);

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          product_id: products.id,
          sku: products.sku,
          name: products.name,
          barcode: products.barcode,
          unit: units.short_name,
          warehouse_id: inventoryLevels.warehouse_id,
          warehouse: warehouses.name,
          store_id: inventoryLevels.store_id,
          quantity_available: inventoryLevels.quantity_available,
          quantity_reserved: inventoryLevels.quantity_reserved,
          quantity_damaged: inventoryLevels.quantity_damaged,
          quantity_in_transit: inventoryLevels.quantity_in_transit,
          average_cost: inventoryLevels.average_cost,
          min_stock: products.min_stock,
          last_movement_at: inventoryLevels.last_movement_at,
        })
        .from(inventoryLevels)
        .innerJoin(products, eq(products.id, inventoryLevels.product_id))
        .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouse_id))
        .leftJoin(units, eq(units.id, products.unit_id))
        .where(where)
        .orderBy(asc(products.name))
        .limit(query.limit)
        .offset(query.offset),

      db
        .select({ value: count() })
        .from(inventoryLevels)
        .innerJoin(products, eq(products.id, inventoryLevels.product_id))
        .where(where),
    ]);

    const total = Number(totalRow[0]?.value ?? 0);

    return ok(rows, {
      message: `${total} stock record(s).`,
      meta: paginationMeta(query.page, query.limit, total),
    });
  } catch (error) {
    return failFrom(error);
  }
}
