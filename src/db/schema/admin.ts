/**
 * Admin / installation entities (06-database-architecture.md § Admin Entities).
 *
 * StoqBook serves one business per installation, so the `tenants` table holds
 * exactly one row: the installed company. The table and the `tenant_id`
 * references are kept structurally so the schema stays forward-compatible, but
 * there is no tenant switching and no cross-business access.
 *
 * Plans, modules, features and permissions are shared definitions — they
 * describe what the software can do, not what one company owns.
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorColumns,
  billingCycleEnum,
  billingModeEnum,
  businessStatusEnum,
  licenseStatusEnum,
  moduleStateEnum,
  moduleVisibilityEnum,
  money,
  pk,
  timestamps,
} from "./_shared";
import { stores } from "./organization";

/* ------------------------------------------------------------------------- */
/* The business — exactly one row per installation                           */
/* ------------------------------------------------------------------------- */

export const tenants = pgTable(
  "tenants",
  {
    id: pk(),
    /** URL-safe handle, e.g. "mybusiness". Informational in a single install. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: businessStatusEnum("status").notNull().default("created"),

    contact_name: text("contact_name"),
    contact_email: text("contact_email").notNull(),
    contact_phone: text("contact_phone"),

    country: text("country").notNull().default("IN"),
    currency: text("currency").notNull().default("INR"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    locale: text("locale").notNull().default("en"),

    /** Free-form branding bag: logo_url, primary_color, receipt_header … */
    branding: jsonb("branding").$type<Record<string, unknown>>().default({}),

    suspended_reason: text("suspended_reason"),
    activated_at: timestamp("activated_at", { withTimezone: true }),
    archived_at: timestamp("archived_at", { withTimezone: true }),
    /**
     * Set when the first-run wizard finishes. Its absence is what makes the
     * installation redirect to /setup (01-platform-architecture.md § First-Run).
     */
    setup_completed_at: timestamp("setup_completed_at", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("tenants_slug_key").on(t.slug),
    index("tenants_status_idx").on(t.status),
    /**
     * Enforces "exactly one business per installation" in the database.
     *
     * A unique index on a constant expression can only ever admit one row. The
     * first-run wizard already refuses to run twice, but that check reads before
     * it writes and outside its own transaction — two simultaneous submissions
     * could both pass it. The blast radius is not a duplicate row: it is an
     * installation holding two businesses when every query above the schema
     * assumes one, so the guarantee belongs here rather than in a guard someone
     * can bypass by calling the service directly.
     */
    uniqueIndex("tenants_singleton").on(sql`(true)`),
  ],
);

/* ------------------------------------------------------------------------- */
/* Modules / features / permissions — the registry, persisted                */
/* ------------------------------------------------------------------------- */

export const modules = pgTable(
  "modules",
  {
    id: pk(),
    /**
     * The slug is the stable contract other tables reference. It is declared
     * unique inline (not as a separate index) so the UNIQUE constraint exists
     * before dependent foreign keys are created.
     */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("core"),
    icon: text("icon"),
    version: text("version").notNull().default("1.0.0"),
    state: moduleStateEnum("state").notNull().default("enabled"),
    visibility: moduleVisibilityEnum("visibility").notNull().default("business"),
    /** Core modules can never be disabled by a licence. */
    is_core: boolean("is_core").notNull().default(false),
    /** Module slugs this module requires. */
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
    sort_order: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("modules_state_idx").on(t.state)],
);

export const features = pgTable(
  "features",
  {
    id: pk(),
    module_id: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    /** Denormalised owner slug — the value business code actually filters on. */
    module_slug: text("module_slug").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Included even in the most basic plan when true. */
    is_default: boolean("is_default").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("features_slug_key").on(t.slug),
    index("features_module_idx").on(t.module_slug),
  ],
);

export const permissions = pgTable(
  "permissions",
  {
    id: pk(),
    /** module.action — e.g. products.create */
    key: text("key").notNull(),
    module_id: uuid("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    /** Denormalised owner slug — the value business code actually filters on. */
    module_slug: text("module_slug").notNull(),
    feature_slug: text("feature_slug"),
    action: text("action").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Administrative permissions (licence, registry, audit, business status).
     * They live in the same RBAC namespace as operational permissions but are
     * grouped separately in the role editor (04-rbac.md § Business Owner).
     */
    is_admin: boolean("is_admin").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("permissions_key_key").on(t.key),
    index("permissions_module_idx").on(t.module_slug),
  ],
);

/* ------------------------------------------------------------------------- */
/* Plans                                                                     */
/* ------------------------------------------------------------------------- */

export const plans = pgTable(
  "plans",
  {
    id: pk(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    price_once: money("price_once").notNull().default("0"),
    price_monthly: money("price_monthly").notNull().default("0"),
    price_yearly: money("price_yearly").notNull().default("0"),
    currency: text("currency").notNull().default("INR"),
    /** Enabled module slugs. */
    modules: jsonb("modules").$type<string[]>().notNull().default([]),
    /** Enabled feature slugs. */
    features: jsonb("features").$type<string[]>().notNull().default([]),
    /** Resource ceilings; null means unlimited. */
    limits: jsonb("limits")
      .$type<Record<string, number | null>>()
      .notNull()
      .default({}),
    is_public: boolean("is_public").notNull().default(true),
    archived: boolean("archived").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("plans_slug_key").on(t.slug)],
);

/* ------------------------------------------------------------------------- */
/* Licence — the business owns exactly one active licence                     */
/* ------------------------------------------------------------------------- */

export const licenses = pgTable(
  "licenses",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    store_id: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    plan_id: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),

    status: licenseStatusEnum("status").notNull().default("pending"),
    billing_mode: billingModeEnum("billing_mode").notNull().default("lifetime"),
    billing_cycle: billingCycleEnum("billing_cycle").notNull().default("none"),

    /** Key issued by the vendor at point of sale. */
    license_key: text("license_key"),

    starts_at: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** null = never expires (lifetime / internal). */
    expires_at: timestamp("expires_at", { withTimezone: true }),

    /** Overrides always win over the plan (03-license-system.md). */
    module_overrides: jsonb("module_overrides")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    feature_overrides: jsonb("feature_overrides")
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    limit_overrides: jsonb("limit_overrides")
      .$type<Record<string, number | null>>()
      .notNull()
      .default({}),

    notes: text("notes"),
    /** Exactly one active licence per store, enforced in the service layer. */
    is_current: boolean("is_current").notNull().default(true),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    index("licenses_store_idx").on(t.store_id),
    index("licenses_status_idx").on(t.status),
    uniqueIndex("licenses_store_current_idx")
      .on(t.store_id)
      .where(sql`${t.is_current} = true`),
  ],
);

/* ------------------------------------------------------------------------- */
/* Feature flags — installation-level kill switches                          */
/* ------------------------------------------------------------------------- */

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: pk(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Flags can only remove access, never grant something the licence excludes.
     * With one business per install there is no per-business targeting.
     */
    enabled: boolean("enabled").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("feature_flags_key_key").on(t.key)],
);

/* ------------------------------------------------------------------------- */
/* Announcements — shown to everyone in the business                         */
/* ------------------------------------------------------------------------- */

export const announcements = pgTable("announcements", {
  id: pk(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  severity: text("severity").notNull().default("info"),
  starts_at: timestamp("starts_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ends_at: timestamp("ends_at", { withTimezone: true }),
  is_active: boolean("is_active").notNull().default(true),
  ...timestamps,
  ...actorColumns,
});

/* ------------------------------------------------------------------------- */
/* Audit log — immutable, append only                                        */
/* ------------------------------------------------------------------------- */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    tenant_id: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    /** Store the event belongs to, when store-scoped. */
    store_id: uuid("store_id"),

    actor_id: uuid("actor_id"),
    actor_name: text("actor_name"),
    /** user | system */
    actor_type: text("actor_type").notNull().default("user"),

    /** Domain event name, e.g. SaleCompleted, StockAdjusted. */
    event: text("event").notNull(),
    module_slug: text("module_slug"),
    /** Entity touched. */
    entity_type: text("entity_type"),
    entity_id: text("entity_id"),
    /** Human summary shown in the audit UI. */
    summary: text("summary"),
    /** before/after diff, request metadata. */
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),

    ip_address: text("ip_address"),
    user_agent: text("user_agent"),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_tenant_created_idx").on(t.tenant_id, t.created_at),
    index("audit_logs_event_idx").on(t.event),
    index("audit_logs_entity_idx").on(t.entity_type, t.entity_id),
  ],
);
