import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  branches,
  organizations,
  rolePermissions,
  roles,
  tenants,
  userRoles,
  users,
} from "@/db/schema";
import { ALL_PERMISSION_KEYS } from "@/lib/registry";
import { NotFoundError } from "@/lib/authz/errors";

import { resolveEntitlements, UNLICENSED } from "./entitlements";
import type { BusinessContext } from "./context";

/**
 * A context for work with no signed-in user — background jobs and scheduled
 * runs (28-job-queue.md).
 *
 * `getContext()` cannot serve these: it reads a session cookie, and there is no
 * request. This builds the equivalent from the database instead.
 *
 * The `actAsUserId` parameter is what keeps this from being a privilege
 * escalation. A scheduled report runs as whoever created it, so it can never
 * surface data its author was not entitled to. Only when that user is gone does
 * it fall back to the Owner — otherwise a departing manager would silently
 * break every schedule they had set up.
 */
export async function buildSystemContext(
  businessId: string,
  actAsUserId: string | null = null,
): Promise<BusinessContext> {
  const [business] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, businessId))
    .limit(1);
  if (!business) throw NotFoundError("Business not found.");

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.tenant_id, businessId))
    .limit(1);

  const user = await resolveActor(businessId, actAsUserId);

  const roleRows = await db
    .select({ role: roles })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, user.id));

  const assignedRoles = roleRows.map((r) => r.role).filter((r) => !r.archived);
  const isOwner = assignedRoles.some((r) => r.is_owner);

  let permissions: Set<string>;
  if (isOwner) {
    permissions = new Set(ALL_PERMISSION_KEYS);
  } else if (assignedRoles.length === 0) {
    permissions = new Set();
  } else {
    const grants = await db
      .select({ key: rolePermissions.permission_key })
      .from(rolePermissions)
      .where(
        inArray(
          rolePermissions.role_id,
          assignedRoles.map((r) => r.id),
        ),
      );
    permissions = new Set(grants.map((g) => g.key));
  }

  const stores = await db
    .select()
    .from(branches)
    .where(
      and(
        eq(branches.tenant_id, businessId),
        eq(branches.is_active, true),
        isNull(branches.deleted_at),
      ),
    );

  /* Background work is not "in" a store, so the default is used where one is
     needed — a store-scoped report still honours its own saved filter. */
  const activeStore = stores.find((s) => s.is_default) ?? stores[0] ?? null;

  const entitlements =
    business.status === "active"
      ? await resolveEntitlements(businessId)
      : UNLICENSED;

  return {
    // There is no session; a synthetic row keeps the type honest without
    // pretending a real one exists.
    session: {
      id: "00000000-0000-0000-0000-000000000000",
      token_hash: "system",
      tenant_id: businessId,
      user_id: user.id,
      active_branch_id: activeStore?.id ?? null,
      ip_address: null,
      user_agent: null,
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      last_seen_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    business,
    organization: organization ?? null,
    user,
    roles: assignedRoles,
    permissions,
    entitlements,
    stores,
    activeStore,
    isOwner,
  };
}

/** The requested user when they are still usable; otherwise the Owner. */
async function resolveActor(businessId: string, actAsUserId: string | null) {
  if (actAsUserId) {
    const [candidate] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, actAsUserId),
          eq(users.tenant_id, businessId),
          eq(users.status, "active"),
          isNull(users.deleted_at),
        ),
      )
      .limit(1);
    if (candidate) return candidate;
  }

  const [owner] = await db
    .select({ user: users })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.user_id, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(
      and(
        eq(users.tenant_id, businessId),
        eq(roles.is_owner, true),
        isNull(users.deleted_at),
      ),
    )
    .limit(1);

  if (!owner) {
    throw NotFoundError(
      "This business has no owner account, so background work cannot run.",
    );
  }
  return owner.user;
}
