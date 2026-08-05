"use server";

import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/authz/guard";
import { ValidationError } from "@/lib/authz/errors";
import {
  approveStockAdjustment,
  approveStockCount,
  createStockAdjustment,
  createStockCount,
  createStockTransfer,
  dispatchStockTransfer,
  receiveStockTransfer,
  approveStockTransfer,
  recordCountedQuantities,
  setOpeningStock,
  type AdjustmentReason,
} from "@/lib/services/stock-ops";
import { reconcileLevel } from "@/lib/services/inventory";
import {
  decimalStr,
  failure,
  revalidate,
  rows,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/* -------------------------------------------------------------------------- */
/* Adjustments                                                                */
/* -------------------------------------------------------------------------- */

export async function submitAdjustment(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.adjust");

    const warehouseId = uuid(form, "warehouse_id");
    if (!warehouseId) return failure("Select a warehouse.");

    const reason = (str(form, "reason") || "counting_error") as AdjustmentReason;

    const lines = rows(form, "lines")
      .filter((r) => r.product_id && r.quantity && Number(r.quantity) !== 0)
      .map((r) => ({
        productId: r.product_id,
        quantity: r.quantity,
        note: r.note || undefined,
      }));

    if (lines.length === 0) {
      return failure("Add at least one line with a non-zero quantity.");
    }

    const result = await createStockAdjustment(ctx, {
      warehouseId,
      reason,
      lines,
      note: str(form, "note") || undefined,
    });

    revalidate("/inventory", "/inventory/adjustments", "/dashboard");
    redirect(`/inventory/adjustments/${result.adjustmentId}`);
  });
}

export async function decideAdjustment(
  adjustmentId: string,
  decision: "approved" | "rejected",
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.approve_adjustment");
    await approveStockAdjustment(ctx, adjustmentId, decision);
    revalidate(
      "/inventory",
      "/inventory/adjustments",
      `/inventory/adjustments/${adjustmentId}`,
      "/dashboard",
    );
    return success(undefined, `Adjustment ${decision}.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Opening stock                                                              */
/* -------------------------------------------------------------------------- */

export async function submitOpeningStock(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.opening_stock");

    const warehouseId = uuid(form, "warehouse_id");
    const productId = uuid(form, "product_id");
    if (!warehouseId || !productId) {
      return failure("Select a product and warehouse.");
    }

    const quantity = decimalStr(form, "quantity");
    if (Number(quantity) <= 0) {
      return failure("Opening quantity must be greater than zero.");
    }

    await setOpeningStock(ctx, {
      warehouseId,
      productId,
      quantity,
      unitCost: decimalStr(form, "unit_cost"),
    });

    revalidate("/inventory", `/products/${productId}`, "/dashboard");
    return success(undefined, "Opening stock recorded.");
  });
}

/* -------------------------------------------------------------------------- */
/* Transfers                                                                  */
/* -------------------------------------------------------------------------- */

export async function submitTransfer(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.transfer");

    const sourceWarehouseId = uuid(form, "source_warehouse_id");
    const destinationWarehouseId = uuid(form, "destination_warehouse_id");
    if (!sourceWarehouseId || !destinationWarehouseId) {
      return failure("Select both a source and destination warehouse.");
    }

    const lines = rows(form, "lines")
      .filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.product_id,
        quantity: r.quantity,
        note: r.note || undefined,
      }));

    if (lines.length === 0) return failure("Add at least one item to transfer.");

    const result = await createStockTransfer(ctx, {
      sourceWarehouseId,
      destinationWarehouseId,
      lines,
      note: str(form, "note") || undefined,
    });

    revalidate("/inventory/transfers", "/inventory");
    redirect(`/inventory/transfers/${result.transferId}`);
  });
}

export async function advanceTransfer(
  transferId: string,
  stage: "approve" | "dispatch" | "receive",
): Promise<ActionResult> {
  return runAction(async () => {
    if (stage === "approve") {
      const ctx = await requirePermission("inventory.approve_transfer");
      await approveStockTransfer(ctx, transferId);
    } else if (stage === "dispatch") {
      const ctx = await requirePermission("inventory.transfer");
      await dispatchStockTransfer(ctx, transferId);
    } else {
      const ctx = await requirePermission("inventory.receive_transfer");
      await receiveStockTransfer(ctx, transferId);
    }

    revalidate(
      "/inventory",
      "/inventory/transfers",
      `/inventory/transfers/${transferId}`,
      "/dashboard",
    );

    const labels = {
      approve: "Transfer approved.",
      dispatch: "Transfer dispatched — stock is now in transit.",
      receive: "Transfer received into destination stock.",
    };
    return success(undefined, labels[stage]);
  });
}

/* -------------------------------------------------------------------------- */
/* Physical counts                                                            */
/* -------------------------------------------------------------------------- */

export async function startStockCount(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.count");

    const warehouseId = uuid(form, "warehouse_id");
    if (!warehouseId) return failure("Select a warehouse to count.");

    const result = await createStockCount(ctx, {
      warehouseId,
      name: str(form, "name") || undefined,
    });

    if (result.lineCount === 0) {
      throw ValidationError(
        "That warehouse has no stock records to count yet.",
      );
    }

    revalidate("/inventory/counts");
    redirect(`/inventory/counts/${result.countId}`);
  });
}

export async function saveCountedQuantities(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.count");

    const countId = uuid(form, "count_id");
    if (!countId) return failure("Stock count not found.");

    // Only submitted, non-empty inputs are treated as counted.
    const counts: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      const match = key.match(/^counted\[([0-9a-f-]+)\]$/i);
      if (match && String(value).trim() !== "") {
        counts[match[1]] = String(value).trim();
      }
    }

    if (Object.keys(counts).length === 0) {
      return failure("Enter at least one counted quantity.");
    }

    await recordCountedQuantities(ctx, countId, counts);
    revalidate("/inventory/counts", `/inventory/counts/${countId}`);
    return success(undefined, "Counted quantities saved.");
  });
}

export async function finaliseStockCount(
  countId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.count");
    const result = await approveStockCount(ctx, countId);

    revalidate(
      "/inventory",
      "/inventory/counts",
      `/inventory/counts/${countId}`,
      "/inventory/adjustments",
      "/dashboard",
    );

    return success(
      undefined,
      result.varianceLines === 0
        ? "Count approved with no variance."
        : `Count approved. Adjustment ${result.adjustmentNumber} posted for ${result.varianceLines} line(s).`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Maintenance                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Rebuilds a balance from the ledger. The ledger is authoritative, so this is
 * the repair path if a balance is ever suspected of drifting.
 */
export async function reconcileStock(
  warehouseId: string,
  productId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory.audit");
    const snapshot = await reconcileLevel(ctx.business.id, warehouseId, productId);
    revalidate("/inventory", `/products/${productId}`);
    return success(
      undefined,
      `Recalculated from the ledger: ${Number(snapshot.available)} available.`,
    );
  });
}
