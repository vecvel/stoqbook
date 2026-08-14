"use server";

import { randomBytes } from "node:crypto";

import { redirect } from "next/navigation";
import { and, count, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { revokeUserSessions } from "@/lib/auth/session";
import { requirePermission } from "@/lib/authz/guard";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/authz/errors";
import { slugify } from "@/lib/format";
import { ALL_PERMISSION_KEYS } from "@/lib/registry";
import { auditEvent, diff } from "@/lib/services/audit";
import { nextNumber } from "@/lib/services/numbering";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { assertWithinLimit } from "@/lib/services/business";
import {
  bool,
  dateOrNull,
  failure,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

/* -------------------------------------------------------------------------- */
/* Employees                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveEmployee(
  _prev: ActionResult<{ id: string }>,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = uuid(form, "id");
    const ctx = await requirePermission(
      id ? "employees.update" : "employees.create",
    );

    const fullName = str(form, "full_name");
    const email = str(form, "email").toLowerCase();

    if (!fullName) {
      return failure("Name is required.", { full_name: ["Required."] });
    }
    if (!email.includes("@")) {
      return failure("A valid email is required.", {
        email: ["Enter a valid email."],
      });
    }

    // Email is the login identity and must be unique inside the tenant.
    const clash = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenant_id, ctx.business.id),
          eq(users.email, email),
          id ? ne(users.id, id) : undefined,
        ),
      )
      .limit(1);
    if (clash.length > 0) {
      return failure("Another employee already uses that email.", {
        email: ["Already used."],
      });
    }

    const roleIds = form.getAll("role_ids").map(String).filter(Boolean);
    const loginEnabled = bool(form, "login_enabled");
    const password = str(form, "password");

    const settings = await loadSettings({ businessId: ctx.business.id });
    const minLength = readNumber(settings, "security.password_min_length", 8);

    if (password) {
      const problems = validatePassword(password, { minLength });
      if (problems.length > 0) {
        return failure("Password does not meet the policy.", {
          password: problems,
        });
      }
    }

    const values = {
      full_name: fullName,
      email,
      phone: optionalStr(form, "phone"),
      gender: optionalStr(form, "gender"),
      date_of_birth: dateOrNull(form, "date_of_birth"),
      address: optionalStr(form, "address"),
      joining_date: dateOrNull(form, "joining_date"),
      employment_type: (str(form, "employment_type") || "permanent") as
        | "permanent"
        | "contract"
        | "part_time"
        | "intern"
        | "temporary",
      department_id: uuid(form, "department_id"),
      designation_id: uuid(form, "designation_id"),
      store_id: uuid(form, "store_id"),
      login_enabled: loginEnabled,
      status: (str(form, "status") || "active") as
        | "pending"
        | "active"
        | "suspended"
        | "resigned"
        | "archived",
    };

    if (id) {
      const [before] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.tenant_id, ctx.business.id)))
        .limit(1);
      if (!before) throw NotFoundError("Employee not found.");

      const patch: Record<string, unknown> = {
        ...values,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      };
      if (password) patch.password_hash = await hashPassword(password);

      const [after] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, id))
        .returning();

      await syncRoles(ctx.business.id, id, roleIds, ctx.user.id);

      // A suspended or disabled account must lose its active sessions at once.
      if (
        after.status === "suspended" ||
        after.status === "resigned" ||
        after.status === "archived" ||
        !after.login_enabled ||
        password
      ) {
        await revokeUserSessions(id);
      }

      await auditEvent(ctx, {
        event:
          before.status !== after.status && after.status === "suspended"
            ? "EmployeeSuspended"
            : "EmployeeUpdated",
        moduleSlug: "employees",
        entityType: "user",
        entityId: id,
        summary: `Updated ${after.full_name}`,
        payload: { changes: diff(before, after, ["password_hash", "updated_at"]) },
      });

      revalidate("/employees", `/employees/${id}`);
      return success({ id }, "Employee saved.");
    }

    await assertWithinLimit(ctx.business.id, "employees", ctx.entitlements);

    if (loginEnabled && !password) {
      return failure("Set a password, or turn off portal access.", {
        password: ["Required when portal access is enabled."],
      });
    }

    const employeeCode =
      str(form, "employee_code") || (await nextNumber(ctx.business.id, "employee"));

    const [created] = await db
      .insert(users)
      .values({
        tenant_id: ctx.business.id,
        employee_code: employeeCode,
        password_hash: password ? await hashPassword(password) : null,
        ...values,
        created_by: ctx.user.id,
      })
      .returning();

    await syncRoles(ctx.business.id, created.id, roleIds, ctx.user.id);

    await auditEvent(ctx, {
      event: "EmployeeCreated",
      moduleSlug: "employees",
      entityType: "user",
      entityId: created.id,
      summary: `Created ${created.full_name} (${created.employee_code})`,
      payload: { roles: roleIds.length },
    });

    revalidate("/employees", "/dashboard");
    redirect(`/employees/${created.id}`);
  });
}

/** Replaces a user's role assignments, validating business ownership. */
async function syncRoles(
  businessId: string,
  userId: string,
  roleIds: string[],
  actorId: string,
): Promise<void> {
  const valid = roleIds.length
    ? await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.tenant_id, businessId), eq(roles.archived, false)))
    : [];

  const allowed = new Set(valid.map((r) => r.id));
  const next = roleIds.filter((r) => allowed.has(r));

  await db.delete(userRoles).where(eq(userRoles.user_id, userId));
  if (next.length > 0) {
    await db
      .insert(userRoles)
      .values(next.map((role_id) => ({ user_id: userId, role_id })));
  }

  void actorId;
}

export async function deleteEmployee(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.delete");

    if (userId === ctx.user.id) {
      throw BusinessRuleError(
        "You cannot delete your own account.",
        "SELF_DELETE",
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenant_id, ctx.business.id)))
      .limit(1);
    if (!user) throw NotFoundError("Employee not found.");

    // Archived employees remain in historical reports (13-employees.md).
    await db
      .update(users)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        status: "archived",
        login_enabled: false,
      })
      .where(eq(users.id, userId));

    await revokeUserSessions(userId);

    await auditEvent(ctx, {
      event: "EmployeeUpdated",
      moduleSlug: "employees",
      entityType: "user",
      entityId: userId,
      summary: `Removed ${user.full_name}`,
    });

    revalidate("/employees");
    redirect("/employees");
  });
}

export async function setEmployeeStatus(
  userId: string,
  status: "active" | "suspended",
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.suspend");

    if (userId === ctx.user.id) {
      throw BusinessRuleError(
        "You cannot change your own account status.",
        "SELF_SUSPEND",
      );
    }

    await db
      .update(users)
      .set({ status, updated_at: new Date(), updated_by: ctx.user.id })
      .where(and(eq(users.id, userId), eq(users.tenant_id, ctx.business.id)));

    if (status === "suspended") await revokeUserSessions(userId);

    await auditEvent(ctx, {
      event: status === "suspended" ? "EmployeeSuspended" : "EmployeeUpdated",
      moduleSlug: "employees",
      entityType: "user",
      entityId: userId,
      summary: `Employee ${status}`,
    });

    revalidate("/employees", `/employees/${userId}`);
    return success(
      undefined,
      status === "suspended"
        ? "Employee suspended and signed out."
        : "Employee reactivated.",
    );
  });
}

/**
 * Issues portal access to an existing employee.
 *
 * There is no outbound email in this installation, so no invitation link can be
 * sent. Instead a one-time password is generated and returned once, for the
 * administrator to hand over; the employee's status is left `pending` until they
 * first sign in, which is what flips it to active.
 */
export async function inviteEmployee(
  userId: string,
): Promise<ActionResult<{ temporaryPassword: string; email: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.invite");

    const [employee] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, userId),
          eq(users.tenant_id, ctx.business.id),
          isNull(users.deleted_at),
        ),
      )
      .limit(1);
    if (!employee) throw NotFoundError("Employee not found.");

    if (!employee.email) {
      return failure(
        "Add an email address to this employee before granting portal access.",
      );
    }
    if (employee.status === "resigned" || employee.status === "archived") {
      return failure("This employee is no longer active.");
    }

    /* Random, not derived from anything about the employee, so it cannot be
       guessed from their name or joining date. */
    const temporaryPassword = `Stq-${randomBytes(6).toString("base64url")}`;

    await db
      .update(users)
      .set({
        password_hash: await hashPassword(temporaryPassword),
        login_enabled: true,
        status: employee.status === "active" ? "active" : "pending",
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(users.id, userId));

    // Any existing session must die: the password just changed underneath it.
    await revokeUserSessions(userId);

    await auditEvent(ctx, {
      event: "EmployeeInvited",
      moduleSlug: "employees",
      entityType: "user",
      entityId: userId,
      summary: `Portal access issued to ${employee.full_name}`,
      // The password itself is deliberately never written to the audit trail.
      payload: { email: employee.email },
    });

    revalidate("/employees", `/employees/${userId}`);
    return success(
      { temporaryPassword, email: employee.email },
      `Portal access issued to ${employee.full_name}.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

export async function saveRole(
  _prev: ActionResult<{ id: string }>,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.manage_roles", {
      feature: "employees.roles",
    });

    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Role name is required.", { name: ["Required."] });

    // Only keys the registry actually defines are stored.
    const valid = new Set(ALL_PERMISSION_KEYS);
    const permissionKeys = [
      ...new Set(form.getAll("permissions").map(String)),
    ].filter((key) => valid.has(key));

    if (id) {
      const [role] = await db
        .select()
        .from(roles)
        .where(and(eq(roles.id, id), eq(roles.tenant_id, ctx.business.id)))
        .limit(1);
      if (!role) throw NotFoundError("Role not found.");

      await db
        .update(roles)
        .set({
          name,
          description: optionalStr(form, "description"),
          updated_at: new Date(),
          updated_by: ctx.user.id,
        })
        .where(eq(roles.id, id));

      if (!role.is_super_admin && role.slug !== "super_admin") {
        await db.delete(rolePermissions).where(eq(rolePermissions.role_id, id));
        if (permissionKeys.length > 0) {
          await db.insert(rolePermissions).values(
            permissionKeys.map((permission_key) => ({
              role_id: id,
              permission_key,
            })),
          );
        }
      }

      await auditEvent(ctx, {
        event: "PermissionUpdated",
        moduleSlug: "employees",
        entityType: "role",
        entityId: id,
        summary: `Updated role ${name}`,
        payload: { permission_count: permissionKeys.length },
      });

      revalidate("/employees/roles", `/employees/roles/${id}`);
      return success({ id }, "Role saved.");
    }

    const slug = slugify(name);
    const slugClash = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.tenant_id, ctx.business.id), eq(roles.slug, slug)))
      .limit(1);
    if (slugClash.length > 0) {
      return failure("A role with that name already exists.", {
        name: ["Already used."],
      });
    }

    const [created] = await db
      .insert(roles)
      .values({
        tenant_id: ctx.business.id,
        slug,
        name,
        description: optionalStr(form, "description"),
        is_system: false,
        created_by: ctx.user.id,
      })
      .returning();

    if (permissionKeys.length > 0) {
      await db.insert(rolePermissions).values(
        permissionKeys.map((permission_key) => ({
          role_id: created.id,
          permission_key,
        })),
      );
    }

    await auditEvent(ctx, {
      event: "PermissionUpdated",
      moduleSlug: "employees",
      entityType: "role",
      entityId: created.id,
      summary: `Created role ${name}`,
      payload: { permission_count: permissionKeys.length },
    });

    revalidate("/employees/roles");
    redirect(`/employees/roles/${created.id}`);
  });
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.manage_roles", {
      feature: "employees.roles",
    });

    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.id, roleId), eq(roles.tenant_id, ctx.business.id)))
      .limit(1);
    if (!role) throw NotFoundError("Role not found.");

    if (role.is_super_admin || role.slug === "super_admin") {
      throw BusinessRuleError(
        "The Super Admin role is required and cannot be deleted.",
        "SUPER_ADMIN_ROLE_PROTECTED",
      );
    }

    // Deletion is blocked while users are assigned (04-rbac.md § Role Lifecycle).
    const [assigned] = await db
      .select({ value: count() })
      .from(userRoles)
      .where(eq(userRoles.role_id, roleId));

    if (Number(assigned?.value ?? 0) > 0) {
      throw ConflictError(
        `${assigned.value} employee(s) still hold this role. Reassign them first.`,
      );
    }

    if (role.is_system) {
      // Provisioned roles are archived rather than removed, so they can be
      // restored without re-deriving their permission set.
      await db
        .update(roles)
        .set({ archived: true, updated_at: new Date() })
        .where(eq(roles.id, roleId));
      revalidate("/employees/roles");
      return success(undefined, `${role.name} archived.`);
    }

    await db.delete(roles).where(eq(roles.id, roleId));
    revalidate("/employees/roles");
    return success(undefined, `${role.name} deleted.`);
  });
}

/* -------------------------------------------------------------------------- */
/* Departments and designations                                               */
/* -------------------------------------------------------------------------- */

export async function saveDepartment(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.update", {
      feature: "employees.departments",
    });

    const { departments } = await import("@/db/schema");
    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Department name is required.");

    if (id) {
      await db
        .update(departments)
        .set({
          name,
          description: optionalStr(form, "description"),
          is_active: bool(form, "is_active"),
          updated_at: new Date(),
        })
        .where(
          and(eq(departments.id, id), eq(departments.tenant_id, ctx.business.id)),
        );
    } else {
      await db.insert(departments).values({
        tenant_id: ctx.business.id,
        name,
        description: optionalStr(form, "description"),
      });
    }

    revalidate("/employees", "/employees/departments");
    return success(undefined, "Department saved.");
  });
}

export async function deleteDepartment(
  departmentId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees.update", {
      feature: "employees.departments",
    });
    const { departments } = await import("@/db/schema");

    const [inUse] = await db
      .select({ value: count() })
      .from(users)
      .where(
        and(
          eq(users.department_id, departmentId),
          eq(users.tenant_id, ctx.business.id),
          isNull(users.deleted_at),
        ),
      );
    if (Number(inUse?.value ?? 0) > 0) {
      throw ConflictError(
        "Employees are assigned to this department. Reassign them first.",
      );
    }

    await db
      .delete(departments)
      .where(
        and(
          eq(departments.id, departmentId),
          eq(departments.tenant_id, ctx.business.id),
        ),
      );

    revalidate("/employees/departments");
    return success(undefined, "Department deleted.");
  });
}
