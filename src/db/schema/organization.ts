/**
 * Organisation entities — everything the business owns structurally:
 * its profile, its store network, and its workforce/RBAC.
 *
 * `branches` is the store table: the column name is kept for schema stability
 * while the domain language above the database layer says "store".
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorColumns,
  attendanceStatusEnum,
  employmentTypeEnum,
  leaveStatusEnum,
  pk,
  qty,
  softDelete,
  timestamps,
  userStatusEnum,
  valuationMethodEnum,
} from "./_shared";
import { tenants } from "./admin";

/* ------------------------------------------------------------------------- */
/* Organisation                                                              */
/* ------------------------------------------------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    legal_name: text("legal_name"),
    logo_url: text("logo_url"),
    favicon_url: text("favicon_url"),

    email: text("email"),
    phone: text("phone"),
    website: text("website"),

    address_line1: text("address_line1"),
    address_line2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),
    country: text("country").notNull().default("IN"),

    tax_number: text("tax_number"),
    registration_number: text("registration_number"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [uniqueIndex("organizations_tenant_key").on(t.tenant_id)],
);

/* ------------------------------------------------------------------------- */
/* Stores (table name `branches` for schema stability)                       */
/* ------------------------------------------------------------------------- */

export const branches = pgTable(
  "branches",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    organization_id: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    code: text("code").notNull(),
    name: text("name").notNull(),

    email: text("email"),
    phone: text("phone"),
    address_line1: text("address_line1"),
    address_line2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),
    country: text("country"),

    /** Document numbering prefix override for this branch. */
    document_prefix: text("document_prefix"),
    timezone: text("timezone"),
    currency: text("currency"),

    is_default: boolean("is_default").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("branches_tenant_code_key").on(t.tenant_id, t.code),
    index("branches_tenant_idx").on(t.tenant_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Warehouses                                                               */
/* ------------------------------------------------------------------------- */

export const warehouses = pgTable(
  "warehouses",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Primary branch this warehouse serves; it may still serve others. */
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),

    code: text("code").notNull(),
    name: text("name").notNull(),
    address_line1: text("address_line1"),
    city: text("city"),
    state: text("state"),
    postal_code: text("postal_code"),

    valuation_method: valuationMethodEnum("valuation_method")
      .notNull()
      .default("weighted_average"),
    /** Rack / bin / zone layout metadata. */
    layout: jsonb("layout").$type<Record<string, unknown>>().default({}),

    is_default: boolean("is_default").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("warehouses_tenant_code_key").on(t.tenant_id, t.code),
    index("warehouses_tenant_branch_idx").on(t.tenant_id, t.branch_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Departments and designations                                              */
/* ------------------------------------------------------------------------- */

export const departments = pgTable(
  "departments",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("departments_tenant_name_key").on(t.tenant_id, t.name)],
);

export const designations = pgTable(
  "designations",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("designations_tenant_name_key").on(t.tenant_id, t.name)],
);

/* ------------------------------------------------------------------------- */
/* RBAC — roles                                                              */
/* ------------------------------------------------------------------------- */

export const roles = pgTable(
  "roles",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /**
     * The store this role belongs to, or NULL for a business-wide role.
     *
     * A store-scoped role's permissions apply only while that store is the
     * active one, which is what lets a store manager define "Weekend Supervisor"
     * for their own shop without it leaking into anyone else's. Business-wide
     * roles are unaffected and remain the norm.
     */
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Provisioned by the setup wizard; editable, not deletable. */
    is_system: boolean("is_system").notNull().default(false),
    /** The Owner role holds every permission implicitly (04-rbac.md). */
    is_owner: boolean("is_owner").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    /* Scoped by store as well as slug, with NULLS NOT DISTINCT so the
       business-wide row participates: two stores may each define their own
       "supervisor", and neither collides with a business-wide one. Without
       `nullsNotDistinct` the NULL branch_id rows would be mutually distinct and
       the same business-wide slug could be created twice. */
    unique("roles_tenant_scope_slug_key")
      .on(t.tenant_id, t.branch_id, t.slug)
      .nullsNotDistinct(),
    index("roles_tenant_idx").on(t.tenant_id),
    index("roles_branch_idx").on(t.branch_id),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** Permission key rather than id — keys are the stable contract. */
    permission_key: text("permission_key").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.role_id, t.permission_key] }),
    index("role_permissions_role_idx").on(t.role_id),
  ],
);

/* ------------------------------------------------------------------------- */
/* Users / employees                                                         */
/* ------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Employee code, e.g. EMP-000001 */
    employee_code: text("employee_code").notNull(),
    full_name: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    avatar_url: text("avatar_url"),

    password_hash: text("password_hash"),
    /** An employee record may exist without portal access. */
    login_enabled: boolean("login_enabled").notNull().default(true),
    status: userStatusEnum("status").notNull().default("pending"),

    gender: text("gender"),
    date_of_birth: timestamp("date_of_birth", { withTimezone: false }),
    address: text("address"),

    joining_date: timestamp("joining_date", { withTimezone: false }),
    employment_type: employmentTypeEnum("employment_type")
      .notNull()
      .default("permanent"),
    department_id: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    designation_id: uuid("designation_id").references(() => designations.id, {
      onDelete: "set null",
    }),
    /** Primary branch. Additional access lives in user_branches. */
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),

    /** Per-user preferences: theme, default_branch, page_size, layout … */
    preferences: jsonb("preferences")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    last_login_at: timestamp("last_login_at", { withTimezone: true }),
    failed_login_attempts: integer("failed_login_attempts").notNull().default(0),
    locked_until: timestamp("locked_until", { withTimezone: true }),

    ...timestamps,
    ...actorColumns,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("users_tenant_email_key").on(t.tenant_id, t.email),
    uniqueIndex("users_tenant_code_key").on(t.tenant_id, t.employee_code),
    index("users_tenant_status_idx").on(t.tenant_id, t.status),
    index("users_email_idx").on(t.email),
  ],
);

export const userRoles = pgTable(
  "user_roles",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role_id: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.role_id] })],
);

/** Additional branch access beyond the primary branch. */
export const userBranches = pgTable(
  "user_branches",
  {
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.user_id, t.branch_id] })],
);

/* ------------------------------------------------------------------------- */
/* Shifts, attendance, leave                                                 */
/* ------------------------------------------------------------------------- */

export const shifts = pgTable(
  "shifts",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    start_time: time("start_time").notNull(),
    end_time: time("end_time").notNull(),
    break_minutes: integer("break_minutes").notNull().default(0),
    grace_minutes: integer("grace_minutes").notNull().default(0),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("shifts_tenant_name_key").on(t.tenant_id, t.name)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branch_id: uuid("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    shift_id: uuid("shift_id").references(() => shifts.id, {
      onDelete: "set null",
    }),

    work_date: timestamp("work_date", { withTimezone: false }).notNull(),
    check_in: timestamp("check_in", { withTimezone: true }),
    check_out: timestamp("check_out", { withTimezone: true }),
    worked_minutes: integer("worked_minutes").notNull().default(0),
    status: attendanceStatusEnum("status").notNull().default("present"),
    note: text("note"),

    ...timestamps,
    ...actorColumns,
  },
  (t) => [
    uniqueIndex("attendance_user_date_key").on(t.user_id, t.work_date),
    index("attendance_tenant_date_idx").on(t.tenant_id, t.work_date),
  ],
);

export const leaveTypes = pgTable(
  "leave_types",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    is_paid: boolean("is_paid").notNull().default(true),
    annual_quota: integer("annual_quota"),
    is_active: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("leave_types_tenant_name_key").on(t.tenant_id, t.name)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: pk(),
    tenant_id: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leave_type_id: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id, { onDelete: "restrict" }),

    start_date: timestamp("start_date", { withTimezone: false }).notNull(),
    end_date: timestamp("end_date", { withTimezone: false }).notNull(),
    days: qty("days").notNull().default("1"),
    reason: text("reason"),

    status: leaveStatusEnum("status").notNull().default("pending"),
    decided_by: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decided_at: timestamp("decided_at", { withTimezone: true }),
    decision_note: text("decision_note"),

    ...timestamps,
  },
  (t) => [
    index("leave_requests_tenant_status_idx").on(t.tenant_id, t.status),
    index("leave_requests_user_idx").on(t.user_id),
  ],
);
