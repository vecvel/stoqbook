import "server-only";

import { cache } from "react";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  branches,
  organizations,
  rolePermissions,
  roles,
  tenants,
  userBranches,
  userRoles,
  users,
} from "@/db/schema";
import { getSessionRow, type SessionRow } from "@/lib/auth/session";
import { ALL_PERMISSION_KEYS } from "@/lib/registry";

import {
  resolveEntitlements,
  UNLICENSED,
  type Entitlements,
} from "./entitlements";

export type BusinessRow = typeof tenants.$inferSelect;
export type UserRow = typeof users.$inferSelect;
/** A store. The table is named `branches` for schema stability. */
export type StoreRow = typeof branches.$inferSelect;
export type OrganizationRow = typeof organizations.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;

/**
 * Everything resolved about the caller for one request.
 *
 * There is exactly one business per installation, so there is exactly one shape
 * of context — no separate platform tier and no tenant discrimination.
 */
export interface BusinessContext {
  session: SessionRow;
  business: BusinessRow;
  organization: OrganizationRow | null;
  user: UserRow;
  roles: RoleRow[];
  /** Union of every permission granted by the user's roles. */
  permissions: Set<string>;
  entitlements: Entitlements;
  /** Stores the user may operate in. */
  stores: StoreRow[];
  /** Store currently selected in the session. */
  activeStore: StoreRow | null;
  /** True when one of the user's roles is the Owner role. */
  isOwner: boolean;
}

export type RequestContext = BusinessContext;

/**
 * Resolves the caller once per request.
 *
 * `cache` dedupes across the whole React render pass, so layouts, pages and
 * server actions in the same request share a single database round trip.
 */
export const getContext = cache(async (): Promise<BusinessContext | null> => {
  const session = await getSessionRow();
  if (!session?.tenant_id || !session.user_id) return null;

  const [businessRow] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenant_id))
    .limit(1);
  if (!businessRow) return null;

  const [userRow] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, session.user_id), isNull(users.deleted_at)))
    .limit(1);
  if (!userRow) return null;

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenant_id, businessRow.id))
    .limit(1);

  /* --- Roles and permissions ------------------------------------------- */

  const roleRows = await db
    .select({ role: roles })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, userRow.id));

  const assignedRoles = roleRows.map((r) => r.role).filter((r) => !r.archived);
  const isOwner = assignedRoles.some((r) => r.is_owner);

  /* Store-scoped roles are resolved after the active store is known, because
     their permissions only count while that store is the one being worked in.
     Business-wide roles (branch_id null) always count. */
  const businessWideRoles = assignedRoles.filter((r) => r.branch_id === null);
  const storeScopedRoles = assignedRoles.filter((r) => r.branch_id !== null);

  const grantsFor = async (roleIds: string[]): Promise<string[]> => {
    if (roleIds.length === 0) return [];
    const rows = await db
      .select({ key: rolePermissions.permission_key })
      .from(rolePermissions)
      .where(inArray(rolePermissions.role_id, roleIds));
    return rows.map((r) => r.key);
  };

  let permissions: Set<string>;
  if (isOwner) {
    // 04-rbac.md § Business Owner Restrictions: the Owner role implicitly holds
    // every permission, including administrative ones, so newly registered
    // modules are immediately usable without editing the role.
    permissions = new Set(ALL_PERMISSION_KEYS);
  } else {
    // Union across roles; duplicates collapse naturally.
    permissions = new Set(
      await grantsFor(businessWideRoles.map((r) => r.id)),
    );
  }

  /* --- Entitlements ----------------------------------------------------- */

  const entitlements =
    businessRow.status === "active"
      ? await resolveEntitlements(businessRow.id)
      : UNLICENSED;

  /* --- Store scope ------------------------------------------------------ */

  const allStores = await db
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.tenant_id, businessRow.id),
        eq(branches.is_active, true),
        isNull(branches.deleted_at),
      ),
    );

  let scoped: StoreRow[];
  if (isOwner || permissions.has("stores.view_all")) {
    scoped = allStores;
  } else {
    const extra = await db
      .select({ branch_id: userBranches.branch_id })
      .from(userBranches)
      .where(eq(userBranches.user_id, userRow.id));

    const allowed = new Set<string>(extra.map((e) => e.branch_id));
    if (userRow.branch_id) allowed.add(userRow.branch_id);
    /* A store-scoped role also implies access to its store — otherwise being
       given "Weekend Supervisor at Andheri" would grant permissions the user
       could never reach, because Andheri would not be in their store list. */
    for (const role of storeScopedRoles) {
      if (role.branch_id) allowed.add(role.branch_id);
    }
    scoped = allStores.filter((b) => allowed.has(b.id));
    // A user with no store assignment falls back to the default store so the
    // app stays usable rather than showing an empty shell.
    if (scoped.length === 0) {
      scoped = allStores.filter((b) => b.is_default);
    }
  }

  const activeStore =
    scoped.find((b) => b.id === session.active_branch_id) ??
    scoped.find((b) => b.is_default) ??
    scoped[0] ??
    null;

  /* Now that the active store is settled, fold in the permissions of any
     store-scoped role attached to it.
     The Owner is skipped because they already hold everything, and adding to a
     complete set is wasted work. Note the direction: a store-scoped role can
     only ever *add* permissions for that store — it can never remove one granted
     business-wide, because a role is a grant and revocation is not a thing roles
     do. Anything else would make permissions depend on which store you happened
     to be looking at, which nobody could reason about. */
  const activeStoreRoles = activeStore
    ? storeScopedRoles.filter((r) => r.branch_id === activeStore.id)
    : [];

  if (!isOwner && activeStoreRoles.length > 0) {
    for (const key of await grantsFor(activeStoreRoles.map((r) => r.id))) {
      permissions.add(key);
    }
  }

  return {
    session,
    business: businessRow,
    organization: org ?? null,
    user: userRow,
    /* Only the roles actually in force: business-wide ones, plus those scoped to
       the active store. A role for a different store is deliberately absent, so
       the role editor and audit trail show what is really applying. */
    roles: [...businessWideRoles, ...activeStoreRoles],
    permissions,
    entitlements,
    stores: scoped,
    activeStore,
    isOwner,
  };
});

/* -------------------------------------------------------------------------- */
/* Predicates — pure, safe to use in server components                        */
/* -------------------------------------------------------------------------- */

export function hasPermission(
  ctx: RequestContext | null,
  permission: string,
): boolean {
  if (!ctx) return false;
  return ctx.permissions.has(permission);
}

export function hasAnyPermission(
  ctx: RequestContext | null,
  permissions: string[],
): boolean {
  return permissions.some((p) => hasPermission(ctx, p));
}

/**
 * Whether the caller sees every store's data, or only the one they are in.
 *
 * The single place this question is answered. It was previously a bare
 * `hasPermission(ctx, "dashboard.view_store")` repeated across six modules,
 * which is how the wrong permission ended up governing business-wide data scope
 * without anyone noticing.
 *
 * The Owner always sees everything; that is what owning the business means.
 */
export function seesAllStores(ctx: RequestContext | null): boolean {
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.has("stores.view_all");
}

/**
 * The store to pin a query to, or null for "every store this user can see".
 *
 * Use this rather than reaching for `ctx.activeStore` directly in a query: a
 * regional manager should not be silently narrowed to one store, and a cashier
 * must never be widened beyond theirs.
 */
export function storeScope(ctx: RequestContext | null): string | null {
  if (!ctx) return null;
  return seesAllStores(ctx) ? null : (ctx.activeStore?.id ?? null);
}

export function hasModule(ctx: RequestContext | null, slug: string): boolean {
  if (!ctx) return false;
  return ctx.entitlements.modules.has(slug);
}

export function hasFeature(ctx: RequestContext | null, slug: string): boolean {
  if (!ctx) return false;
  return ctx.entitlements.features.has(slug);
}

/**
 * The full gate used by navigation, buttons and pages alike:
 * module enabled AND feature entitled AND permission granted.
 */
export function canAccess(
  ctx: RequestContext | null,
  options: { module?: string; feature?: string; permission?: string },
): boolean {
  if (!ctx) return false;
  if (options.module && !hasModule(ctx, options.module)) return false;
  if (options.feature && !hasFeature(ctx, options.feature)) return false;
  if (options.permission && !hasPermission(ctx, options.permission)) {
    return false;
  }
  return true;
}

/** Derives the owning module from a permission key, e.g. products.create. */
export function moduleOfPermission(permission: string): string {
  return permission.split(".")[0] ?? "";
}
