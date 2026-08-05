import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import {
  inventoryBatches,
  inventoryLevels,
  products,
  warehouses,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { BusinessRuleError, ValidationError } from "@/lib/authz/errors";
import { postOpeningStock } from "@/lib/services/inventory";

import type { ReferenceMap, SheetSpec } from "../types";

/**
 * Opening stock import — the other half of going live.
 *
 * Loading the catalogue is only useful once the shelves are counted, and a
 * pharmacy counting 3,000 lines needs a spreadsheet, not a form.
 *
 * Critically this posts through `postOpeningStock`, so every row writes a
 * balance **and** its ledger movement in one transaction. Writing
 * `inventory_levels.quantity_available` directly would be faster and would leave
 * the installation permanently unable to explain its own stock figures — the
 * exact drift the integrity check hunts for.
 *
 * `postOpeningStock` refuses a second opening entry for the same product and
 * warehouse, so re-uploading the same file cannot silently double the stock.
 */

async function references(
  client: DbClient,
  businessId: string,
): Promise<Record<string, ReferenceMap>> {
  const [prods, whs] = await Promise.all([
    client
      .select({ id: products.id, sku: products.sku, name: products.name })
      .from(products)
      .where(
        and(eq(products.tenant_id, businessId), isNull(products.deleted_at)),
      ),
    client
      .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name })
      .from(warehouses)
      .where(
        and(eq(warehouses.tenant_id, businessId), isNull(warehouses.deleted_at)),
      ),
  ]);

  /* Products resolve by SKU or name: a count sheet printed from the shelf label
     carries the SKU, one typed by hand carries the name. */
  const productMap: ReferenceMap = new Map();
  for (const p of prods) {
    productMap.set(p.sku.toLowerCase(), p.id);
    productMap.set(p.name.toLowerCase(), p.id);
  }

  const warehouseMap: ReferenceMap = new Map();
  for (const w of whs) {
    warehouseMap.set(w.code.toLowerCase(), w.id);
    warehouseMap.set(w.name.toLowerCase(), w.id);
  }

  return { product: productMap, warehouse: warehouseMap };
}

export const openingStockSpec: SheetSpec = {
  slug: "opening-stock",
  name: "Opening Stock",
  description:
    "Record the quantity and cost of stock already on hand, per product and warehouse. Each product can have opening stock recorded once per warehouse.",
  importPermission: "inventory.opening_stock",
  exportPermission: "inventory.export",
  importFeature: "inventory.stock",
  exportFeature: "inventory.export",

  notes: [
    "Every row writes both the stock balance and the ledger movement that explains it, so the figures always reconcile.",
    "Opening stock can only be recorded once per product per warehouse. Re-uploading the same file will be rejected rather than doubling your stock — use a stock adjustment to correct a figure afterwards.",
    "Product accepts the SKU or the exact product name. Warehouse accepts the code or the name.",
    "Unit cost is what you paid, and it sets the valuation basis. Leave it at 0 only for genuinely free stock, such as samples.",
    "Batch number and expiry are only used for products with batch tracking switched on. They are ignored otherwise.",
  ],

  columns: [
    {
      header: "Product",
      key: "product_id",
      type: "lookup",
      lookup: { name: "product" },
      required: true,
      width: 34,
      help: "SKU or exact name.",
      example: "MED-PARA-500",
    },
    {
      header: "Warehouse",
      key: "warehouse_id",
      type: "lookup",
      lookup: { name: "warehouse" },
      required: true,
      width: 22,
      example: "WH-MUMBAI",
    },
    {
      header: "Quantity",
      key: "quantity",
      type: "quantity",
      required: true,
      width: 13,
      example: 240,
    },
    {
      header: "Unit cost",
      key: "unit_cost",
      type: "money",
      required: true,
      width: 13,
      example: 18.4,
    },
    {
      header: "Batch number",
      key: "batch_number",
      type: "text",
      width: 18,
      help: "Batch-tracked products only.",
      example: "PAR24A117",
    },
    {
      header: "Expiry date",
      key: "expires_on",
      type: "date",
      width: 14,
      help: "YYYY-MM-DD. Batch-tracked products only.",
      example: "2027-06-30",
    },
  ],

  loadReferences: (ctx, client) => references(client, ctx.business.id),

  async importRow(row, { ctx, client }) {
    if (!ctx.activeStore) {
      throw BusinessRuleError("No store selected.", "NO_STORE");
    }

    const productId = row.product_id as string;
    const warehouseId = row.warehouse_id as string;
    const quantity = Number(row.quantity ?? 0);

    if (quantity <= 0) {
      throw ValidationError(
        "Quantity must be greater than zero. Remove the row rather than entering 0 — a zero opening balance is the same as no opening balance, but recording it blocks a real one later.",
      );
    }

    const [product] = await client
      .select({
        sku: products.sku,
        name: products.name,
        tracksInventory: products.track_inventory,
        tracksBatches: products.track_batches,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (!product) throw ValidationError("Product not found.");

    if (!product.tracksInventory) {
      throw ValidationError(
        `${product.sku} does not track inventory, so it cannot hold stock. Switch on "Track inventory" for it first, or remove the row.`,
      );
    }

    /* A batch-tracked product without a batch number would produce stock that
       the expiry report can never see — worse than refusing the row. */
    let batchId: string | null = null;
    const batchNumber = String(row.batch_number ?? "").trim();

    if (product.tracksBatches) {
      if (!batchNumber) {
        throw ValidationError(
          `${product.sku} is batch-tracked, so Batch number is required. Without it the stock would be invisible to the expiry report.`,
        );
      }

      const expiresOn = row.expires_on instanceof Date ? row.expires_on : null;

      const [batch] = await client
        .insert(inventoryBatches)
        .values({
          tenant_id: ctx.business.id,
          product_id: productId,
          batch_number: batchNumber,
          expires_on: expiresOn,
          unit_cost: String(row.unit_cost ?? 0),
        })
        .onConflictDoUpdate({
          target: [
            inventoryBatches.tenant_id,
            inventoryBatches.product_id,
            inventoryBatches.batch_number,
          ],
          set: { expires_on: expiresOn, updated_at: new Date() },
        })
        .returning({ id: inventoryBatches.id });

      batchId = batch.id;
    }

    await postOpeningStock(
      client,
      {
        businessId: ctx.business.id,
        userId: ctx.user.id,
        allowNegative: false,
      },
      {
        productId,
        storeId: ctx.activeStore.id,
        warehouseId,
        quantity: String(quantity),
        unitCost: String(row.unit_cost ?? 0),
        batchId,
      },
    );

    return {
      label: `${product.sku} — ${quantity}${batchNumber ? ` (batch ${batchNumber})` : ""}`,
      action: "created",
    };
  },

  async exportRows(ctx: BusinessContext) {
    /* Exports the *current* on-hand position rather than the historic opening
       figures, because that is what an operator reconciling a shelf count wants
       to compare against. */
    const rows = await db
      .select({
        product_id: products.sku,
        warehouse_id: warehouses.code,
        quantity: inventoryLevels.quantity_available,
        unit_cost: inventoryLevels.average_cost,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(products.id, inventoryLevels.product_id))
      .innerJoin(warehouses, eq(warehouses.id, inventoryLevels.warehouse_id))
      .where(eq(inventoryLevels.tenant_id, ctx.business.id))
      .orderBy(products.name);

    return rows.map((r) => ({ ...r, batch_number: null, expires_on: null }));
  },
};
