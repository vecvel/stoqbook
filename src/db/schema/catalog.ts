/**
 * Product catalogue — categories, brands, units, taxes, products and variants.
 * Products never store stock; inventory lives in the ledger (07-products.md).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";

import {
  actorColumns,
  money,
  pk,
  productStatusEnum,
  productTypeEnum,
  qty,
  rate,
  softDelete,
  taxModeEnum,
  timestamps,
} from "./_shared";
import { tenants } from "./admin";
import { branches } from "./organization";

/* ------------------------------------------------------------------------- */
/* Categories — unlimited nesting                                            */
/* ------------------------------------------------------------------------- */

export const categories = pgTable(
  "categories",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parent_id: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    image_url: text("image_url"),
    /** Materialised path for cheap subtree queries, e.g. "electronics/mobile". */
    path: text("path").notNull().default(""),
    depth: integer("depth").notNull().default(0),
    sort_order: integer("sort_order").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("categories_tenant_slug_key").on(t.tenant_id, t.slug),
    index("categories_tenant_parent_idx").on(t.tenant_id, t.parent_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Brands                                                                    */
/* ------------------------------------------------------------------------- */

export const brands = pgTable(
  "brands",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    logo_url: text("logo_url"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [uniqueIndex("brands_tenant_slug_key").on(t.tenant_id, t.slug)],
);

/* ------------------------------------------------------------------------- */
/* Units of measure                                                          */
/* ------------------------------------------------------------------------- */

export const units = pgTable(
  "units",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    short_name: text("short_name").notNull(),
    /** Whole units only (piece, box) vs divisible (kg, litre). */
    allow_decimal: boolean("allow_decimal").notNull().default(false),
    /** Optional conversion to a base unit, e.g. 1 box = 12 piece. */
    base_unit_id: uuid("base_unit_id").references((): AnyPgColumn => units.id, {
      onDelete: "set null",
    }),
    conversion_factor: qty("conversion_factor").notNull().default("1"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("units_tenant_short_key").on(t.tenant_id, t.short_name),
  ],
);

/* ------------------------------------------------------------------------- */
/* Tax groups                                                                */
/* ------------------------------------------------------------------------- */

export const taxGroups = pgTable(
  "tax_groups",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Total effective rate. Components (CGST/SGST) live in `components`. */
    rate: rate("rate").notNull().default("0"),
    mode: taxModeEnum("mode").notNull().default("exclusive"),
    components: jsonb("components")
      .$type<{ name: string; rate: number }[]>()
      .notNull()
      .default([]),
    is_default: boolean("is_default").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("tax_groups_tenant_name_key").on(t.tenant_id, t.name)],
);

/* ------------------------------------------------------------------------- */
/* Products                                                                  */
/* ------------------------------------------------------------------------- */

export const products = pgTable(
  "products",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    sku: text("sku").notNull(),
    barcode: text("barcode"),
    qr_code: text("qr_code"),
    name: text("name").notNull(),
    description: text("description"),

    type: productTypeEnum("type").notNull().default("physical"),
    status: productStatusEnum("status").notNull().default("active"),

    category_id: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    brand_id: uuid("brand_id").references(() => brands.id, {
      onDelete: "set null",
    }),
    unit_id: uuid("unit_id").references(() => units.id, {
      onDelete: "set null",
    }),
    tax_group_id: uuid("tax_group_id").references(() => taxGroups.id, {
      onDelete: "set null",
    }),

    cost_price: money("cost_price").notNull().default("0"),
    selling_price: money("selling_price").notNull().default("0"),
    wholesale_price: money("wholesale_price"),
    discount_price: money("discount_price"),
    discount_starts_at: timestamp("discount_starts_at", { withTimezone: true }),
    discount_ends_at: timestamp("discount_ends_at", { withTimezone: true }),

    track_inventory: boolean("track_inventory").notNull().default(true),
    /** Serial/batch controls (batch tracking wired through inventory_batches). */
    track_batches: boolean("track_batches").notNull().default(false),
    reorder_level: qty("reorder_level").notNull().default("0"),
    min_stock: qty("min_stock").notNull().default("0"),
    max_stock: qty("max_stock"),
    reorder_quantity: qty("reorder_quantity"),

    primary_image_url: text("primary_image_url"),
    /** Denormalised gallery; ordered. */
    images: jsonb("images").$type<string[]>().notNull().default([]),

    /** Parent for variant products. */
    parent_id: uuid("parent_id").references((): AnyPgColumn => products.id, {
      onDelete: "cascade",
    }),
    /** e.g. { "Size": "L", "Colour": "Blue" } */
    variant_attributes: jsonb("variant_attributes")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("products_tenant_sku_key").on(t.tenant_id, t.sku),
    index("products_tenant_barcode_idx").on(t.tenant_id, t.barcode),
    index("products_tenant_status_idx").on(t.tenant_id, t.status),
    index("products_tenant_category_idx").on(t.tenant_id, t.category_id),
    index("products_tenant_name_idx").on(t.tenant_id, t.name),
    index("products_parent_idx").on(t.parent_id),
  ],
);

/** Variant option definitions per parent product, e.g. Size → [S,M,L]. */
export const productOptions = pgTable(
  "product_options",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    values: jsonb("values").$type<string[]>().notNull().default([]),
    sort_order: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("product_options_product_idx").on(t.product_id)],
);

/** Branch-level price overrides — used when a branch deviates from base price. */
export const productStorePrices = pgTable(
  "product_branch_prices",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    selling_price: money("selling_price").notNull(),
    wholesale_price: money("wholesale_price"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("product_branch_prices_key").on(t.product_id, t.branch_id),
  ],
);
