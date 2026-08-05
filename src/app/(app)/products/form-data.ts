import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { brands, categories, taxGroups, units } from "@/db/schema";

/** Reference options shared by the create and edit product screens. */
export async function loadProductFormOptions(businessId: string) {
  const [categoryRows, brandRows, unitRows, taxRows] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        depth: categories.depth,
        path: categories.path,
      })
      .from(categories)
      .where(
        and(
          eq(categories.tenant_id, businessId),
          eq(categories.is_active, true),
          isNull(categories.deleted_at),
        ),
      )
      .orderBy(asc(categories.path)),

    db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(
        and(
          eq(brands.tenant_id, businessId),
          eq(brands.is_active, true),
          isNull(brands.deleted_at),
        ),
      )
      .orderBy(asc(brands.name)),

    db
      .select({ id: units.id, name: units.name, short: units.short_name })
      .from(units)
      .where(and(eq(units.tenant_id, businessId), eq(units.is_active, true)))
      .orderBy(asc(units.name)),

    db
      .select({ id: taxGroups.id, name: taxGroups.name, rate: taxGroups.rate })
      .from(taxGroups)
      .where(
        and(eq(taxGroups.tenant_id, businessId), eq(taxGroups.is_active, true)),
      )
      .orderBy(asc(taxGroups.rate)),
  ]);

  return {
    // Indent nested categories so the hierarchy is readable in a flat select.
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: `${"— ".repeat(c.depth)}${c.name}`,
    })),
    brands: brandRows,
    units: unitRows.map((u) => ({ id: u.id, name: `${u.name} (${u.short})` })),
    taxGroups: taxRows.map((t) => ({
      id: t.id,
      name: t.name,
      rate: String(t.rate),
    })),
  };
}
