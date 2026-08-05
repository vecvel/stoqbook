import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  inventoryLevels,
  products,
  stockAdjustmentItems,
  stockAdjustments,
  stockCountItems,
  stockCounts,
  stockTransferItems,
  stockTransfers,
  warehouses,
} from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/context";
import { BusinessRuleError, ValidationError } from "@/lib/authz/errors";
import { abs, dec, gt, isPositive, isZero, mul, sub } from "@/lib/money";
import { auditEvent } from "./audit";
import { moveBetweenStates, postMovements, stockFor } from "./inventory";
import { emit } from "./notifications";
import { nextNumber } from "./numbering";
import { loadSettings, readBoolean, readNumber } from "./settings";

/**
 * Stock operations: adjustments, transfers and physical counts.
 * All of them write through the inventory ledger (08-inventory.md).
 */

export type AdjustmentReason =
  | "counting_error"
  | "damaged"
  | "missing"
  | "found"
  | "expired"
  | "administrative";

export interface AdjustmentLineInput {
  productId: string;
  /** Signed delta against sellable stock. */
  quantity: string;
  note?: string;
}

export async function createStockAdjustment(
  ctx: BusinessContext,
  input: {
    warehouseId: string;
    reason: AdjustmentReason;
    lines: AdjustmentLineInput[];
    note?: string;
  },
): Promise<{
  adjustmentId: string;
  adjustmentNumber: string;
  requiresApproval: boolean;
}> {
  if (!input.lines?.length) {
    throw ValidationError("Add at least one line to adjust.");
  }
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }

  const storeId = ctx.activeStore.id;
  const settings = await loadSettings({ businessId: ctx.business.id });
  const allowNegative = readBoolean(settings, "inventory.allow_negative_stock");
  const threshold = readNumber(
    settings,
    "inventory.adjustment_approval_threshold",
    0,
  );

  const lines = input.lines.filter((l) => !isZero(l.quantity));
  if (lines.length === 0) {
    throw ValidationError("At least one line must have a non-zero quantity.");
  }

  // Large adjustments need a second pair of eyes.
  const largest = lines.reduce(
    (max, l) => (gt(abs(l.quantity), max) ? abs(l.quantity) : max),
    "0",
  );
  const requiresApproval =
    threshold > 0 &&
    gt(largest, String(threshold)) &&
    !hasPermission(ctx, "inventory.approve_adjustment");

  return db.transaction(async (tx) => {
    const adjustmentNumber = await nextNumber(ctx.business.id, "stock_adjustment", {
      storeId,
      client: tx,
    });

    const [adjustment] = await tx
      .insert(stockAdjustments)
      .values({
        tenant_id: ctx.business.id,
        branch_id: storeId,
        warehouse_id: input.warehouseId,
        adjustment_number: adjustmentNumber,
        reason: input.reason,
        note: input.note ?? null,
        approval_status: requiresApproval ? "pending" : "not_required",
        approved_by: requiresApproval ? null : ctx.user.id,
        approved_at: requiresApproval ? null : new Date(),
        posted_at: requiresApproval ? null : new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    for (const line of lines) {
      const snapshot = await stockFor(
        ctx.business.id,
        input.warehouseId,
        line.productId,
        tx,
      );
      await tx.insert(stockAdjustmentItems).values({
        adjustment_id: adjustment.id,
        product_id: line.productId,
        quantity: dec(line.quantity),
        quantity_before: snapshot.available,
        unit_cost: snapshot.averageCost,
        note: line.note ?? null,
      });
    }

    if (!requiresApproval) {
      await postAdjustment(tx, ctx, adjustment.id, allowNegative);
    }

    await auditEvent(
      ctx,
      {
        event: "StockAdjusted",
        moduleSlug: "inventory",
        entityType: "stock_adjustment",
        entityId: adjustment.id,
        summary: `Adjustment ${adjustmentNumber} (${input.reason})`,
        payload: {
          reason: input.reason,
          lines: lines.length,
          pending_approval: requiresApproval,
        },
      },
      tx,
    );

    if (requiresApproval) {
      await emit(
        {
          businessId: ctx.business.id,
          event: "StockAdjusted",
          moduleSlug: "inventory",
          storeId,
          title: "Stock adjustment awaiting approval",
          body: `${adjustmentNumber} needs approval before it affects stock.`,
          actionUrl: `/inventory/adjustments/${adjustment.id}`,
          priority: "high",
          fallbackPermission: "inventory.approve_adjustment",
        },
        tx,
      );
    }

    return { adjustmentId: adjustment.id, adjustmentNumber, requiresApproval };
  });
}

/** Writes the ledger entries for an adjustment. */
async function postAdjustment(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ctx: BusinessContext,
  adjustmentId: string,
  allowNegative: boolean,
): Promise<void> {
  const [adjustment] = await tx
    .select()
    .from(stockAdjustments)
    .where(eq(stockAdjustments.id, adjustmentId))
    .limit(1);
  if (!adjustment) throw ValidationError("Adjustment not found.");

  const items = await tx
    .select()
    .from(stockAdjustmentItems)
    .where(eq(stockAdjustmentItems.adjustment_id, adjustmentId));

  // Damage and expiry move stock into their own bucket rather than deleting it,
  // so written-off value stays visible and auditable.
  const bucketed =
    adjustment.reason === "damaged"
      ? "damaged"
      : adjustment.reason === "expired"
        ? "expired"
        : null;

  for (const item of items) {
    const quantity = String(item.quantity);

    if (bucketed && !isPositive(quantity)) {
      await moveBetweenStates(tx, { businessId: ctx.business.id, userId: ctx.user.id, allowNegative }, {
        productId: item.product_id,
        storeId: adjustment.branch_id,
        warehouseId: adjustment.warehouse_id,
        quantity: abs(quantity),
        from: "available",
        to: bucketed,
        type: bucketed === "damaged" ? "damage" : "expired",
        unitCost: String(item.unit_cost),
        reason: adjustment.reason,
        referenceType: "stock_adjustment",
        referenceId: adjustment.id,
        referenceNumber: adjustment.adjustment_number,
      });
      continue;
    }

    await postMovements(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative },
      [
        {
          productId: item.product_id,
          storeId: adjustment.branch_id,
          warehouseId: adjustment.warehouse_id,
          type: "adjustment",
          quantity,
          unitCost: String(item.unit_cost),
          referenceType: "stock_adjustment",
          referenceId: adjustment.id,
          referenceNumber: adjustment.adjustment_number,
          reason: adjustment.reason,
          note: item.note ?? undefined,
        },
      ],
    );
  }

  await tx
    .update(stockAdjustments)
    .set({ posted_at: new Date(), updated_at: new Date() })
    .where(eq(stockAdjustments.id, adjustmentId));
}

export async function approveStockAdjustment(
  ctx: BusinessContext,
  adjustmentId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const settings = await loadSettings({ businessId: ctx.business.id });
  const allowNegative = readBoolean(settings, "inventory.allow_negative_stock");

  await db.transaction(async (tx) => {
    const [adjustment] = await tx
      .select()
      .from(stockAdjustments)
      .where(
        and(
          eq(stockAdjustments.id, adjustmentId),
          eq(stockAdjustments.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!adjustment) throw ValidationError("Adjustment not found.");
    if (adjustment.approval_status !== "pending") {
      throw BusinessRuleError(
        "This adjustment is not awaiting approval.",
        "NOT_PENDING_APPROVAL",
      );
    }

    await tx
      .update(stockAdjustments)
      .set({
        approval_status: decision,
        approved_by: ctx.user.id,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(stockAdjustments.id, adjustmentId));

    if (decision === "approved") {
      await postAdjustment(tx, ctx, adjustmentId, allowNegative);
    }

    await auditEvent(
      ctx,
      {
        event: "StockAdjusted",
        moduleSlug: "inventory",
        entityType: "stock_adjustment",
        entityId: adjustmentId,
        summary: `Adjustment ${adjustment.adjustment_number} ${decision}`,
      },
      tx,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* -------------------------------------------------------------------------- */

export async function createStockTransfer(
  ctx: BusinessContext,
  input: {
    sourceWarehouseId: string;
    destinationWarehouseId: string;
    lines: { productId: string; quantity: string; note?: string }[];
    note?: string;
  },
): Promise<{ transferId: string; transferNumber: string; requiresApproval: boolean }> {
  if (!input.lines?.length) {
    throw ValidationError("Add at least one item to transfer.");
  }
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw ValidationError("Source and destination warehouses must differ.");
  }

  const settings = await loadSettings({ businessId: ctx.business.id });
  const requiresApproval = readBoolean(
    settings,
    "inventory.transfer_requires_approval",
  );

  const [source, destination] = await Promise.all([
    loadWarehouse(ctx, input.sourceWarehouseId),
    loadWarehouse(ctx, input.destinationWarehouseId),
  ]);

  return db.transaction(async (tx) => {
    const transferNumber = await nextNumber(ctx.business.id, "stock_transfer", {
      storeId: source.branch_id,
      client: tx,
    });

    const [transfer] = await tx
      .insert(stockTransfers)
      .values({
        tenant_id: ctx.business.id,
        transfer_number: transferNumber,
        status: requiresApproval ? "draft" : "approved",
        source_branch_id: source.branch_id!,
        source_warehouse_id: source.id,
        destination_branch_id: destination.branch_id!,
        destination_warehouse_id: destination.id,
        note: input.note ?? null,
        approved_by: requiresApproval ? null : ctx.user.id,
        approved_at: requiresApproval ? null : new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    for (const line of input.lines) {
      if (!isPositive(line.quantity)) {
        throw ValidationError("Transfer quantity must be greater than zero.");
      }
      const snapshot = await stockFor(
        ctx.business.id,
        source.id,
        line.productId,
        tx,
      );
      await tx.insert(stockTransferItems).values({
        transfer_id: transfer.id,
        product_id: line.productId,
        quantity_requested: dec(line.quantity),
        unit_cost: snapshot.averageCost,
        note: line.note ?? null,
      });
    }

    await auditEvent(
      ctx,
      {
        event: "StockTransferred",
        moduleSlug: "inventory",
        entityType: "stock_transfer",
        entityId: transfer.id,
        summary: `Transfer ${transferNumber} created`,
        payload: {
          source: source.name,
          destination: destination.name,
          lines: input.lines.length,
        },
      },
      tx,
    );

    return { transferId: transfer.id, transferNumber, requiresApproval };
  });
}

async function loadWarehouse(ctx: BusinessContext, id: string) {
  const [row] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, id), eq(warehouses.tenant_id, ctx.business.id)))
    .limit(1);
  if (!row) throw ValidationError("Warehouse not found.");
  if (!row.is_active) {
    throw BusinessRuleError(`${row.name} is inactive.`, "WAREHOUSE_INACTIVE");
  }
  if (!row.branch_id) {
    throw BusinessRuleError(
      `${row.name} is not linked to a store.`,
      "WAREHOUSE_NO_BRANCH",
    );
  }
  return row;
}

export async function approveStockTransfer(
  ctx: BusinessContext,
  transferId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const transfer = await lockTransfer(tx, ctx, transferId);
    if (transfer.status !== "draft") {
      throw BusinessRuleError(
        "Only a draft transfer can be approved.",
        "INVALID_TRANSFER_STATE",
      );
    }
    await tx
      .update(stockTransfers)
      .set({
        status: "approved",
        approved_by: ctx.user.id,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(stockTransfers.id, transferId));
  });
}

/**
 * Dispatch removes stock from the source and books it as in transit at the
 * destination, so the goods are never invisible while they travel.
 */
export async function dispatchStockTransfer(
  ctx: BusinessContext,
  transferId: string,
  quantities?: Record<string, string>,
): Promise<void> {
  const settings = await loadSettings({ businessId: ctx.business.id });
  const allowNegative = readBoolean(settings, "inventory.allow_negative_stock");

  await db.transaction(async (tx) => {
    const transfer = await lockTransfer(tx, ctx, transferId);
    if (transfer.status !== "approved") {
      throw BusinessRuleError(
        "The transfer must be approved before dispatch.",
        "INVALID_TRANSFER_STATE",
      );
    }

    const items = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transfer_id, transferId));

    for (const item of items) {
      const quantity = dec(
        quantities?.[item.id] ?? String(item.quantity_requested),
      );
      if (!isPositive(quantity)) continue;

      // Out of the source warehouse …
      await postMovements(
        tx,
        { businessId: ctx.business.id, userId: ctx.user.id, allowNegative },
        [
          {
            productId: item.product_id,
            storeId: transfer.source_branch_id,
            warehouseId: transfer.source_warehouse_id,
            type: "transfer_out",
            quantity: mul(quantity, "-1"),
            unitCost: String(item.unit_cost),
            referenceType: "stock_transfer",
            referenceId: transfer.id,
            referenceNumber: transfer.transfer_number,
            reason: "Transfer dispatched",
          },
          // … and into the destination's in-transit bucket.
          {
            productId: item.product_id,
            storeId: transfer.destination_branch_id,
            warehouseId: transfer.destination_warehouse_id,
            type: "transfer_out",
            state: "in_transit",
            quantity,
            unitCost: String(item.unit_cost),
            referenceType: "stock_transfer",
            referenceId: transfer.id,
            referenceNumber: transfer.transfer_number,
            reason: "In transit",
          },
        ],
      );

      await tx
        .update(stockTransferItems)
        .set({ quantity_dispatched: quantity })
        .where(eq(stockTransferItems.id, item.id));
    }

    await tx
      .update(stockTransfers)
      .set({
        status: "in_transit",
        dispatched_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(stockTransfers.id, transferId));

    await auditEvent(
      ctx,
      {
        event: "StockTransferred",
        moduleSlug: "inventory",
        entityType: "stock_transfer",
        entityId: transferId,
        summary: `Transfer ${transfer.transfer_number} dispatched`,
      },
      tx,
    );
  });
}

/** Receipt converts in-transit stock into sellable stock at the destination. */
export async function receiveStockTransfer(
  ctx: BusinessContext,
  transferId: string,
  quantities?: Record<string, string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const transfer = await lockTransfer(tx, ctx, transferId);
    if (transfer.status !== "in_transit") {
      throw BusinessRuleError(
        "Only an in-transit transfer can be received.",
        "INVALID_TRANSFER_STATE",
      );
    }

    const items = await tx
      .select()
      .from(stockTransferItems)
      .where(eq(stockTransferItems.transfer_id, transferId));

    for (const item of items) {
      const dispatched = String(item.quantity_dispatched);
      const quantity = dec(quantities?.[item.id] ?? dispatched);
      if (!isPositive(quantity)) continue;

      if (gt(quantity, dispatched)) {
        throw BusinessRuleError(
          `Cannot receive more than the ${dec(dispatched)} dispatched.`,
          "OVER_RECEIPT",
        );
      }

      await postMovements(
        tx,
        { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: true },
        [
          {
            productId: item.product_id,
            storeId: transfer.destination_branch_id,
            warehouseId: transfer.destination_warehouse_id,
            type: "transfer_in",
            state: "in_transit",
            quantity: mul(quantity, "-1"),
            unitCost: String(item.unit_cost),
            referenceType: "stock_transfer",
            referenceId: transfer.id,
            referenceNumber: transfer.transfer_number,
            reason: "Transfer received",
          },
          {
            productId: item.product_id,
            storeId: transfer.destination_branch_id,
            warehouseId: transfer.destination_warehouse_id,
            type: "transfer_in",
            quantity,
            unitCost: String(item.unit_cost),
            referenceType: "stock_transfer",
            referenceId: transfer.id,
            referenceNumber: transfer.transfer_number,
            reason: "Transfer received",
          },
        ],
      );

      // Any shortfall stays in transit for investigation rather than vanishing.
      const shortfall = sub(dispatched, quantity);
      if (isPositive(shortfall)) {
        await postMovements(
          tx,
          { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: true },
          [
            {
              productId: item.product_id,
              storeId: transfer.destination_branch_id,
              warehouseId: transfer.destination_warehouse_id,
              type: "transfer_in",
              state: "pending_inspection",
              quantity: shortfall,
              unitCost: String(item.unit_cost),
              referenceType: "stock_transfer",
              referenceId: transfer.id,
              referenceNumber: transfer.transfer_number,
              reason: "Short received — pending investigation",
            },
            {
              productId: item.product_id,
              storeId: transfer.destination_branch_id,
              warehouseId: transfer.destination_warehouse_id,
              type: "transfer_in",
              state: "in_transit",
              quantity: mul(shortfall, "-1"),
              unitCost: String(item.unit_cost),
              referenceType: "stock_transfer",
              referenceId: transfer.id,
              referenceNumber: transfer.transfer_number,
              reason: "Short received",
            },
          ],
        );
      }

      await tx
        .update(stockTransferItems)
        .set({ quantity_received: quantity })
        .where(eq(stockTransferItems.id, item.id));
    }

    await tx
      .update(stockTransfers)
      .set({
        status: "completed",
        received_by: ctx.user.id,
        received_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(stockTransfers.id, transferId));

    await auditEvent(
      ctx,
      {
        event: "StockTransferred",
        moduleSlug: "inventory",
        entityType: "stock_transfer",
        entityId: transferId,
        summary: `Transfer ${transfer.transfer_number} received`,
      },
      tx,
    );
  });
}

async function lockTransfer(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ctx: BusinessContext,
  transferId: string,
) {
  const [row] = await tx
    .select()
    .from(stockTransfers)
    .where(
      and(
        eq(stockTransfers.id, transferId),
        eq(stockTransfers.tenant_id, ctx.business.id),
      ),
    )
    .limit(1)
    .for("update");
  if (!row) throw ValidationError("Transfer not found.");
  return row;
}

/* -------------------------------------------------------------------------- */
/* Physical stock counts                                                      */
/* -------------------------------------------------------------------------- */

/** Generates a count sheet snapshotting current system quantities. */
export async function createStockCount(
  ctx: BusinessContext,
  input: {
    warehouseId: string;
    name?: string;
    /** Omit to include every product with a stock record. */
    productIds?: string[];
    assignees?: string[];
  },
): Promise<{ countId: string; countNumber: string; lineCount: number }> {
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }
  const storeId = ctx.activeStore.id;

  return db.transaction(async (tx) => {
    const countNumber = await nextNumber(ctx.business.id, "stock_count", {
      storeId,
      client: tx,
    });

    const [count] = await tx
      .insert(stockCounts)
      .values({
        tenant_id: ctx.business.id,
        branch_id: storeId,
        warehouse_id: input.warehouseId,
        count_number: countNumber,
        name: input.name ?? null,
        status: "counting",
        assignees: input.assignees ?? [],
        started_at: new Date(),
        created_by: ctx.user.id,
      })
      .returning();

    const levels = await tx
      .select({
        productId: inventoryLevels.product_id,
        available: inventoryLevels.quantity_available,
      })
      .from(inventoryLevels)
      .innerJoin(products, eq(products.id, inventoryLevels.product_id))
      .where(
        and(
          eq(inventoryLevels.tenant_id, ctx.business.id),
          eq(inventoryLevels.warehouse_id, input.warehouseId),
          eq(products.track_inventory, true),
          input.productIds?.length
            ? sql`${inventoryLevels.product_id} = ANY(${sql.raw(
                `ARRAY[${input.productIds.map((id) => `'${id}'::uuid`).join(",")}]`,
              )})`
            : undefined,
        ),
      );

    if (levels.length > 0) {
      await tx.insert(stockCountItems).values(
        levels.map((l) => ({
          count_id: count.id,
          product_id: l.productId,
          expected_quantity: String(l.available),
        })),
      );
    }

    await auditEvent(
      ctx,
      {
        event: "StockCountApproved",
        moduleSlug: "inventory",
        entityType: "stock_count",
        entityId: count.id,
        summary: `Stock count ${countNumber} started`,
        payload: { lines: levels.length },
      },
      tx,
    );

    return { countId: count.id, countNumber, lineCount: levels.length };
  });
}

export async function recordCountedQuantities(
  ctx: BusinessContext,
  countId: string,
  counts: Record<string, string>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(stockCounts)
      .where(
        and(eq(stockCounts.id, countId), eq(stockCounts.tenant_id, ctx.business.id)),
      )
      .limit(1);

    if (!count) throw ValidationError("Stock count not found.");
    if (count.status === "approved" || count.status === "cancelled") {
      throw BusinessRuleError(
        "This count is closed and cannot be edited.",
        "COUNT_CLOSED",
      );
    }

    const items = await tx
      .select()
      .from(stockCountItems)
      .where(eq(stockCountItems.count_id, countId));

    for (const item of items) {
      const raw = counts[item.id];
      if (raw === undefined || raw === "") continue;
      const counted = dec(raw);
      await tx
        .update(stockCountItems)
        .set({
          counted_quantity: counted,
          variance: sub(counted, String(item.expected_quantity)),
          counted_by: ctx.user.id,
          counted_at: new Date(),
        })
        .where(eq(stockCountItems.id, item.id));
    }

    await tx
      .update(stockCounts)
      .set({ status: "review", updated_at: new Date() })
      .where(eq(stockCounts.id, countId));
  });
}

/**
 * Approving a count converts its variance into a single stock adjustment,
 * so the ledger records exactly why stock moved.
 */
export async function approveStockCount(
  ctx: BusinessContext,
  countId: string,
): Promise<{ adjustmentNumber: string | null; varianceLines: number }> {
  const settings = await loadSettings({ businessId: ctx.business.id });
  const allowNegative = readBoolean(settings, "inventory.allow_negative_stock");

  return db.transaction(async (tx) => {
    const [count] = await tx
      .select()
      .from(stockCounts)
      .where(
        and(eq(stockCounts.id, countId), eq(stockCounts.tenant_id, ctx.business.id)),
      )
      .limit(1)
      .for("update");

    if (!count) throw ValidationError("Stock count not found.");
    if (count.status === "approved") {
      throw BusinessRuleError("This count is already approved.", "COUNT_APPROVED");
    }

    const items = await tx
      .select()
      .from(stockCountItems)
      .where(eq(stockCountItems.count_id, countId));

    const variances = items.filter(
      (i) => i.variance !== null && !isZero(String(i.variance)),
    );

    let adjustmentNumber: string | null = null;

    if (variances.length > 0) {
      adjustmentNumber = await nextNumber(ctx.business.id, "stock_adjustment", {
        storeId: count.branch_id,
        client: tx,
      });

      const [adjustment] = await tx
        .insert(stockAdjustments)
        .values({
          tenant_id: ctx.business.id,
          branch_id: count.branch_id,
          warehouse_id: count.warehouse_id,
          adjustment_number: adjustmentNumber,
          reason: "counting_error",
          note: `Generated from stock count ${count.count_number}`,
          approval_status: "approved",
          approved_by: ctx.user.id,
          approved_at: new Date(),
          created_by: ctx.user.id,
        })
        .returning();

      for (const item of variances) {
        const snapshot = await stockFor(
          ctx.business.id,
          count.warehouse_id,
          item.product_id,
          tx,
        );
        await tx.insert(stockAdjustmentItems).values({
          adjustment_id: adjustment.id,
          product_id: item.product_id,
          quantity: String(item.variance),
          quantity_before: snapshot.available,
          unit_cost: snapshot.averageCost,
          note: `Counted ${item.counted_quantity}, expected ${item.expected_quantity}`,
        });
      }

      await postAdjustment(tx, ctx, adjustment.id, allowNegative);

      await tx
        .update(stockCounts)
        .set({ adjustment_id: adjustment.id })
        .where(eq(stockCounts.id, countId));
    }

    await tx
      .update(stockCounts)
      .set({
        status: "approved",
        approved_by: ctx.user.id,
        approved_at: new Date(),
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(stockCounts.id, countId));

    await auditEvent(
      ctx,
      {
        event: "StockCountApproved",
        moduleSlug: "inventory",
        entityType: "stock_count",
        entityId: countId,
        summary: `Count ${count.count_number} approved with ${variances.length} variance line(s)`,
        payload: { adjustment_number: adjustmentNumber },
      },
      tx,
    );

    return { adjustmentNumber, varianceLines: variances.length };
  });
}

/* -------------------------------------------------------------------------- */
/* Opening stock                                                              */
/* -------------------------------------------------------------------------- */

export async function setOpeningStock(
  ctx: BusinessContext,
  input: {
    warehouseId: string;
    productId: string;
    quantity: string;
    unitCost: string;
  },
): Promise<void> {
  if (!ctx.activeStore) {
    throw BusinessRuleError("No store selected.", "NO_STORE");
  }
  const storeId = ctx.activeStore.id;

  await db.transaction(async (tx) => {
    const { postOpeningStock } = await import("./inventory");
    await postOpeningStock(
      tx,
      { businessId: ctx.business.id, userId: ctx.user.id, allowNegative: false },
      {
        productId: input.productId,
        storeId,
        warehouseId: input.warehouseId,
        quantity: dec(input.quantity),
        unitCost: dec(input.unitCost),
      },
    );

    await auditEvent(
      ctx,
      {
        event: "OpeningStockCreated",
        moduleSlug: "inventory",
        entityType: "product",
        entityId: input.productId,
        summary: `Opening stock ${dec(input.quantity)} recorded`,
        payload: { quantity: dec(input.quantity), unit_cost: dec(input.unitCost) },
      },
      tx,
    );
  });
}
