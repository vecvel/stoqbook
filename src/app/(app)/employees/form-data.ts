import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { departments, designations, roles } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";

/** Reference options shared by the create and edit employee screens. */
export async function loadEmployeeFormOptions(ctx: BusinessContext) {
  const [roleRows, departmentRows, designationRows] = await Promise.all([
    db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        isSuperAdmin: sql<boolean>`(${roles.is_super_admin} = true OR ${roles.slug} = 'super_admin')`,
      })
      .from(roles)
      .where(eq(roles.tenant_id, ctx.business.id))
      .orderBy(sql`(${roles.is_super_admin} = true OR ${roles.slug} = 'super_admin') desc`, asc(roles.name)),

    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.tenant_id, ctx.business.id))
      .orderBy(asc(departments.name)),

    db
      .select({ id: designations.id, name: designations.name })
      .from(designations)
      .where(eq(designations.tenant_id, ctx.business.id))
      .orderBy(asc(designations.name)),
  ]);

  return {
    // Archived roles are hidden from assignment but remain on existing users.
    roles: roleRows,
    departments: departmentRows,
    designations: designationRows,
    // Only stores the acting user can see may be assigned.
    stores: ctx.stores.map((b) => ({ id: b.id, name: b.name })),
  };
}
