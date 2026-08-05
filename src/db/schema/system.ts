/**
 * System entities — sessions, settings, numbering, notifications, reporting.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorColumns,
  notificationChannelEnum,
  notificationPriorityEnum,
  notificationStatusEnum,
  numberResetEnum,
  jobStatusEnum,
  reportScheduleEnum,
  pk,
  settingScopeEnum,
  timestamps,
} from "./_shared";
import { tenants } from "./admin";
import { branches, users, warehouses } from "./organization";

/* ------------------------------------------------------------------------- */
/* Sessions                                                                  */
/* ------------------------------------------------------------------------- */

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    /** SHA-256 of the cookie token — the raw token is never stored. */
    token_hash: text("token_hash").notNull(),
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),

    /** Store the user is currently operating in. */
    active_branch_id: uuid("active_branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),

    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sessions_token_key").on(t.token_hash),
    index("sessions_user_idx").on(t.user_id),
    index("sessions_expiry_idx").on(t.expires_at),
  ],
);

export const loginHistory = pgTable(
  "login_history",
  {
    id: pk(),
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    user_id: uuid("user_id"),
    email: text("email").notNull(),
    /** success | invalid_password | unknown_user | locked | business_inactive … */
    outcome: text("outcome").notNull(),
    ip_address: text("ip_address"),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_history_email_idx").on(t.email, t.created_at),
    index("login_history_tenant_idx").on(t.tenant_id, t.created_at),
  ],
);

/* ------------------------------------------------------------------------- */
/* Settings — hierarchical: business -> store -> warehouse -> user            */
/* ------------------------------------------------------------------------- */

export const settings = pgTable(
  "settings",
  {
    id: pk(),
    scope: settingScopeEnum("scope").notNull(),
    /** Always set: there is one business per installation. */
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "cascade",
    }),
    warehouse_id: uuid("warehouse_id").references(() => warehouses.id, {
      onDelete: "cascade",
    }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),

    /** Registering module, so disabled modules can hide their settings. */
    module_slug: text("module_slug"),
    key: text("key").notNull(),
    value: jsonb("value").$type<unknown>(),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    index("settings_lookup_idx").on(t.scope, t.tenant_id, t.key),
    index("settings_module_idx").on(t.module_slug),
    /* A constraint rather than an index, because only the constraint builder
       exposes NULLS NOT DISTINCT — which is essential here. A business-scoped
       setting leaves branch_id, warehouse_id and user_id null, and under
       Postgres's default NULLS DISTINCT two such rows would both be allowed,
       letting the same key exist twice and making which value wins arbitrary. */
    unique("settings_unique_key")
      .on(t.scope, t.tenant_id, t.branch_id, t.warehouse_id, t.user_id, t.key)
      .nullsNotDistinct(),
  ],
);

/** Version history so configuration changes stay recoverable. */
export const settingHistory = pgTable(
  "setting_history",
  {
    id: pk(),
    setting_id: uuid("setting_id"),
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    previous_value: jsonb("previous_value").$type<unknown>(),
    new_value: jsonb("new_value").$type<unknown>(),
    changed_by: uuid("changed_by"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("setting_history_tenant_key_idx").on(t.tenant_id, t.key)],
);

/* ------------------------------------------------------------------------- */
/* Document numbering                                                        */
/* ------------------------------------------------------------------------- */

export const numberSequences = pgTable(
  "number_sequences",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Per-branch sequences are supported; null = tenant-wide. */
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "cascade",
    }),

    /** sales_invoice | purchase_order | goods_receipt | customer | … */
    document_type: text("document_type").notNull(),
    prefix: text("prefix").notNull().default(""),
    suffix: text("suffix").notNull().default(""),
    /** Include the reset period in the number, e.g. INV-2026-000001. */
    include_period: boolean("include_period").notNull().default(true),
    padding: integer("padding").notNull().default(6),
    next_number: integer("next_number").notNull().default(1),
    reset_rule: numberResetEnum("reset_rule").notNull().default("yearly"),
    /** Period key the counter currently belongs to, e.g. "2026" or "2026-07". */
    current_period: text("current_period"),

    ...timestamps,
  },
  (t) => [
    uniqueIndex("number_sequences_key").on(
      t.tenant_id,
      t.branch_id,
      t.document_type,
    ),
  ],
);

/* ------------------------------------------------------------------------- */
/* Notifications                                                             */
/* ------------------------------------------------------------------------- */

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: pk(),
    /** Null = built-in default template shipped with StoqBook. */
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    event: text("event").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("in_app"),
    locale: text("locale").notNull().default("en"),
    subject: text("subject"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Documented variable names, e.g. ["customer","invoice","amount"]. */
    variables: jsonb("variables").$type<string[]>().notNull().default([]),
    version: integer("version").notNull().default(1),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("notification_templates_event_idx").on(t.event, t.channel, t.locale),
  ],
);

export const notificationRules = pgTable(
  "notification_rules",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    /** Role slugs to notify. */
    recipient_roles: jsonb("recipient_roles")
      .$type<string[]>()
      .notNull()
      .default([]),
    recipient_user_ids: jsonb("recipient_user_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    channels: jsonb("channels")
      .$type<string[]>()
      .notNull()
      .default(["in_app"]),
    priority: notificationPriorityEnum("priority").notNull().default("medium"),
    /** e.g. { "amount_gt": 50000, "branch_id": "…" } */
    conditions: jsonb("conditions")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notification_rules_key").on(t.tenant_id, t.event),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Null = broadcast to every user in the tenant. */
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),

    event: text("event").notNull(),
    module_slug: text("module_slug"),
    channel: notificationChannelEnum("channel").notNull().default("in_app"),
    priority: notificationPriorityEnum("priority").notNull().default("medium"),
    status: notificationStatusEnum("status").notNull().default("queued"),

    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Deep link into the app. */
    action_url: text("action_url"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),

    attempts: integer("attempts").notNull().default(0),
    last_error: text("last_error"),
    scheduled_for: timestamp("scheduled_for", { withTimezone: true }),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    read_at: timestamp("read_at", { withTimezone: true }),
    archived_at: timestamp("archived_at", { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    index("notifications_user_idx").on(t.user_id, t.read_at),
    index("notifications_tenant_created_idx").on(t.tenant_id, t.created_at),
    index("notifications_status_idx").on(t.status),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    channels: jsonb("channels")
      .$type<string[]>()
      .notNull()
      .default(["in_app"]),
    /** Do-not-disturb window, "22:00" → "07:00". Critical bypasses it. */
    quiet_from: text("quiet_from"),
    quiet_to: text("quiet_to"),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_preferences_key").on(t.user_id, t.event)],
);

/* ------------------------------------------------------------------------- */
/* Reporting                                                                 */
/* ------------------------------------------------------------------------- */

export const savedReports = pgTable(
  "saved_reports",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    report_key: text("report_key").notNull(),
    name: text("name").notNull(),
    filters: jsonb("filters")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    columns: jsonb("columns").$type<string[]>().notNull().default([]),
    is_favorite: boolean("is_favorite").notNull().default(false),
    /** Shared with the whole business rather than private to the author. */
    is_shared: boolean("is_shared").notNull().default(false),

    /* Scheduling (14-reporting.md § Scheduled Reports). `none` means the report
       is only ever run on demand. `next_run_at` is what a worker claims, so a
       missed window is picked up rather than skipped. */
    schedule: reportScheduleEnum("schedule").notNull().default("none"),
    /** Hour of the business day the run is due, 0–23. */
    schedule_hour: integer("schedule_hour").notNull().default(7),
    /** Users who receive the finished report. */
    recipient_user_ids: jsonb("recipient_user_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    next_run_at: timestamp("next_run_at", { withTimezone: true }),
    last_run_at: timestamp("last_run_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("saved_reports_tenant_idx").on(t.tenant_id, t.report_key)],
);

export const reportRuns = pgTable(
  "report_runs",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    report_key: text("report_key").notNull(),
    filters: jsonb("filters")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** view | csv | excel | pdf | print */
    export_format: text("export_format").notNull().default("view"),
    row_count: integer("row_count"),
    duration_ms: integer("duration_ms"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("report_runs_tenant_idx").on(t.tenant_id, t.created_at)],
);

/* ------------------------------------------------------------------------- */
/* Dashboard layout per user                                                 */
/* ------------------------------------------------------------------------- */

export const dashboardLayouts = pgTable(
  "dashboard_layouts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** [{ widget: "sales.today_revenue", size: "small", order: 1 }] */
    widgets: jsonb("widgets")
      .$type<{ widget: string; size: string; order: number; hidden?: boolean }[]>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("dashboard_layouts_user_key").on(t.user_id)],
);

/* ------------------------------------------------------------------------- */
/* Background jobs                                                           */
/* ------------------------------------------------------------------------- */

/**
 * The work queue (28-job-queue.md).
 *
 * Postgres-backed deliberately: StoqBook is self-hosted and single-business, so
 * requiring Redis to send a handful of emails a day would be a worse product.
 * Claiming uses `FOR UPDATE SKIP LOCKED`, which lets several workers run
 * concurrently without colliding and without advisory locks.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Handler key, e.g. "notification.deliver". */
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    status: jobStatusEnum("status").notNull().default("pending"),
    /** Lower runs first. */
    priority: integer("priority").notNull().default(100),
    /** Not eligible to be claimed before this instant. */
    run_after: timestamp("run_after", { withTimezone: true })
      .notNull()
      .defaultNow(),

    attempts: integer("attempts").notNull().default(0),
    max_attempts: integer("max_attempts").notNull().default(5),

    locked_at: timestamp("locked_at", { withTimezone: true }),
    /** Which worker holds it — useful when diagnosing a stuck job. */
    locked_by: text("locked_by"),

    last_error: text("last_error"),
    completed_at: timestamp("completed_at", { withTimezone: true }),

    /**
     * Set to collapse duplicates: enqueueing the same key while one is still
     * pending is a no-op, so a nightly sweep cannot pile up.
     */
    dedupe_key: text("dedupe_key"),

    ...timestamps,
  },
  (t) => [
    /* Partial index matching the claim query exactly — the only hot path. */
    index("jobs_claim_idx")
      .on(t.status, t.run_after, t.priority)
      .where(sql`${t.status} = 'pending'`),
    index("jobs_tenant_kind_idx").on(t.tenant_id, t.kind, t.created_at),
    /* One live job per dedupe key. Nulls must collide-check as equal or every
       row with a null key would count as distinct and the constraint would do
       nothing (see 23-database-design.md). */
    uniqueIndex("jobs_dedupe_pending_key")
      .on(t.tenant_id, t.dedupe_key)
      .where(sql`${t.status} = 'pending' and ${t.dedupe_key} is not null`),
  ],
);
