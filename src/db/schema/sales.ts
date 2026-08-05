/**
 * Sales and POS — quotation → order → invoice → payment → return.
 * A completed invoice reduces inventory immediately (10-sales-pos.md).
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorColumns,
  discountTypeEnum,
  money,
  paymentMethodEnum,
  paymentStatusEnum,
  pk,
  qty,
  quotationStatusEnum,
  rate,
  returnStatusEnum,
  saleStatusEnum,
  salesChannelEnum,
  timestamps,
} from "./_shared";
import { tenants } from "./admin";
import { branches, users, warehouses } from "./organization";
import { products, taxGroups } from "./catalog";
import { customers } from "./partners";
import { inventoryBatches } from "./inventory";

/* ------------------------------------------------------------------------- */
/* Quotations — no inventory impact                                          */
/* ------------------------------------------------------------------------- */

export const quotations = pgTable(
  "quotations",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),

    quotation_number: text("quotation_number").notNull(),
    status: quotationStatusEnum("status").notNull().default("draft"),
    quotation_date: timestamp("quotation_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    valid_until: timestamp("valid_until", { withTimezone: false }),

    subtotal: money("subtotal").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),

    note: text("note"),
    converted_invoice_id: uuid("converted_invoice_id"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("quotations_number_key").on(t.tenant_id, t.quotation_number),
    index("quotations_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const quotationItems = pgTable(
  "quotation_items",
  {
    id: pk(),
    quotation_id: uuid("quotation_id")
      .notNull()
      .references(() => quotations.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    product_name: text("product_name").notNull(),
    product_sku: text("product_sku").notNull(),
    quantity: qty("quantity").notNull(),
    unit_price: money("unit_price").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_rate: rate("tax_rate").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    line_total: money("line_total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("quotation_items_parent_idx").on(t.quotation_id)],
);

/* ------------------------------------------------------------------------- */
/* Sales orders — optionally reserve stock before invoicing                   */
/* ------------------------------------------------------------------------- */

export const salesOrders = pgTable(
  "sales_orders",
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
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),

    order_number: text("order_number").notNull(),
    /** draft | confirmed | reserved | invoiced | cancelled */
    status: text("status").notNull().default("draft"),
    order_date: timestamp("order_date", { withTimezone: false })
      .notNull()
      .defaultNow(),
    delivery_date: timestamp("delivery_date", { withTimezone: false }),

    subtotal: money("subtotal").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),

    reserve_stock: boolean("reserve_stock").notNull().default(false),
    note: text("note"),
    invoice_id: uuid("invoice_id"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("sales_orders_number_key").on(t.tenant_id, t.order_number),
    index("sales_orders_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const salesOrderItems = pgTable(
  "sales_order_items",
  {
    id: pk(),
    order_id: uuid("order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    product_name: text("product_name").notNull(),
    product_sku: text("product_sku").notNull(),
    quantity: qty("quantity").notNull(),
    unit_price: money("unit_price").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_rate: rate("tax_rate").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    line_total: money("line_total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("sales_order_items_parent_idx").on(t.order_id)],
);

/* ------------------------------------------------------------------------- */
/* POS sessions (cash drawer / shift reconciliation)                         */
/* ------------------------------------------------------------------------- */

export const posSessions = pgTable(
  "pos_sessions",
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
    cashier_id: uuid("cashier_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),

    session_number: text("session_number").notNull(),
    opened_at: timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closed_at: timestamp("closed_at", { withTimezone: true }),

    opening_cash: money("opening_cash").notNull().default("0"),
    closing_cash: money("closing_cash"),
    /** Sum of cash-method payments recorded during the session. */
    expected_cash: money("expected_cash").notNull().default("0"),
    cash_variance: money("cash_variance"),

    total_sales: money("total_sales").notNull().default("0"),
    total_refunds: money("total_refunds").notNull().default("0"),
    transaction_count: integer("transaction_count").notNull().default(0),

    note: text("note"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("pos_sessions_number_key").on(t.tenant_id, t.session_number),
    index("pos_sessions_cashier_idx").on(t.cashier_id),
    index("pos_sessions_open_idx").on(t.tenant_id, t.closed_at),
  ],
);

/* ------------------------------------------------------------------------- */
/* Sales invoices — immutable once completed                                 */
/* ------------------------------------------------------------------------- */

export const salesInvoices = pgTable(
  "sales_invoices",
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
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    order_id: uuid("order_id").references(() => salesOrders.id, {
      onDelete: "set null",
    }),
    pos_session_id: uuid("pos_session_id").references(() => posSessions.id, {
      onDelete: "set null",
    }),

    invoice_number: text("invoice_number").notNull(),
    status: saleStatusEnum("status").notNull().default("completed"),
    channel: salesChannelEnum("channel").notNull().default("pos_counter"),

    invoice_date: timestamp("invoice_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    due_date: timestamp("due_date", { withTimezone: false }),

    /** Snapshot of the customer for receipt reprints. */
    customer_name: text("customer_name"),
    customer_phone: text("customer_phone"),

    subtotal: money("subtotal").notNull().default("0"),
    discount_type: discountTypeEnum("discount_type").notNull().default("none"),
    discount_value: money("discount_value").notNull().default("0"),
    discount_amount: money("discount_amount").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    round_off: money("round_off").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),

    paid_amount: money("paid_amount").notNull().default("0"),
    /** grand_total - paid_amount; drives customer receivables. */
    balance_amount: money("balance_amount").notNull().default("0"),
    refunded_amount: money("refunded_amount").notNull().default("0"),
    payment_status: paymentStatusEnum("payment_status")
      .notNull()
      .default("unpaid"),

    /** Cost of goods at time of sale — enables exact profit reporting. */
    total_cost: money("total_cost").notNull().default("0"),
    gross_profit: money("gross_profit").notNull().default("0"),

    loyalty_points_earned: qty("loyalty_points_earned").notNull().default("0"),
    loyalty_points_redeemed: qty("loyalty_points_redeemed")
      .notNull()
      .default("0"),

    cashier_id: uuid("cashier_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    cancel_reason: text("cancel_reason"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("sales_invoices_number_key").on(t.tenant_id, t.invoice_number),
    index("sales_invoices_tenant_date_idx").on(t.tenant_id, t.invoice_date),
    index("sales_invoices_customer_idx").on(t.customer_id),
    index("sales_invoices_branch_date_idx").on(t.branch_id, t.invoice_date),
    index("sales_invoices_status_idx").on(t.tenant_id, t.payment_status),
    index("sales_invoices_cashier_idx").on(t.cashier_id),
  ],
);

export const salesInvoiceItems = pgTable(
  "sales_invoice_items",
  {
    id: pk(),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    batch_id: uuid("batch_id").references(() => inventoryBatches.id, {
      onDelete: "set null",
    }),

    product_name: text("product_name").notNull(),
    product_sku: text("product_sku").notNull(),

    quantity: qty("quantity").notNull(),
    quantity_returned: qty("quantity_returned").notNull().default("0"),

    unit_price: money("unit_price").notNull().default("0"),
    /** Unit cost captured at sale time for profit reporting. */
    unit_cost: money("unit_cost").notNull().default("0"),

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

    ...timestamps,
  },
  (t) => [
    index("sales_invoice_items_parent_idx").on(t.invoice_id),
    index("sales_invoice_items_product_idx").on(t.product_id),
  ],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),

    method: paymentMethodEnum("method").notNull(),
    amount: money("amount").notNull(),
    /** Cash tendered / change for POS receipts. */
    tendered_amount: money("tendered_amount"),
    change_amount: money("change_amount"),
    reference: text("reference"),
    /** Negative amounts represent refunds against this invoice. */
    is_refund: boolean("is_refund").notNull().default(false),
    paid_at: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    index("sale_payments_invoice_idx").on(t.invoice_id),
    index("sale_payments_tenant_date_idx").on(t.tenant_id, t.paid_at),
    index("sale_payments_method_idx").on(t.tenant_id, t.method),
  ],
);

/* ------------------------------------------------------------------------- */
/* Sales returns                                                             */
/* ------------------------------------------------------------------------- */

export const salesReturns = pgTable(
  "sales_returns",
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
    invoice_id: uuid("invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "restrict" }),
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),

    return_number: text("return_number").notNull(),
    status: returnStatusEnum("status").notNull().default("completed"),
    /** damaged | wrong_product | defective | exchange | customer_request */
    reason: text("reason").notNull().default("customer_request"),
    return_date: timestamp("return_date", { withTimezone: true })
      .notNull()
      .defaultNow(),

    subtotal: money("subtotal").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    grand_total: money("grand_total").notNull().default("0"),
    /** How the customer was made whole. */
    refund_method: paymentMethodEnum("refund_method").notNull().default("cash"),
    refund_amount: money("refund_amount").notNull().default("0"),
    /** Stock returned to sellable inventory vs written off as damaged. */
    restock: boolean("restock").notNull().default(true),

    note: text("note"),
    posted_at: timestamp("posted_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("sales_returns_number_key").on(t.tenant_id, t.return_number),
    index("sales_returns_invoice_idx").on(t.invoice_id),
    index("sales_returns_tenant_date_idx").on(t.tenant_id, t.return_date),
  ],
);

export const salesReturnItems = pgTable(
  "sales_return_items",
  {
    id: pk(),
    return_id: uuid("return_id")
      .notNull()
      .references(() => salesReturns.id, { onDelete: "cascade" }),
    invoice_item_id: uuid("invoice_item_id").references(
      () => salesInvoiceItems.id,
      { onDelete: "set null" },
    ),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: qty("quantity").notNull(),
    unit_price: money("unit_price").notNull().default("0"),
    unit_cost: money("unit_cost").notNull().default("0"),
    tax_rate: rate("tax_rate").notNull().default("0"),
    tax_amount: money("tax_amount").notNull().default("0"),
    line_total: money("line_total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("sales_return_items_parent_idx").on(t.return_id)],
);

/* ------------------------------------------------------------------------- */
/* Gift cards — behave as a payment method                                   */
/* ------------------------------------------------------------------------- */

export const giftCards = pgTable(
  "gift_cards",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    initial_balance: money("initial_balance").notNull().default("0"),
    /** Never allowed to go negative. */
    balance: money("balance").notNull().default("0"),
    customer_id: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    issued_at: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...actorColumns,
  },
  (t) => [uniqueIndex("gift_cards_tenant_code_key").on(t.tenant_id, t.code)],
);

export const giftCardTransactions = pgTable(
  "gift_card_transactions",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    gift_card_id: uuid("gift_card_id")
      .notNull()
      .references(() => giftCards.id, { onDelete: "cascade" }),
    /** Signed: positive top-up, negative redemption. */
    amount: money("amount").notNull(),
    balance_after: money("balance_after").notNull(),
    /** issue | recharge | redeem | reverse */
    kind: text("kind").notNull(),
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid("created_by"),
  },
  (t) => [index("gift_card_transactions_card_idx").on(t.gift_card_id)],
);
