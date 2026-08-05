/**
 * Trading partners — customers (11-customers.md) and suppliers (12-suppliers.md).
 * Both carry running balances maintained by the transaction services.
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

import {
  actorColumns,
  addressTypeEnum,
  customerTypeEnum,
  money,
  partnerStatusEnum,
  pk,
  qty,
  rate,
  softDelete,
  supplierTypeEnum,
  timestamps,
} from "./_shared";
import { tenants } from "./admin";
import { branches } from "./organization";
import { products } from "./catalog";

/* ------------------------------------------------------------------------- */
/* Customer groups                                                           */
/* ------------------------------------------------------------------------- */

export const customerGroups = pgTable(
  "customer_groups",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Blanket discount applied to this group at billing time. */
    discount_percent: rate("discount_percent").notNull().default("0"),
    /** Prefer the wholesale price column for this group. */
    use_wholesale_price: boolean("use_wholesale_price").notNull().default(false),
    is_default: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customer_groups_tenant_name_key").on(t.tenant_id, t.name),
  ],
);

/* ------------------------------------------------------------------------- */
/* Customers                                                                 */
/* ------------------------------------------------------------------------- */

export const customers = pgTable(
  "customers",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    code: text("code").notNull(),
    name: text("name").notNull(),
    company_name: text("company_name"),
    type: customerTypeEnum("type").notNull().default("retail"),
    group_id: uuid("group_id").references(() => customerGroups.id, {
      onDelete: "set null",
    }),

    phone: text("phone"),
    email: text("email"),
    tax_number: text("tax_number"),
    registration_number: text("registration_number"),
    date_of_birth: timestamp("date_of_birth", { withTimezone: false }),

    /** Credit control. */
    credit_limit: money("credit_limit").notNull().default("0"),
    /** Positive = customer owes the business. */
    outstanding_balance: money("outstanding_balance").notNull().default("0"),
    payment_terms_days: integer("payment_terms_days").notNull().default(0),

    /** Loyalty balances. */
    loyalty_points: qty("loyalty_points").notNull().default("0"),
    loyalty_points_earned: qty("loyalty_points_earned").notNull().default("0"),
    loyalty_points_redeemed: qty("loyalty_points_redeemed")
      .notNull()
      .default("0"),

    /** Store credit available as a payment method. */
    store_credit: money("store_credit").notNull().default("0"),

    status: partnerStatusEnum("status").notNull().default("active"),
    /** The auto-provisioned walk-in customer cannot be deleted. */
    is_walk_in: boolean("is_walk_in").notNull().default(false),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    note: text("note"),

    /** Denormalised analytics, refreshed on sale completion. */
    total_purchases: money("total_purchases").notNull().default("0"),
    purchase_count: integer("purchase_count").notNull().default(0),
    last_purchase_at: timestamp("last_purchase_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("customers_tenant_code_key").on(t.tenant_id, t.code),
    index("customers_tenant_phone_idx").on(t.tenant_id, t.phone),
    index("customers_tenant_name_idx").on(t.tenant_id, t.name),
    index("customers_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    type: addressTypeEnum("type").notNull().default("billing"),
    label: text("label"),
    contact_name: text("contact_name"),
    phone: text("phone"),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),
    country: text("country"),
    is_default: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customer_id)],
);

export const customerNotes = pgTable(
  "customer_notes",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** call | sms | email | whatsapp | visit | complaint | note */
    kind: text("kind").notNull().default("note"),
    body: text("body").notNull(),
    ...timestamps,
    ...actorColumns,
  },
  (t) => [index("customer_notes_customer_idx").on(t.customer_id)],
);

/** Loyalty movements — reversible on refunds. */
export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Signed: positive earned, negative redeemed/reversed. */
    points: qty("points").notNull(),
    balance_after: qty("balance_after").notNull(),
    /** earn | redeem | reverse | expire | manual */
    kind: text("kind").notNull(),
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid("created_by"),
  },
  (t) => [index("loyalty_transactions_customer_idx").on(t.customer_id)],
);

/** Receivable ledger — every credit sale and settlement. */
export const customerLedger = pgTable(
  "customer_ledger",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customer_id: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    /** Positive = debit (customer owes more), negative = credit (payment). */
    amount: money("amount").notNull(),
    balance_after: money("balance_after").notNull(),
    /** invoice | payment | refund | adjustment | opening */
    kind: text("kind").notNull(),
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    reference_number: text("reference_number"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid("created_by"),
  },
  (t) => [
    index("customer_ledger_customer_idx").on(t.customer_id, t.created_at),
    index("customer_ledger_tenant_idx").on(t.tenant_id, t.created_at),
  ],
);

/* ------------------------------------------------------------------------- */
/* Suppliers                                                                 */
/* ------------------------------------------------------------------------- */

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    code: text("code").notNull(),
    company_name: text("company_name").notNull(),
    contact_person: text("contact_person"),
    type: supplierTypeEnum("type").notNull().default("distributor"),

    phone: text("phone"),
    email: text("email"),
    website: text("website"),

    tax_number: text("tax_number"),
    registration_number: text("registration_number"),
    payment_terms: text("payment_terms"),
    credit_days: integer("credit_days").notNull().default(0),

    /** Positive = business owes the supplier. */
    outstanding_balance: money("outstanding_balance").notNull().default("0"),

    /** Performance. */
    rating: rate("rating").notNull().default("0"),
    average_lead_time_days: integer("average_lead_time_days"),
    on_time_delivery_rate: rate("on_time_delivery_rate"),

    status: partnerStatusEnum("status").notNull().default("active"),
    note: text("note"),

    total_purchases: money("total_purchases").notNull().default("0"),
    purchase_count: integer("purchase_count").notNull().default(0),
    last_purchase_at: timestamp("last_purchase_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("suppliers_tenant_code_key").on(t.tenant_id, t.code),
    index("suppliers_tenant_name_idx").on(t.tenant_id, t.company_name),
    index("suppliers_tenant_status_idx").on(t.tenant_id, t.status),
  ],
);

export const supplierContacts = pgTable(
  "supplier_contacts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    designation: text("designation"),
    phone: text("phone"),
    email: text("email"),
    is_primary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("supplier_contacts_supplier_idx").on(t.supplier_id)],
);

export const supplierAddresses = pgTable(
  "supplier_addresses",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    type: addressTypeEnum("type").notNull().default("head_office"),
    line1: text("line1"),
    line2: text("line2"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),
    country: text("country"),
    is_default: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("supplier_addresses_supplier_idx").on(t.supplier_id)],
);

/** Product ↔ supplier mapping with purchasing terms. */
export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    product_id: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplier_sku: text("supplier_sku"),
    supplier_product_name: text("supplier_product_name"),
    purchase_price: money("purchase_price").notNull().default("0"),
    minimum_order_quantity: qty("minimum_order_quantity").notNull().default("1"),
    lead_time_days: integer("lead_time_days"),
    is_preferred: boolean("is_preferred").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_products_key").on(t.supplier_id, t.product_id),
    index("supplier_products_product_idx").on(t.product_id),
  ],
);

export const supplierContracts = pgTable(
  "supplier_contracts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    contract_number: text("contract_number").notNull(),
    effective_from: timestamp("effective_from", { withTimezone: false }),
    effective_to: timestamp("effective_to", { withTimezone: false }),
    terms: text("terms"),
    attachment_url: text("attachment_url"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
    ...actorColumns,
  },
  (t) => [index("supplier_contracts_supplier_idx").on(t.supplier_id)],
);

/** Payable ledger — every purchase invoice and settlement. */
export const supplierLedger = pgTable(
  "supplier_ledger",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplier_id: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    /** Positive = payable increases, negative = payment made. */
    amount: money("amount").notNull(),
    balance_after: money("balance_after").notNull(),
    /** invoice | payment | debit_note | adjustment | opening */
    kind: text("kind").notNull(),
    reference_type: text("reference_type"),
    reference_id: uuid("reference_id"),
    reference_number: text("reference_number"),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    created_by: uuid("created_by"),
  },
  (t) => [
    index("supplier_ledger_supplier_idx").on(t.supplier_id, t.created_at),
    index("supplier_ledger_tenant_idx").on(t.tenant_id, t.created_at),
  ],
);
