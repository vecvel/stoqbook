import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import * as schema from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";

/**
 * Logical backup (17-settings.md § Backup).
 *
 * This produces a JSON snapshot of the business's own rows. It is a data
 * export, not a substitute for `pg_dump`: it carries no indexes, sequences or
 * enum definitions, so restoring it requires an empty schema of the same
 * version. Restore is deliberately not offered in the UI — replaying rows
 * piecemeal could leave the inventory and customer ledgers disagreeing with
 * their balances, which is exactly what the ledger design exists to prevent.
 */

/** Every business-owned table, in an order that respects foreign keys. */
const BACKUP_TABLES = [
  "tenants",
  "organizations",
  "branches",
  "warehouses",
  "roles",
  "rolePermissions",
  "users",
  "userRoles",
  "userBranches",
  "departments",
  "designations",
  "shifts",
  "leaveTypes",
  "attendance",
  "leaveRequests",
  "units",
  "taxGroups",
  "categories",
  "brands",
  "products",
  "productOptions",
  "productStorePrices",
  "customerGroups",
  "customers",
  "customerAddresses",
  "customerNotes",
  "customerLedger",
  "loyaltyTransactions",
  "suppliers",
  "supplierAddresses",
  "supplierContacts",
  "supplierContracts",
  "supplierProducts",
  "supplierLedger",
  "supplierPayments",
  "inventoryLevels",
  "inventoryMovements",
  "inventoryBatches",
  "stockReservations",
  "stockAdjustments",
  "stockAdjustmentItems",
  "stockTransfers",
  "stockTransferItems",
  "stockCounts",
  "stockCountItems",
  "purchaseRequisitions",
  "purchaseRequisitionItems",
  "purchaseOrders",
  "purchaseOrderItems",
  "goodsReceipts",
  "goodsReceiptItems",
  "purchaseInvoices",
  "purchaseReturns",
  "purchaseReturnItems",
  "expenseCategories",
  "expenses",
  "quotations",
  "quotationItems",
  "salesOrders",
  "salesOrderItems",
  "salesInvoices",
  "salesInvoiceItems",
  "salePayments",
  "salesReturns",
  "salesReturnItems",
  "posSessions",
  "giftCards",
  "giftCardTransactions",
  "numberSequences",
  "settings",
  "settingHistory",
  "notificationRules",
  "notificationTemplates",
  "notificationPreferences",
  "notifications",
  "dashboardLayouts",
  "savedReports",
  "reportRuns",
  "licenses",
  "announcements",
  "auditLogs",
  "loginHistory",
  /* `jobs` is deliberately absent, and it is the only table that is.
     It holds work in flight, not business records. Restoring a week-old backup
     would put a week of already-delivered notifications back in the queue and
     send every one of them again. Losing the queue on a restore costs one sweep;
     replaying it costs the business's credibility with its own customers. */
] as const;

export interface BackupSummary {
  table: string;
  rows: number;
}

type AnyTable = { tenant_id?: unknown };

function tableByName(name: string) {
  return (schema as unknown as Record<string, unknown>)[name];
}

/** Row counts per table, for the page to show before anyone downloads. */
export async function backupSummary(
  ctx: BusinessContext,
): Promise<BackupSummary[]> {
  const out: BackupSummary[] = [];

  for (const name of BACKUP_TABLES) {
    const table = tableByName(name);
    if (!table) continue;

    const columns = table as unknown as AnyTable;
    const rows = (await db
      .select({ value: sql<number>`count(*)::int` })
      .from(table as never)
      .where(
        columns.tenant_id
          ? eq(columns.tenant_id as never, ctx.business.id as never)
          : undefined,
      )) as { value: number }[];

    out.push({ table: name, rows: Number(rows[0]?.value ?? 0) });
  }

  return out;
}

export interface BackupFile {
  format: "stoqbook-json";
  version: 1;
  businessId: string;
  businessSlug: string;
  takenAt: string;
  tables: Record<string, unknown[]>;
}

/**
 * Reads every business-owned row into one object.
 *
 * Held in memory: a single business's dataset is small by design, and streaming
 * would complicate the ordering guarantee that makes the file restorable.
 */
export async function buildBackup(
  ctx: BusinessContext,
  takenAt: Date,
): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};

  for (const name of BACKUP_TABLES) {
    const table = tableByName(name);
    if (!table) continue;

    const columns = table as unknown as AnyTable;
    tables[name] = await db
      .select()
      .from(table as never)
      .where(
        columns.tenant_id
          ? eq(columns.tenant_id as never, ctx.business.id as never)
          : undefined,
      );
  }

  return {
    format: "stoqbook-json",
    version: 1,
    businessId: ctx.business.id,
    businessSlug: ctx.business.slug,
    takenAt: takenAt.toISOString(),
    tables,
  };
}
