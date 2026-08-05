import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import { brands, categories, products, taxGroups, units } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { ValidationError } from "@/lib/authz/errors";
import { nextNumber } from "@/lib/services/numbering";
import { loadSettings, readBoolean, readString } from "@/lib/services/settings";

import type { ReferenceMap, SheetSpec } from "../types";

/**
 * Products import/export.
 *
 * The single most valuable bulk operation in the product: a pharmacy switching
 * to StoqBook has thousands of lines to load, and typing them one at a time is
 * not a migration path.
 *
 * Matching is by SKU. A row whose SKU already exists updates that product rather
 * than failing, which is what makes the same template usable for a price
 * revision — the common repeat use after the initial load.
 */

async function referenceMap(
  client: DbClient,
  businessId: string,
): Promise<Record<string, ReferenceMap>> {
  const [cats, brs, uns, taxes] = await Promise.all([
    client
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.tenant_id, businessId)),
    client
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(eq(brands.tenant_id, businessId)),
    client
      .select({ id: units.id, name: units.name, short: units.short_name })
      .from(units)
      .where(eq(units.tenant_id, businessId)),
    client
      .select({ id: taxGroups.id, name: taxGroups.name })
      .from(taxGroups)
      .where(eq(taxGroups.tenant_id, businessId)),
  ]);

  const toMap = (rows: { id: string; name: string }[]) =>
    new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));

  /* Units are matched on either the full name or the short form, because a
     spreadsheet says "pcs" far more often than "Pieces". */
  const unitMap: ReferenceMap = new Map();
  for (const u of uns) {
    unitMap.set(u.name.toLowerCase(), u.id);
    if (u.short) unitMap.set(u.short.toLowerCase(), u.id);
  }

  return {
    category: toMap(cats),
    brand: toMap(brs),
    unit: unitMap,
    taxGroup: toMap(taxes),
  };
}

export const productsSpec: SheetSpec = {
  slug: "products",
  name: "Products",
  description:
    "Load or update the catalogue in bulk. Rows are matched on SKU: a new SKU creates a product, an existing one updates it.",
  importPermission: "products.import",
  exportPermission: "products.export",
  importFeature: "products.bulk_import",
  exportFeature: "products.bulk_export",

  notes: [
    "Leave SKU blank to have one generated from the numbering sequence.",
    "Category, Brand, Unit and Tax group must already exist — the importer will not invent them, because a typo would become a permanent catalogue entry. Create them first if a value is rejected.",
    "Prices are plain numbers. Currency symbols and thousands separators are tolerated but not required.",
    "Barcodes are stored as text, so leading zeros survive. Format the column as Text in Excel if it strips them before saving.",
  ],

  columns: [
    {
      header: "SKU",
      key: "sku",
      type: "text",
      width: 18,
      help: "Unique per business. Blank generates one.",
      example: "MED-PARA-500",
    },
    {
      header: "Name",
      key: "name",
      type: "text",
      required: true,
      width: 36,
      example: "Paracetamol 500mg Tablet",
    },
    {
      header: "Barcode",
      key: "barcode",
      type: "text",
      width: 18,
      help: "Scanned at the till. Stored as text.",
      example: "8901234567890",
    },
    {
      header: "Category",
      key: "category_id",
      type: "lookup",
      lookup: { name: "category" },
      width: 22,
      example: "Analgesics",
    },
    {
      header: "Brand",
      key: "brand_id",
      type: "lookup",
      lookup: { name: "brand" },
      width: 20,
      example: "Medico",
    },
    {
      header: "Unit",
      key: "unit_id",
      type: "lookup",
      lookup: { name: "unit" },
      width: 14,
      help: "Full name or short form, e.g. Pieces or pcs.",
      example: "Strip",
    },
    {
      header: "Tax group",
      key: "tax_group_id",
      type: "lookup",
      lookup: { name: "taxGroup" },
      width: 18,
      example: "GST 12%",
    },
    {
      header: "Cost price",
      key: "cost_price",
      type: "money",
      width: 14,
      example: 18.4,
    },
    {
      header: "Selling price",
      key: "selling_price",
      type: "money",
      required: true,
      width: 14,
      example: 24.5,
    },
    {
      header: "Wholesale price",
      key: "wholesale_price",
      type: "money",
      width: 16,
      example: 21,
    },
    {
      header: "Status",
      key: "status",
      type: "enum",
      options: ["active", "inactive", "discontinued"],
      width: 14,
      example: "active",
    },
    {
      header: "Track inventory",
      key: "track_inventory",
      type: "boolean",
      width: 16,
      help: "No for services and non-stock items.",
      example: "Yes",
    },
    {
      header: "Track batches",
      key: "track_batches",
      type: "boolean",
      width: 15,
      help: "Yes for anything with a batch number and expiry date.",
      example: "Yes",
    },
    {
      header: "Reorder level",
      key: "reorder_level",
      type: "quantity",
      width: 15,
      help: "Raises a low-stock alert at or below this quantity.",
      example: 40,
    },
    {
      header: "Min stock",
      key: "min_stock",
      type: "quantity",
      width: 12,
      example: 20,
    },
    {
      header: "Max stock",
      key: "max_stock",
      type: "quantity",
      width: 12,
      example: 400,
    },
    {
      header: "Description",
      key: "description",
      type: "text",
      width: 44,
      example: "Fever and mild pain relief. 10 tablets per strip.",
    },
  ],

  loadReferences: (ctx, client) => referenceMap(client, ctx.business.id),

  async importRow(row, { ctx, client }) {
    const name = String(row.name ?? "").trim();
    if (!name) throw ValidationError("Name is required.");

    const selling = Number(row.selling_price ?? 0);
    const cost = Number(row.cost_price ?? 0);

    /* A selling price below cost is usually a column shifted by one, not a
       deliberate loss leader. Rejecting it here catches the mistake while the
       operator still has the file open. */
    if (cost > 0 && selling > 0 && selling < cost) {
      throw ValidationError(
        `"${name}": selling price ${selling} is below cost ${cost}. Check the columns are not shifted.`,
      );
    }

    /* SKU generation follows the same settings the product form does —
       `products.auto_generate_sku` and the configured prefix — so a product
       created by import is indistinguishable from one typed in. */
    let sku = String(row.sku ?? "").trim();
    if (!sku) {
      const settings = await loadSettings({ businessId: ctx.business.id });
      if (!readBoolean(settings, "products.auto_generate_sku")) {
        throw ValidationError(
          `"${name}": SKU is required, because automatic SKU generation is switched off in Settings.`,
        );
      }
      const prefix = readString(settings, "products.sku_prefix", "SKU");
      sku = (await nextNumber(ctx.business.id, "product", { client })).replace(
        /^[A-Z]+/,
        prefix,
      );
    }

    const barcode = String(row.barcode ?? "").trim() || null;
    if (barcode) {
      const settings = await loadSettings({ businessId: ctx.business.id });
      if (readBoolean(settings, "products.barcode_unique")) {
        const [clash] = await client
          .select({ id: products.id, sku: products.sku })
          .from(products)
          .where(
            and(
              eq(products.tenant_id, ctx.business.id),
              eq(products.barcode, barcode),
              isNull(products.deleted_at),
            ),
          )
          .limit(1);
        // A row updating itself is not a clash.
        if (clash && clash.sku !== sku) {
          throw ValidationError(
            `Barcode ${barcode} is already used by ${clash.sku}.`,
          );
        }
      }
    }

    const values = {
      name,
      barcode,
      description: String(row.description ?? "").trim() || null,
      category_id: (row.category_id as string) ?? null,
      brand_id: (row.brand_id as string) ?? null,
      unit_id: (row.unit_id as string) ?? null,
      tax_group_id: (row.tax_group_id as string) ?? null,
      cost_price: String(cost),
      selling_price: String(selling),
      wholesale_price:
        row.wholesale_price === null || row.wholesale_price === undefined
          ? null
          : String(row.wholesale_price),
      status: (row.status as "active" | "inactive" | "discontinued") ?? "active",
      track_inventory: row.track_inventory === null ? true : Boolean(row.track_inventory),
      track_batches: Boolean(row.track_batches),
      reorder_level: String(row.reorder_level ?? 0),
      min_stock: String(row.min_stock ?? 0),
      max_stock:
        row.max_stock === null || row.max_stock === undefined
          ? null
          : String(row.max_stock),
      updated_by: ctx.user.id,
    };

    const [existing] = await client
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.tenant_id, ctx.business.id),
          eq(products.sku, sku),
          isNull(products.deleted_at),
        ),
      )
      .limit(1);

    if (existing) {
      await client
        .update(products)
        .set({ ...values, updated_at: new Date() })
        .where(eq(products.id, existing.id));
      return { label: `${sku} — ${name}`, action: "updated" };
    }

    await client.insert(products).values({
      ...values,
      tenant_id: ctx.business.id,
      sku,
      created_by: ctx.user.id,
    });

    return { label: `${sku} — ${name}`, action: "created" };
  },

  async exportRows(ctx) {
    /* Cost price is withheld without `products.view_cost`, matching the CSV
       export and the product screen. An export must not become the way to read a
       column the UI hides. */
    const showCost = hasPermission(ctx, "products.view_cost");

    const rows = await db
      .select({
        sku: products.sku,
        name: products.name,
        barcode: products.barcode,
        category_id: categories.name,
        brand_id: brands.name,
        unit_id: units.short_name,
        tax_group_id: taxGroups.name,
        cost_price: products.cost_price,
        selling_price: products.selling_price,
        wholesale_price: products.wholesale_price,
        status: products.status,
        track_inventory: products.track_inventory,
        track_batches: products.track_batches,
        reorder_level: products.reorder_level,
        min_stock: products.min_stock,
        max_stock: products.max_stock,
        description: products.description,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.category_id))
      .leftJoin(brands, eq(brands.id, products.brand_id))
      .leftJoin(units, eq(units.id, products.unit_id))
      .leftJoin(taxGroups, eq(taxGroups.id, products.tax_group_id))
      .where(
        and(eq(products.tenant_id, ctx.business.id), isNull(products.deleted_at)),
      )
      .orderBy(products.name);

    return rows.map((r) => ({ ...r, cost_price: showCost ? r.cost_price : null }));
  },
};
