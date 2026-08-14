import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { rolePermissions, roles, userRoles, users } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { initials } from "@/lib/format";

import { buildPermissionGroups } from "../permission-groups";
import { RoleForm } from "../role-form";
import { RoleActions } from "./role-actions";

export const metadata: Metadata = { title: "Role" };

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("employees.manage_roles", {
    feature: "employees.roles",
  });

  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, id), eq(roles.tenant_id, ctx.business.id)))
    .limit(1);

  if (!role) notFound();

  const [granted, members] = await Promise.all([
    db
      .select({ key: rolePermissions.permission_key })
      .from(rolePermissions)
      .where(eq(rolePermissions.role_id, id)),
    db
      .select({
        id: users.id,
        name: users.full_name,
        email: users.email,
        status: users.status,
      })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.user_id))
      .where(eq(userRoles.role_id, id))
      .orderBy(asc(users.full_name)),
  ]);

  return (
    <div className="page">
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Roles", href: "/employees/roles" },
          { label: role.name },
        ]}
        actions={
          <>
            {role.is_super_admin || role.slug === "super_admin" ? (
              <Badge variant="soft-accent">Super Admin</Badge>
            ) : role.is_system ? (
              <Badge variant="soft-neutral">Provisioned</Badge>
            ) : (
              <Badge variant="outline">Custom</Badge>
            )}
            <RoleActions
              roleId={id}
              roleName={role.name}
              isSuperAdmin={role.is_super_admin || role.slug === "super_admin"}
              memberCount={members.length}
            />
          </>
        }
      />

      {members.length > 0 ? (
        <section className="rounded-xs border border-border bg-card px-4 py-3">
          <h2 className="section-title mb-2">
            {members.length} employee{members.length === 1 ? "" : "s"} with this role
          </h2>
          <ul className="flex flex-wrap gap-2">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                   href={`/employees/${member.id}`}
                  className="flex items-center gap-2 rounded-xs border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                >
                  <span className="flex size-5 items-center justify-center rounded-full bg-bark text-[9px] font-semibold text-parchment">
                    {initials(member.name)}
                  </span>
                  {member.name}
                  {member.status !== "active" ? (
                    <span className="text-muted-foreground">({member.status})</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RoleForm
        role={{
          id: role.id,
          name: role.name,
          description: role.description ?? "",
          isSuperAdmin: Boolean(role.is_super_admin || role.slug === "super_admin"),
          isSystem: role.is_system,
          granted: granted.map((g) => g.key),
        }}
        groups={buildPermissionGroups(ctx)}
      />
    </div>
  );
}
