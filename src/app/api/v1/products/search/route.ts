import { type NextRequest } from "next/server";
import { and, asc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  inventoryLevels,
  products,
  taxGroups,
  units,
} from "@/db/schema";
import { failFrom, ok } from "@/lib/api/response";
import { requirePermission } from "@/lib/authz/guard";

/**
 * Product lookup used by every line-item editor and the POS keypad.
 *
 * An exact barcode match is returned first and flagged, so a scanner can add a
 * line immediately without the operator choosing from a list.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("products.view", { onDenied: "throw" });

    const params = request.nextUrl.searchParams;
    const term = (params.get("q") ?? "").trim();
    const warehouseId = params.get("warehouse");
    const limit = Math.min(25, Number(params.get("limit") ?? 12) || 12);
    const sellableOnly = params.get("sellable") === "1";

    const filters = [
      eq(products.tenant_id, ctx.business.id),
      isNull(products.deleted_at),
    ];

    if (sellableOnly) {
      // Archived, inactive and discontinued products cannot be sold.
      filters.push(eq(products.status, "active"));
    } else {
      filters.push(sql`${products.status} <> 'archived'`);
    }

    if (term) {
      const like = `%${term}%`;
      filters.push(
        or(
          ilike(products.name, like),
          ilike(products.sku, like),
          ilike(products.barcode, like),
        )!,
      );
    }

    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        barcode: products.barcode,
        sellingPrice: products.selling_price,
        wholesalePrice: products.wholesale_price,
        discountPrice: products.discount_price,
        discountStartsAt: products.discount_starts_at,
        discountEndsAt: products.discount_ends_at,
        costPrice: products.cost_price,
        trackInventory: products.track_inventory,
        unitShort: units.short_name,
        allowDecimal: units.allow_decimal,
        taxGroupId: products.tax_group_id,
        taxRate: taxGroups.rate,
        taxMode: taxGroups.mode,
        available: warehouseId
          ? sql<string>`coalesce(${inventoryLevels.quantity_available}, 0)`
          : sql<string>`null`,
        averageCost: warehouseId
          ? sql<string>`coalesce(${inventoryLevels.average_cost}, ${products.cost_price})`
          : sql<string>`${products.cost_price}`,
      })
      .from(products)
      .leftJoin(units, eq(units.id, products.unit_id))
      .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id))
      .leftJoin(
        inventoryLevels,
        warehouseId
          ? and(
              eq(inventoryLevels.product_id, products.id),
              eq(inventoryLevels.warehouse_id, warehouseId),
            )
          : sql`false`,
      )
      .where(and(...filters))
      .orderBy(asc(products.name))
      .limit(limit);

    const exactBarcode =
      term.length > 5
        ? (rows.find((r) => r.barcode === term) ??
          rows.find((r) => r.sku.toLowerCase() === term.toLowerCase()) ??
          null)
        : null;

    return ok(
      rows.map((row) => ({
        ...row,
        available: row.available === null ? null : String(row.available),
        taxRate: row.taxRate ? String(row.taxRate) : "0",
        unitShort: row.unitShort ?? "",
      })),
      {
        meta: {
          exactMatchId: exactBarcode?.id ?? null,
          count: rows.length,
        },
      },
    );
  } catch (error) {
    return failFrom(error);
  }
}
