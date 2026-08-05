/**
 * Purchasing — requisition → order → goods receipt → invoice → payment.
 * Inventory only moves on goods receipt (09-purchases.md).
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
  approvalStatusEnum,
  discountTypeEnum,
  money,
  paymentMethodEnum,
  paymentStatusEnum,
  pk,
  purchaseOrderStatusEnum,
  qty,
  rate,
  returnStatusEnum,
  timestamps,
} from "./_shared";
import { tenants } from "./admin";
import { branches, users, warehouses } from "./organization";
import { products, taxGroups } from "./catalog";
import { suppliers } from "./partners";
import { inventoryBatches } from "./inventory";

/* ------------------------------------------------------------------------- */
/* Requisitions — internal request, no inventory impact                      */
/* ------------------------------------------------------------------------- */

export const purchaseRequisitions = pgTable(
  "purchase_requisitions",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),

    requisition_number: text("requisition_number").notNull(),
    /** draft | pending | approved | rejected | converted | cancelled */
    status: text("status").notNull().default("draft"),
    required_by: timestamp("required_by", { withTimezone: false }),
    note: text("note"),

    requested_by: uuid("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("purchase_requisitions_number_key").on(
      t.tenant_id,
      t.requisition_number,
    ),
    index("purchase_requisitions_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const purchaseRequisitionItems = pgTable(
  "purchase_requisition_items",
  {
    id: pk(),
    requisition_id: uuid("requisition_id")
      .notNull()
      .references(() => purchaseRequisitions.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: qty("quantity").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("purchase_requisition_items_parent_idx").on(t.requisition_id)],
);

/* ------------------------------------------------------------------------- */
/* Purchase orders                                                           */
/* ------------------------------------------------------------------------- */

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    /** Where received goods will land. */
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    requisition_id: uuid("requisition_id").references(
      () => purchaseRequisitions.id,
      { onDelete: "set null" },
    ),

    order_number: text("order_number").notNull(),
    status: purchaseOrderStatusEnum("status").notNull().default("draft"),
    approval_status: approvalStatusEnum("approval_status")
      .notNull()
      .default("not_required"),

    order_date: timestamp("order_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    expected_date: timestamp("expected_date", { withTimezone: false }),
    payment_terms: text("payment_terms"),

    /* Money — computed by the purchase service, never by the client. */
    subtotal: money("subtotal").notNull().default("0"),
    discount_type: discountTypeEnum("discount_type").notNull().default("none"),
    discount_value: money("discount_value").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    shipping_amount: money("shipping_amount").notNull().default("0"),
    other_charges: money("other_charges").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),

    note: text("note"),
    attachments: jsonb("attachments")
      .$type<{ name: string; url: string }[]>()
      .notNull()
      .default([]),

    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    cancel_reason: text("cancel_reason"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("purchase_orders_number_key").on(t.tenant_id, t.order_number),
    index("purchase_orders_tenant_status_idx").on(t.tenant_id, t.status),
    index("purchase_orders_supplier_idx").on(t.supplier_id),
    index("purchase_orders_tenant_date_idx").on(t.tenant_id, t.order_date),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: pk(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),

    /** Snapshot — historical documents must not shift when the product changes. */
    product_name: text("product_name").notNull(),
    product_sku: text("product_sku").notNull(),

    quantity_ordered: qty("quantity_ordered").notNull(),
    quantity_received: qty("quantity_received").notNull().default("0"),
    quantity_returned: qty("quantity_returned").notNull().default("0"),

    unit_price: money("unit_price").notNull().default("0"),
    discount_type: discountTypeEnum("discount_type").notNull().default("none"),
    discount_value: money("discount_value").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),

    tax_group_id: uuid("tax_group_id").references(() => taxGroups.id, {
      onDelete: "set null",
    }),
    tax_rate: rate("tax_rate").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),

    line_subtotal: money("line_subtotal").notNull().default("0"),
    line_total: money("line_total").notNull().default("0"),

    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("purchase_order_items_parent_idx").on(t.order_id),
    index("purchase_order_items_product_idx").on(t.product_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Goods receipt notes — the only inbound inventory trigger                   */
/* ------------------------------------------------------------------------- */

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    order_id: uuid("order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),

    receipt_number: text("receipt_number").notNull(),
    receipt_date: timestamp("receipt_date", { withTimezone: false })
      .notNull()
      .defaultNow(),

    /** Supplier's delivery reference. */
    challan_number: text("challan_number"),
    note: text("note"),

    total_cost: money("total_cost").notNull().default("0"),
    /** Set once ledger movements have been written. */
    posted_at: timestamp("posted_at", { withTimezone: true }),

    received_by: uuid("received_by").references(() => users.id, {
      onDelete: "set null",
    }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("goods_receipts_number_key").on(t.tenant_id, t.receipt_number),
    index("goods_receipts_order_idx").on(t.order_id),
    index("goods_receipts_tenant_date_idx").on(t.tenant_id, t.receipt_date),
  ],
);

export const goodsReceiptItems = pgTable(
  "goods_receipt_items",
  {
    id: pk(),
    receipt_id: uuid("receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    order_item_id: uuid("order_item_id").references(
      () => purchaseOrderItems.id,
      { onDelete: "set null" },
    ),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),

    quantity_received: qty("quantity_received").notNull(),
    quantity_rejected: qty("quantity_rejected").notNull().default("0"),
    /** Landed unit cost including apportioned charges. */
    unit_cost: money("unit_cost").notNull().default("0"),
    total_cost: money("total_cost").notNull().default("0"),

    batch_number: text("batch_number"),
    expires_on: timestamp("expires_on", { withTimezone: false }),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("goods_receipt_items_parent_idx").on(t.receipt_id)],
);

/* ------------------------------------------------------------------------- */
/* Supplier invoices and payments                                            */
/* ------------------------------------------------------------------------- */

export const purchaseInvoices = pgTable(
  "purchase_invoices",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    order_id: uuid("order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),
    receipt_id: uuid("receipt_id").references(() => goodsReceipts.id, {
      onDelete: "set null",
    }),

    /** Supplier's own invoice number. */
    supplier_invoice_number: text("supplier_invoice_number").notNull(),
    /** Our internal reference. */
    invoice_number: text("invoice_number").notNull(),

    invoice_date: timestamp("invoice_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    due_date: timestamp("due_date", { withTimezone: false }),

    subtotal: money("subtotal").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    freight_amount: money("freight_amount").notNull().default("0"),
    other_charges: money("other_charges").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),
    paid_amount: money("paid_amount").notNull().default("0"),
    balance_amount: money("balance_amount").notNull().default("0"),

    payment_status: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),
    attachment_url: text("attachment_url"),
    note: text("note"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("purchase_invoices_number_key").on(
      t.tenant_id,
      t.invoice_number,
    ),
    index("purchase_invoices_supplier_idx").on(t.supplier_id),
    index("purchase_invoices_status_idx").on(t.tenant_id, t.payment_status),
  ],
);

export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    invoice_id: uuid("invoice_id").references(() => purchaseInvoices.id, {
      onDelete: "set null",
    }),

    payment_number: text("payment_number").notNull(),
    method: paymentMethodEnum("method").notNull().default("bank_transfer"),
    amount: money("amount").notNull(),
    reference: text("reference"),
    paid_at: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("supplier_payments_number_key").on(
      t.tenant_id,
      t.payment_number,
    ),
    index("supplier_payments_supplier_idx").on(t.supplier_id),
    index("supplier_payments_invoice_idx").on(t.invoice_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Purchase returns (debit notes)                                            */
/* ------------------------------------------------------------------------- */

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    warehouse_id: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "restrict" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    order_id: uuid("order_id").references(() => purchaseOrders.id, {
      onDelete: "set null",
    }),

    return_number: text("return_number").notNull(),
    status: returnStatusEnum("status").notNull().default("draft"),
    /** damaged | wrong_item | expired | quality | excess */
    reason: text("reason").notNull().default("damaged"),

    return_date: timestamp("return_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    subtotal: money("subtotal").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),

    /** Debit note reference issued to the supplier. */
    debit_note_number: text("debit_note_number"),
    note: text("note"),

    approved_by: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    posted_at: timestamp("posted_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("purchase_returns_number_key").on(t.tenant_id, t.return_number),
    index("purchase_returns_supplier_idx").on(t.supplier_id),
  ],
);

export const purchaseReturnItems = pgTable(
  "purchase_return_items",
  {
    id: pk(),
    return_id: uuid("return_id")
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),
    quantity: qty("quantity").notNull(),
    unit_cost: money("unit_cost").notNull().default("0"),
    tax_rate: rate("tax_rate").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    line_total: money("line_total").notNull().default("0"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("purchase_return_items_parent_idx").on(t.return_id)],
);

/* ------------------------------------------------------------------------- */
/* Expenses (finance module)                                                 */
/* ------------------------------------------------------------------------- */

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("expense_categories_tenant_name_key").on(t.tenant_id, t.name),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    category_id: uuid("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),

    expense_number: text("expense_number").notNull(),
    title: text("title").notNull(),
    expense_date: timestamp("expense_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    amount: money("amount").notNull(),
    tax_amount: money("tax_amount").notNull().default("0"),
    method: paymentMethodEnum("method").notNull().default("cash"),
    reference: text("reference"),
    note: text("note"),
    attachment_url: text("attachment_url"),

    /* Approval (20-workflows.md § Expense Approval). Expenses below the
       configured threshold are recorded as `not_required` and never queue. */
    approval_status: approvalStatusEnum("approval_status")
      .notNull()
      .default("not_required"),
    approved_by: uuid("approved_by"),
    approved_at: timestamp("approved_at", { withTimezone: true }),
    rejection_reason: text("rejection_reason"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("expenses_number_key").on(t.tenant_id, t.expense_number),
    index("expenses_tenant_date_idx").on(t.tenant_id, t.expense_date),
  ],
);
