/**
 * Shared column builders and enums.
 *
 * Conventions (06-database-architecture.md):
 *   - tables are plural, columns are snake_case
 *   - every table has id / created_at / updated_at
 *   - business-owned tables carry tenant_id; store-aware carry store_id
 *   - money and quantity are numeric(18,4) — never floats
 *   - soft delete uses deleted_at; financial history is never deleted
 *
 * On `tenant_id` / `store_id`:
 * StoqBook serves ONE business per installation. The spec deliberately keeps
 * these structural column names so the schema stays forward-compatible if
 * multiple businesses on one server are ever needed. `tenant_id` always holds
 * the single installed business's id, and `store_id` identifies a store.
 * Everything above the database layer speaks "business" and "store".
 */
import { numeric, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";

/** Monetary amount. Stored as exact numeric, surfaced as string. */
export const money = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Stock quantity. Fractional units (kg, litre) are supported. */
export const qty = (name: string) => numeric(name, { precision: 18, scale: 4 });

/** Percentage rate, e.g. tax 18.0000 */
export const rate = (name: string) => numeric(name, { precision: 9, scale: 4 });

export const pk = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * Traceability columns for sensitive tables.
 *
 * Deliberately **not** foreign keys to `users`. A traceability column records
 * who did something, and that record has to outlive the account: a real
 * `references(users.id)` would either block deleting a departed employee or
 * cascade the history away with them. The id is resolved by lookup when a screen
 * needs a name, and shows as unknown when the account is gone — which is the
 * honest answer.
 */
export const actorColumns = {
  created_by: uuid("created_by"),
  updated_by: uuid("updated_by"),
};

export const softDelete = {
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  deleted_by: uuid("deleted_by"),
};

/* ------------------------------------------------------------------------- */
/* Admin / installation enums                                                */
/* ------------------------------------------------------------------------- */

/** Business lifecycle (02-business-structure.md § Business Status). */
export const businessStatusEnum = pgEnum("business_status", [
  "created",
  "active",
  "suspended",
  "archived",
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "pending",
  "active",
  "expired",
  "suspended",
  "cancelled",
]);

/**
 * How the licence was acquired (03-license-system.md § Billing Modes).
 * `lifetime` is the standard for a per-installation perpetual sale.
 */
export const billingModeEnum = pgEnum("billing_mode", [
  "lifetime",
  "subscription",
  "trial",
  "manual",
  "internal",
]);

export const billingCycleEnum = pgEnum("billing_cycle", [
  "monthly",
  "quarterly",
  "yearly",
  "none",
]);

export const moduleStateEnum = pgEnum("module_state", [
  "registered",
  "enabled",
  "disabled",
  "archived",
]);

/**
 * Where a module surfaces. `admin` modules appear only in the business admin
 * panel; `business` modules are the day-to-day operational ones.
 */
export const moduleVisibilityEnum = pgEnum("module_visibility", [
  "admin",
  "business",
  "both",
]);

/* ------------------------------------------------------------------------- */
/* Organisation enums                                                        */
/* ------------------------------------------------------------------------- */

export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "active",
  "suspended",
  "resigned",
  "archived",
]);

export const employmentTypeEnum = pgEnum("employment_type", [
  "permanent",
  "contract",
  "part_time",
  "intern",
  "temporary",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
  "holiday",
]);

export const leaveStatusEnum = pgEnum("leave_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

/* ------------------------------------------------------------------------- */
/* Catalogue enums                                                           */
/* ------------------------------------------------------------------------- */

export const productTypeEnum = pgEnum("product_type", [
  "physical",
  "digital",
  "service",
  "bundle",
  "composite",
  "variant_parent",
]);

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "inactive",
  "discontinued",
  "archived",
]);

export const taxModeEnum = pgEnum("tax_mode", ["inclusive", "exclusive"]);

/* ------------------------------------------------------------------------- */
/* Inventory enums                                                           */
/* ------------------------------------------------------------------------- */

/** Ledger movement types (08-inventory.md). */
export const movementTypeEnum = pgEnum("movement_type", [
  "opening_stock",
  "purchase",
  "sale",
  "sale_return",
  "purchase_return",
  "transfer_in",
  "transfer_out",
  "adjustment",
  "damage",
  "expired",
  "reserved",
  "released",
  "production",
  "consumption",
]);

export const stockStateEnum = pgEnum("stock_state", [
  "available",
  "reserved",
  "damaged",
  "expired",
  "in_transit",
  "pending_inspection",
]);

export const valuationMethodEnum = pgEnum("valuation_method", [
  "fifo",
  "lifo",
  "weighted_average",
  "specific",
]);

export const adjustmentReasonEnum = pgEnum("adjustment_reason", [
  "counting_error",
  "damaged",
  "missing",
  "found",
  "expired",
  "administrative",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
  "draft",
  "approved",
  "dispatched",
  "in_transit",
  "received",
  "completed",
  "cancelled",
]);

export const countStatusEnum = pgEnum("count_status", [
  "draft",
  "counting",
  "review",
  "approved",
  "cancelled",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

/* ------------------------------------------------------------------------- */
/* Commerce enums                                                            */
/* ------------------------------------------------------------------------- */

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "pending_approval",
  "approved",
  "sent",
  "partially_received",
  "completed",
  "cancelled",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "partially_paid",
  "paid",
  "overpaid",
  "refunded",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "upi",
  "bank_transfer",
  "cheque",
  "wallet",
  "gift_card",
  "store_credit",
  "credit",
  "online",
]);

export const saleStatusEnum = pgEnum("sale_status", [
  "draft",
  "completed",
  "cancelled",
  "returned",
  "partially_returned",
]);

export const salesChannelEnum = pgEnum("sales_channel", [
  "pos_counter",
  "online",
  "phone_order",
  "whatsapp",
  "walk_in",
  "wholesale",
  "internal",
]);

export const quotationStatusEnum = pgEnum("quotation_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);

export const returnStatusEnum = pgEnum("return_status", [
  "draft",
  "pending",
  "approved",
  "completed",
  "rejected",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "none",
  "percentage",
  "fixed",
]);

/* ------------------------------------------------------------------------- */
/* Partner enums                                                             */
/* ------------------------------------------------------------------------- */

export const customerTypeEnum = pgEnum("customer_type", [
  "walk_in",
  "retail",
  "wholesale",
  "corporate",
  "distributor",
  "employee",
]);

export const partnerStatusEnum = pgEnum("partner_status", [
  "pending",
  "active",
  "inactive",
  "blocked",
  "archived",
]);

export const supplierTypeEnum = pgEnum("supplier_type", [
  "manufacturer",
  "distributor",
  "wholesaler",
  "importer",
  "local_vendor",
  "service_provider",
]);

export const addressTypeEnum = pgEnum("address_type", [
  "billing",
  "shipping",
  "office",
  "home",
  "warehouse",
  "head_office",
]);

/* ------------------------------------------------------------------------- */
/* System enums                                                              */
/* ------------------------------------------------------------------------- */

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "critical",
  "high",
  "medium",
  "low",
  "silent",
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "processing",
  "sent",
  "delivered",
  "read",
  "failed",
  "cancelled",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "in_app",
  "email",
  "sms",
  "whatsapp",
  "push",
  "webhook",
]);

/**
 * Settings resolve most-specific-wins along this chain
 * (17-settings.md § Settings Hierarchy). `business` is the installation-wide
 * default; `branch` is a store override.
 */
export const settingScopeEnum = pgEnum("setting_scope", [
  "business",
  "branch",
  "warehouse",
  "user",
]);

export const numberResetEnum = pgEnum("number_reset", [
  "never",
  "yearly",
  "monthly",
  "daily",
]);

/** How often a saved report runs itself (14-reporting.md § Scheduled Reports). */
export const reportScheduleEnum = pgEnum("report_schedule", [
  "none",
  "daily",
  "weekly",
  "monthly",
]);

/** Background job lifecycle (28-job-queue.md). */
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
