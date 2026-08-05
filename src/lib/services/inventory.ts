import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db, type DbClient, type Transaction } from "@/db";
import {
  inventoryLevels,
  inventoryMovements,
  products,
  stockReservations,
} from "@/db/schema";
import { BusinessRuleError } from "@/lib/authz/errors";
import { add, dec, div, gt, isPositive, lt, mul, toUnits } from "@/lib/money";

/**
 * The inventory engine.
 *
 * Every stock change in StoqBook goes through `postMovements`. Stock is never
 * written directly: a movement row is appended and the balance in
 * `inventory_levels` is updated inside the same transaction, so the ledger
 * always reconciles (08-inventory.md § Core Principle).
 */

export type MovementType =
  | "opening_stock"
  | "purchase"
  | "sale"
  | "sale_return"
  | "purchase_return"
  | "transfer_in"
  | "transfer_out"
  | "adjustment"
  | "damage"
  | "expired"
  | "reserved"
  | "released"
  | "production"
  | "consumption";

export type StockState =
  | "available"
  | "reserved"
  | "damaged"
  | "expired"
  | "in_transit"
  | "pending_inspection";

/** Column on inventory_levels backing each state bucket. */
const BUCKET: Record<StockState, keyof typeof inventoryLevels.$inferSelect> = {
  available: "quantity_available",
  reserved: "quantity_reserved",
  damaged: "quantity_damaged",
  expired: "quantity_expired",
  in_transit: "quantity_in_transit",
  pending_inspection: "quantity_pending_inspection",
};

export interface MovementInput {
  productId: string;
  storeId: string;
  warehouseId: string;
  type: MovementType;
  /** Signed: positive increases the bucket, negative decreases it. */
  quantity: string;
  /** Which bucket the quantity applies to. Defaults to sellable stock. */
  state?: StockState;
  unitCost?: string;
  batchId?: string | null;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  reason?: string;
  note?: string;
}

export interface PostContext {
  businessId: string;
  userId?: string | null;
  /** Business setting inventory.allow_negative_stock. */
  allowNegative?: boolean;
}

/**
 * Appends ledger entries and synchronises balances.
 *
 * MUST be called inside a transaction — a partially posted movement set would
 * leave the ledger and balances disagreeing.
 */
export async function postMovements(
  tx: Transaction,
  ctx: PostContext,
  movements: MovementInput[],
): Promise<void> {
  for (const movement of movements) {
    const state = movement.state ?? "available";
    const bucket = BUCKET[state];

    // Lock the balance row so concurrent sales of the same product serialise.
    const level = await lockLevel(
      tx,
      ctx.businessId,
      movement.storeId,
      movement.warehouseId,
      movement.productId,
    );

    const current = String(level[bucket] ?? "0");
    const balanceAfter = add(current, movement.quantity);

    // Negative stock is only allowed for sellable stock when the tenant permits
    // it; the other buckets can never legitimately go negative.
    if (lt(balanceAfter, "0")) {
      if (state !== "available" || !ctx.allowNegative) {
        const [product] = await tx
          .select({ name: products.name, sku: products.sku })
          .from(products)
          .where(eq(products.id, movement.productId))
          .limit(1);

        throw BusinessRuleError(
          `Insufficient ${state === "available" ? "" : `${state} `}stock for ${
            product ? `${product.name} (${product.sku})` : "product"
          }. Available ${dec(current)}, requested ${dec(
            mul(movement.quantity, "-1"),
          )}.`,
          "INSUFFICIENT_STOCK",
        );
      }
    }

    const unitCost = movement.unitCost ? dec(movement.unitCost) : "0.0000";
    const totalCost = mul(unitCost, movement.quantity);

    // Weighted-average cost only moves on sellable inflows that carry a cost.
    let averageCost = String(level.average_cost ?? "0");
    if (
      state === "available" &&
      isPositive(movement.quantity) &&
      isPositive(unitCost)
    ) {
      averageCost = weightedAverage(
        current,
        averageCost,
        movement.quantity,
        unitCost,
      );
    }

    await tx
      .update(inventoryLevels)
      .set({
        [bucket]: balanceAfter,
        average_cost: averageCost,
        last_movement_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(inventoryLevels.id, level.id));

    await tx.insert(inventoryMovements).values({
      tenant_id: ctx.businessId,
      branch_id: movement.storeId,
      warehouse_id: movement.warehouseId,
      product_id: movement.productId,
      batch_id: movement.batchId ?? null,
      type: movement.type,
      state,
      quantity: dec(movement.quantity),
      balance_after: balanceAfter,
      unit_cost: unitCost,
      total_cost: totalCost,
      reference_type: movement.referenceType ?? null,
      reference_id: movement.referenceId ?? null,
      reference_number: movement.referenceNumber ?? null,
      reason: movement.reason ?? null,
      note: movement.note ?? null,
      performed_by: ctx.userId ?? null,
    });
  }
}

/**
 * New average = (existingQty × existingCost + inQty × inCost) / (existingQty + inQty).
 * Falls back to the incoming cost when there is no prior stock.
 */
function weightedAverage(
  existingQty: string,
  existingCost: string,
  inQty: string,
  inCost: string,
): string {
  const totalQty = add(existingQty, inQty);
  if (!isPositive(totalQty)) return dec(inCost);
  if (!isPositive(existingQty)) return dec(inCost);

  const existingValue = mul(existingQty, existingCost);
  const incomingValue = mul(inQty, inCost);
  return div(add(existingValue, incomingValue), totalQty);
}

/**
 * Fetches the balance row with `FOR UPDATE`, creating it on first use.
 * The insert is conflict-tolerant because two concurrent first-touches race.
 */
async function lockLevel(
  tx: Transaction,
  businessId: string,
  storeId: string,
  warehouseId: string,
  productId: string,
) {
  const select = () =>
    tx
      .select()
      .from(inventoryLevels)
      .where(
        and(
          eq(inventoryLevels.tenant_id, businessId),
          eq(inventoryLevels.warehouse_id, warehouseId),
          eq(inventoryLevels.product_id, productId),
        ),
      )
      .limit(1)
      .for("update");

  const [existing] = await select();
  if (existing) return existing;

  await tx
    .insert(inventoryLevels)
    .values({
      tenant_id: businessId,
      branch_id: storeId,
      warehouse_id: warehouseId,
      product_id: productId,
    })
    .onConflictDoNothing();

  const [created] = await select();
  if (!created) {
    throw BusinessRuleError("Could not initialise stock record.", "STOCK_INIT_FAILED");
  }
  return created;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface StockSnapshot {
  available: string;
  reserved: string;
  damaged: string;
  expired: string;
  inTransit: string;
  averageCost: string;
}

const EMPTY_SNAPSHOT: StockSnapshot = {
  available: "0.0000",
  reserved: "0.0000",
  damaged: "0.0000",
  expired: "0.0000",
  inTransit: "0.0000",
  averageCost: "0.0000",
};

export async function stockFor(
  businessId: string,
  warehouseId: string,
  productId: string,
  client: DbClient = db,
): Promise<StockSnapshot> {
  const [row] = await client
    .select()
    .from(inventoryLevels)
    .where(
      and(
        eq(inventoryLevels.tenant_id, businessId),
        eq(inventoryLevels.warehouse_id, warehouseId),
        eq(inventoryLevels.product_id, productId),
      ),
    )
    .limit(1);

  if (!row) return EMPTY_SNAPSHOT;

  return {
    available: String(row.quantity_available),
    reserved: String(row.quantity_reserved),
    damaged: String(row.quantity_damaged),
    expired: String(row.quantity_expired),
    inTransit: String(row.quantity_in_transit),
    averageCost: String(row.average_cost),
  };
}

/** Bulk availability lookup keyed by product id — used by POS and invoices. */
export async function stockMap(
  businessId: string,
  warehouseId: string,
  productIds: string[],
  client: DbClient = db,
): Promise<Map<string, StockSnapshot>> {
  const map = new Map<string, StockSnapshot>();
  if (productIds.length === 0) return map;

  const rows = await client
    .select()
    .from(inventoryLevels)
    .where(
      and(
        eq(inventoryLevels.tenant_id, businessId),
        eq(inventoryLevels.warehouse_id, warehouseId),
        sql`${inventoryLevels.product_id} = ANY(${sql.raw(
          `ARRAY[${productIds.map((id) => `'${id}'::uuid`).join(",")}]`,
        )})`,
      ),
    );

  for (const row of rows) {
    map.set(row.product_id, {
      available: String(row.quantity_available),
      reserved: String(row.quantity_reserved),
      damaged: String(row.quantity_damaged),
      expired: String(row.quantity_expired),
      inTransit: String(row.quantity_in_transit),
      averageCost: String(row.average_cost),
    });
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                 */
/* -------------------------------------------------------------------------- */

/** Opening stock — allowed only when the product has no ledger history. */
export async function postOpeningStock(
  tx: Transaction,
  ctx: PostContext,
  input: {
    productId: string;
    storeId: string;
    warehouseId: string;
    quantity: string;
    unitCost: string;
    batchId?: string | null;
  },
): Promise<void> {
  const [existing] = await tx
    .select({ id: inventoryMovements.id })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.tenant_id, ctx.businessId),
        eq(inventoryMovements.warehouse_id, input.warehouseId),
        eq(inventoryMovements.product_id, input.productId),
        eq(inventoryMovements.type, "opening_stock"),
      ),
    )
    .limit(1);

  if (existing) {
    throw BusinessRuleError(
      "Opening stock has already been recorded for this product in this warehouse.",
      "OPENING_STOCK_EXISTS",
    );
  }

  await postMovements(tx, ctx, [
    {
      ...input,
      type: "opening_stock",
      state: "available",
      reason: "Opening stock",
    },
  ]);
}

/**
 * Moves quantity between two buckets of the same warehouse as a matched pair,
 * e.g. writing stock off as damaged or reserving it for an order.
 */
export async function moveBetweenStates(
  tx: Transaction,
  ctx: PostContext,
  input: {
    productId: string;
    storeId: string;
    warehouseId: string;
    quantity: string;
    from: StockState;
    to: StockState;
    type: MovementType;
    unitCost?: string;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
    referenceNumber?: string;
  },
): Promise<void> {
  if (!isPositive(input.quantity)) {
    throw BusinessRuleError("Quantity must be greater than zero.", "INVALID_QUANTITY");
  }

  const base = {
    productId: input.productId,
    storeId: input.storeId,
    warehouseId: input.warehouseId,
    type: input.type,
    unitCost: input.unitCost,
    reason: input.reason,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceNumber: input.referenceNumber,
  };

  await postMovements(tx, ctx, [
    { ...base, state: input.from, quantity: mul(input.quantity, "-1") },
    { ...base, state: input.to, quantity: dec(input.quantity) },
  ]);
}

/** Reserves sellable stock for an order or transfer. */
export async function reserveStock(
  tx: Transaction,
  ctx: PostContext,
  input: {
    productId: string;
    storeId: string;
    warehouseId: string;
    quantity: string;
    referenceType?: string;
    referenceId?: string;
    expiresAt?: Date | null;
    note?: string;
  },
): Promise<void> {
  await moveBetweenStates(tx, ctx, {
    ...input,
    from: "available",
    to: "reserved",
    type: "reserved",
    reason: "Stock reserved",
  });

  await tx.insert(stockReservations).values({
    tenant_id: ctx.businessId,
    branch_id: input.storeId,
    warehouse_id: input.warehouseId,
    product_id: input.productId,
    quantity: dec(input.quantity),
    reference_type: input.referenceType ?? null,
    reference_id: input.referenceId ?? null,
    expires_at: input.expiresAt ?? null,
    note: input.note ?? null,
    created_by: ctx.userId ?? null,
  });
}

/** Returns reserved stock to the sellable pool. */
export async function releaseReservation(
  tx: Transaction,
  ctx: PostContext,
  reservationId: string,
): Promise<void> {
  const [reservation] = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.id, reservationId),
        eq(stockReservations.tenant_id, ctx.businessId),
        eq(stockReservations.is_active, true),
      ),
    )
    .limit(1);

  if (!reservation) {
    throw BusinessRuleError("Reservation not found or already released.", "RESERVATION_MISSING");
  }

  await moveBetweenStates(tx, ctx, {
    productId: reservation.product_id,
    storeId: reservation.branch_id,
    warehouseId: reservation.warehouse_id,
    quantity: String(reservation.quantity),
    from: "reserved",
    to: "available",
    type: "released",
    reason: "Reservation released",
    referenceType: reservation.reference_type ?? undefined,
    referenceId: reservation.reference_id ?? undefined,
  });

  await tx
    .update(stockReservations)
    .set({ is_active: false, released_at: new Date(), updated_at: new Date() })
    .where(eq(stockReservations.id, reservationId));
}

/* -------------------------------------------------------------------------- */
/* Valuation and alerts                                                       */
/* -------------------------------------------------------------------------- */

/** Total sellable inventory value at average cost. */
export async function inventoryValue(
  businessId: string,
  options: { storeId?: string | null } = {},
  client: DbClient = db,
): Promise<string> {
  const [row] = await client
    .select({
      value: sql<string>`coalesce(sum(${inventoryLevels.quantity_available} * ${inventoryLevels.average_cost}), 0)`,
    })
    .from(inventoryLevels)
    .where(
      and(
        eq(inventoryLevels.tenant_id, businessId),
        options.storeId ? eq(inventoryLevels.branch_id, options.storeId) : undefined,
      ),
    );
  return dec(row?.value ?? "0");
}

export interface LowStockRow {
  productId: string;
  name: string;
  sku: string;
  available: string;
  minStock: string;
  reorderQuantity: string | null;
  warehouseId: string;
}

/** Products at or below their configured minimum stock. */
export async function lowStockItems(
  businessId: string,
  options: { storeId?: string | null; limit?: number } = {},
  client: DbClient = db,
): Promise<LowStockRow[]> {
  const rows = await client
    .select({
      productId: products.id,
      name: products.name,
      sku: products.sku,
      available: inventoryLevels.quantity_available,
      minStock: products.min_stock,
      reorderQuantity: products.reorder_quantity,
      warehouseId: inventoryLevels.warehouse_id,
    })
    .from(inventoryLevels)
    .innerJoin(products, eq(products.id, inventoryLevels.product_id))
    .where(
      and(
        eq(inventoryLevels.tenant_id, businessId),
        eq(products.track_inventory, true),
        eq(products.status, "active"),
        options.storeId ? eq(inventoryLevels.branch_id, options.storeId) : undefined,
        sql`${products.min_stock} > 0`,
        sql`${inventoryLevels.quantity_available} <= ${products.min_stock}`,
      ),
    )
    .orderBy(sql`${inventoryLevels.quantity_available} asc`)
    .limit(options.limit ?? 20);

  return rows.map((r) => ({
    ...r,
    available: String(r.available),
    minStock: String(r.minStock),
    reorderQuantity: r.reorderQuantity ? String(r.reorderQuantity) : null,
  }));
}

/**
 * Recomputes a balance row from the ledger. The ledger is authoritative, so this
 * is the repair path if a balance ever drifts.
 */
export async function reconcileLevel(
  businessId: string,
  warehouseId: string,
  productId: string,
): Promise<StockSnapshot> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        state: inventoryMovements.state,
        total: sql<string>`coalesce(sum(${inventoryMovements.quantity}), 0)`,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.tenant_id, businessId),
          eq(inventoryMovements.warehouse_id, warehouseId),
          eq(inventoryMovements.product_id, productId),
        ),
      )
      .groupBy(inventoryMovements.state);

    const totals = new Map(rows.map((r) => [r.state, dec(r.total)]));
    const patch = {
      quantity_available: totals.get("available") ?? "0",
      quantity_reserved: totals.get("reserved") ?? "0",
      quantity_damaged: totals.get("damaged") ?? "0",
      quantity_expired: totals.get("expired") ?? "0",
      quantity_in_transit: totals.get("in_transit") ?? "0",
      quantity_pending_inspection: totals.get("pending_inspection") ?? "0",
      updated_at: new Date(),
    };

    await tx
      .update(inventoryLevels)
      .set(patch)
      .where(
        and(
          eq(inventoryLevels.tenant_id, businessId),
          eq(inventoryLevels.warehouse_id, warehouseId),
          eq(inventoryLevels.product_id, productId),
        ),
      );

    return stockFor(businessId, warehouseId, productId, tx);
  });
}

/** True when the requested quantity can be sold right now. */
export function canFulfil(
  snapshot: StockSnapshot,
  quantity: string,
  allowNegative: boolean,
): boolean {
  if (allowNegative) return true;
  return !gt(quantity, snapshot.available) || toUnits(quantity) === toUnits(snapshot.available);
}
