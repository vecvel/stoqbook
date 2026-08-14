/**
 * Inventory — ledger driven.
 *
 * `inventory_movements` is the authoritative, append-only record. Stock is never
 * edited directly; `inventory_levels` is an optimised balance kept in sync with
 * the ledger inside the same transaction (08-inventory.md).
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorColumns,
  adjustmentReasonEnum,
  approvalStatusEnum,
  countStatusEnum,
  money,
  movementTypeEnum,
  pk,
  qty,
  stockStateEnum,
  timestamps,
  transferStatusEnum,
} from "./_shared";
import { tenants } from "./admin";
import { stores, users, warehouses } from "./organization";
import { products } from "./catalog";

/* ------------------------------------------------------------------------- */
/* Batches                                                                   */
/* ------------------------------------------------------------------------- */

export const inventoryBatches = pgTable(
  "inventory_batches",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    batch_number: text("batch_number").notNull(),
    manufactured_on: timestamp("manufactured_on", { withTimezone: false }),
    expires_on: timestamp("expires_on", { withTimezone: false }),
    /** Landed unit cost for this batch — drives FIFO/LIFO valuation. */
    unit_cost: money("unit_cost").notNull().default("0"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("inventory_batches_key").on(
      t.tenant_id,
      t.product_id,
      t.batch_number,
    ),
    index("inventory_batches_expiry_idx").on(t.tenant_id, t.expires_on),
  ],
);

/* ------------------------------------------------------------------------- */
/* Current stock (derived balance)                                           */
/* ------------------------------------------------------------------------- */

export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),

    /** Sellable quantity. */
    quantity_available: qty("quantity_available").notNull().default("0"),
    /** Allocated to orders/transfers — not sellable. */
    quantity_reserved: qty("quantity_reserved").notNull().default("0"),
    quantity_damaged: qty("quantity_damaged").notNull().default("0"),
    quantity_expired: qty("quantity_expired").notNull().default("0"),
    quantity_in_transit: qty("quantity_in_transit").notNull().default("0"),
    quantity_pending_inspection: qty("quantity_pending_inspection")
      .notNull()
      .default("0"),

    /** Rolling weighted-average cost for this stock location. */
    average_cost: money("average_cost").notNull().default("0"),
    last_movement_at: timestamp("last_movement_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("inventory_levels_key").on(
      t.tenant_id,
      t.warehouse_id,
      t.product_id,
    ),
    index("inventory_levels_tenant_store_idx").on(t.tenant_id, t.store_id),
    index("inventory_levels_product_idx").on(t.product_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Ledger — immutable                                                        */
/* ------------------------------------------------------------------------- */

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),

    type: movementTypeEnum("type").notNull(),
    state: stockStateEnum("state").notNull().default("available"),

    /** Signed: positive increases stock, negative decreases it. */
    quantity: qty("quantity").notNull(),
    /** Running balance for this (warehouse, product) after the movement. */
    balance_after: qty("balance_after").notNull(),
    unit_cost: money("unit_cost").notNull().default("0"),
    total_cost: money("total_cost").notNull().default("0"),

    /** Originating document, e.g. "sales_invoice" / "goods_receipt". */
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    reference_number: text("reference_number"),

    reason: text("reason"),
    note: text("note"),

    performed_by: uuid("performed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Ledger rows are never updated — only created_at is meaningful. */
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_movements_scope_idx").on(
      t.tenant_id,
      t.warehouse_id,
      t.product_id,
      t.created_at,
    ),
    index("inventory_movements_tenant_created_idx").on(
      t.tenant_id,
      t.created_at,
    ),
    index("inventory_movements_reference_idx").on(
      t.reference_type,
      t.reference_id,
    ),
    index("inventory_movements_type_idx").on(t.tenant_id, t.type),
  ],
);

/* ------------------------------------------------------------------------- */
/* Stock adjustments                                                         */
/* ------------------------------------------------------------------------- */

export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),

    adjustment_number: text("adjustment_number").notNull(),
    reason: adjustmentReasonEnum("reason").notNull(),
    note: text("note"),

    approval_status: approvalStatusEnum("approval_status")
      .notNull()
      .default("not_required"),
    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    /** Set when the ledger entries have been written. */
    posted_at: timestamp("posted_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("stock_adjustments_number_key").on(
      t.tenant_id,
      t.adjustment_number,
    ),
    index("stock_adjustments_tenant_idx").on(t.tenant_id, t.created_at),
  ],
);

export const stockAdjustmentItems = pgTable(
  "stock_adjustment_items",
  {
    id: pk(),
    adjustment_id: uuid("adjustment_id")
      .notNull()
      .references(() => stockAdjustments.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),
    /** Signed delta requested. */
    quantity: qty("quantity").notNull(),
    /** Snapshot of stock before posting, for the variance trail. */
    quantity_before: qty("quantity_before").notNull().default("0"),
    unit_cost: money("unit_cost").notNull().default("0"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("stock_adjustment_items_parent_idx").on(t.adjustment_id)],
);

/* ------------------------------------------------------------------------- */
/* Stock transfers                                                           */
/* ------------------------------------------------------------------------- */

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    transfer_number: text("transfer_number").notNull(),
    status: transferStatusEnum("status").notNull().default("draft"),

    source_store_id: uuid("source_store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    source_warehouse_id: uuid("source_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    destination_store_id: uuid("destination_store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    destination_warehouse_id: uuid("destination_warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),

    note: text("note"),

    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    dispatched_at: timestamp("dispatched_at", { withTimezone: true }),
    received_by: uuid("received_by").references(() => users.id, {
      onDelete: "set null",
    }),
    received_at: timestamp("received_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("stock_transfers_number_key").on(t.tenant_id, t.transfer_number),
    index("stock_transfers_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: pk(),
    transfer_id: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),
    quantity_requested: qty("quantity_requested").notNull(),
    quantity_dispatched: qty("quantity_dispatched").notNull().default("0"),
    quantity_received: qty("quantity_received").notNull().default("0"),
    unit_cost: money("unit_cost").notNull().default("0"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("stock_transfer_items_parent_idx").on(t.transfer_id)],
);

/* ------------------------------------------------------------------------- */
/* Physical stock counts                                                     */
/* ------------------------------------------------------------------------- */

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),

    count_number: text("count_number").notNull(),
    name: text("name"),
    status: countStatusEnum("status").notNull().default("draft"),
    /** Employees assigned to perform the count. */
    assignees: jsonb("assignees").$type<string[]>().notNull().default([]),

    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    /** Adjustment generated from the approved variance. */
    adjustment_id: uuid("adjustment_id").references(() => stockAdjustments.id, {
      onDelete: "set null",
    }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("stock_counts_number_key").on(t.tenant_id, t.count_number),
    index("stock_counts_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const stockCountItems = pgTable(
  "stock_count_items",
  {
    id: pk(),
    count_id: uuid("count_id")
      .notNull()
      .references(() => stockCounts.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    /** System quantity captured when the count sheet was generated. */
    expected_quantity: qty("expected_quantity").notNull().default("0"),
    counted_quantity: qty("counted_quantity"),
    /** counted - expected. Positive = found, negative = lost. */
    variance: qty("variance"),
    note: text("note"),
    counted_by: uuid("counted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    counted_at: timestamp("counted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("stock_count_items_parent_idx").on(t.count_id)],
);

/* ------------------------------------------------------------------------- */
/* Reservations                                                              */
/* ------------------------------------------------------------------------- */

export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    quantity: qty("quantity").notNull(),
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    note: text("note"),

    expires_at: timestamp("expires_at", { withTimezone: true }),
    released_at: timestamp("released_at", { withTimezone: true }),
    is_active: boolean("is_active").notNull().default(true),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    index("stock_reservations_scope_idx").on(
      t.tenant_id,
      t.warehouse_id,
      t.product_id,
    ),
    index("stock_reservations_active_idx").on(t.tenant_id, t.is_active),
  ],
);
