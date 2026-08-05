import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  brands,
  categories,
  products,
  taxGroups,
  units,
} from "@/db/schema";
import { failFrom } from "@/lib/api/response";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { auditEvent } from "@/lib/services/audit";

/** GET /api/v1/products/export — CSV of the product catalogue. */
export async function GET() {
  try {
    const ctx = await requirePermission("products.export", { onDenied: "throw",
      feature: "products.bulk_export",
    });

    // Cost price is withheld unless the caller may see it.
    const includeCost = hasPermission(ctx, "products.view_cost");

    const rows = await db
      .select({
        sku: products.sku,
        barcode: products.barcode,
        name: products.name,
        description: products.description,
        category: categories.name,
        brand: brands.name,
        unit: units.short_name,
        tax_group: taxGroups.name,
        tax_rate: taxGroups.rate,
        cost_price: products.cost_price,
        selling_price: products.selling_price,
        wholesale_price: products.wholesale_price,
        min_stock: products.min_stock,
        max_stock: products.max_stock,
        track_inventory: products.track_inventory,
        status: products.status,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.category_id))
      .leftJoin(brands, eq(brands.id, products.brand_id))
      .leftJoin(units, eq(units.id, products.unit_id))
      .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id))
      .where(
        and(
          eq(products.tenant_id, ctx.business.id),
          isNull(products.deleted_at),
        ),
      )
      .orderBy(asc(products.name));

    const headers = [
      "sku",
      "barcode",
      "name",
      "description",
      "category",
      "brand",
      "unit",
      "tax_group",
      "tax_rate",
      ...(includeCost ? ["cost_price"] : []),
      "selling_price",
      "wholesale_price",
      "min_stock",
      "max_stock",
      "track_inventory",
      "status",
    ];

    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => escape((row as Record<string, unknown>)[header]))
          .join(","),
      ),
    ].join("\n");

    await auditEvent(ctx, {
      event: "ProductsExported",
      moduleSlug: "products",
      summary: `Exported ${rows.length} products to CSV`,
      payload: { row_count: rows.length, include_cost: includeCost },
    });

    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="products-${new Date()
          .toISOString()
          .slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return failFrom(error);
  }
}
