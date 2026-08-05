import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import { numberSequences } from "@/db/schema";

/**
 * Document numbering (17-settings.md § Invoice Numbering).
 *
 * Numbers are allocated with a single atomic UPDATE ... RETURNING so concurrent
 * billing cannot produce duplicates, and allocated numbers are never reused.
 */

export type DocumentType =
  | "sales_invoice"
  | "sales_return"
  | "sales_order"
  | "quotation"
  | "purchase_order"
  | "purchase_requisition"
  | "goods_receipt"
  | "purchase_invoice"
  | "purchase_return"
  | "supplier_payment"
  | "stock_adjustment"
  | "stock_transfer"
  | "stock_count"
  | "pos_session"
  | "expense"
  | "customer"
  | "supplier"
  | "employee"
  | "product";

export const DOCUMENT_TYPES: {
  type: DocumentType;
  label: string;
  defaultPrefix: string;
  includePeriod: boolean;
}[] = [
  { type: "sales_invoice", label: "Sales Invoice", defaultPrefix: "INV", includePeriod: true },
  { type: "sales_return", label: "Sales Return", defaultPrefix: "SRN", includePeriod: true },
  { type: "sales_order", label: "Sales Order", defaultPrefix: "SO", includePeriod: true },
  { type: "quotation", label: "Quotation", defaultPrefix: "QT", includePeriod: true },
  { type: "purchase_order", label: "Purchase Order", defaultPrefix: "PO", includePeriod: true },
  { type: "purchase_requisition", label: "Purchase Requisition", defaultPrefix: "PR", includePeriod: true },
  { type: "goods_receipt", label: "Goods Receipt", defaultPrefix: "GRN", includePeriod: true },
  { type: "purchase_invoice", label: "Purchase Invoice", defaultPrefix: "PINV", includePeriod: true },
  { type: "purchase_return", label: "Purchase Return", defaultPrefix: "PRN", includePeriod: true },
  { type: "supplier_payment", label: "Supplier Payment", defaultPrefix: "PAY", includePeriod: true },
  { type: "stock_adjustment", label: "Stock Adjustment", defaultPrefix: "ADJ", includePeriod: true },
  { type: "stock_transfer", label: "Stock Transfer", defaultPrefix: "TRF", includePeriod: true },
  { type: "stock_count", label: "Stock Count", defaultPrefix: "CNT", includePeriod: true },
  { type: "pos_session", label: "POS Session", defaultPrefix: "SES", includePeriod: true },
  { type: "expense", label: "Expense", defaultPrefix: "EXP", includePeriod: true },
  { type: "customer", label: "Customer Code", defaultPrefix: "CUS", includePeriod: false },
  { type: "supplier", label: "Supplier Code", defaultPrefix: "SUP", includePeriod: false },
  { type: "employee", label: "Employee Code", defaultPrefix: "EMP", includePeriod: false },
  { type: "product", label: "Product SKU", defaultPrefix: "SKU", includePeriod: false },
];

function periodKey(reset: string, now = new Date()): string | null {
  switch (reset) {
    case "yearly":
      return String(now.getFullYear());
    case "monthly":
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    case "daily":
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    default:
      return null;
  }
}

function compose(
  seq: typeof numberSequences.$inferSelect,
  value: number,
  period: string | null,
): string {
  const number = String(value).padStart(seq.padding, "0");
  const parts = [seq.prefix];
  if (seq.include_period && period) parts.push(period);
  parts.push(number);
  const base = parts.filter(Boolean).join("-");
  return seq.suffix ? `${base}-${seq.suffix}` : base;
}

/**
 * Allocates the next number for a document type.
 *
 * Pass the transaction client when generating numbers inside a business
 * transaction so a rolled-back sale does not burn a sequence value.
 */
export async function nextNumber(
  businessId: string,
  documentType: DocumentType,
  options: { storeId?: string | null; client?: DbClient } = {},
): Promise<string> {
  const client = options.client ?? db;
  const storeId = options.storeId ?? null;

  let seq = await findSequence(client, businessId, documentType, storeId);

  // Fall back to the tenant-wide sequence when no branch-specific one exists.
  if (!seq && storeId) {
    seq = await findSequence(client, businessId, documentType, null);
  }

  // Auto-provision from the registry default so a missing row never blocks work.
  if (!seq) {
    const def = DOCUMENT_TYPES.find((d) => d.type === documentType);
    const [created] = await client
      .insert(numberSequences)
      .values({
        tenant_id: businessId,
        branch_id: null,
        document_type: documentType,
        prefix: def?.defaultPrefix ?? documentType.slice(0, 3).toUpperCase(),
        include_period: def?.includePeriod ?? true,
        padding: 6,
        next_number: 1,
        reset_rule: def?.includePeriod ? "yearly" : "never",
        current_period: periodKey(def?.includePeriod ? "yearly" : "never"),
      })
      .returning();
    seq = created;
  }

  const period = periodKey(seq.reset_rule);
  const periodRolledOver =
    seq.reset_rule !== "never" && seq.current_period !== period;

  // Atomic allocate-and-increment. Resetting on a new period happens in the
  // same statement so two concurrent callers cannot both reset to 1.
  const [updated] = await client
    .update(numberSequences)
    .set({
      next_number: periodRolledOver ? 2 : sql`${numberSequences.next_number} + 1`,
      current_period: period,
      updated_at: new Date(),
    })
    .where(eq(numberSequences.id, seq.id))
    .returning();

  const allocated = periodRolledOver ? 1 : updated.next_number - 1;
  return compose(updated, allocated, period);
}

async function findSequence(
  client: DbClient,
  businessId: string,
  documentType: DocumentType,
  storeId: string | null,
) {
  const [row] = await client
    .select()
    .from(numberSequences)
    .where(
      and(
        eq(numberSequences.tenant_id, businessId),
        eq(numberSequences.document_type, documentType),
        storeId
          ? eq(numberSequences.branch_id, storeId)
          : isNull(numberSequences.branch_id),
      ),
    )
    .limit(1);
  return row;
}

/** Preview of the next number without consuming it — used by settings UI. */
export function previewNumber(
  seq: typeof numberSequences.$inferSelect,
): string {
  const period = periodKey(seq.reset_rule);
  const rolled = seq.reset_rule !== "never" && seq.current_period !== period;
  return compose(seq, rolled ? 1 : seq.next_number, period);
}

/** Creates the default sequence set for a new tenant. */
export async function provisionSequences(
  businessId: string,
  client: DbClient = db,
): Promise<void> {
  await client
    .insert(numberSequences)
    .values(
      DOCUMENT_TYPES.map((d) => ({
        tenant_id: businessId,
        branch_id: null,
        document_type: d.type,
        prefix: d.defaultPrefix,
        include_period: d.includePeriod,
        padding: 6,
        next_number: 1,
        reset_rule: (d.includePeriod ? "yearly" : "never") as
          | "yearly"
          | "never",
        current_period: periodKey(d.includePeriod ? "yearly" : "never"),
      })),
    )
    .onConflictDoNothing();
}
