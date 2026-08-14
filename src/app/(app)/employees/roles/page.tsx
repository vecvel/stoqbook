import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";

import {
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { rolePermissions, roles, userRoles } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { ALL_PERMISSION_KEYS } from "@/lib/registry";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requirePermission("employees.manage_roles", {
    feature: "employees.roles",
  });

  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      slug: roles.slug,
      description: roles.description,
      isSystem: roles.is_system,
      isSuperAdmin: sql<boolean>`(${roles.is_super_admin} = true OR ${roles.slug} = 'super_admin')`,
      archived: roles.archived,
      permissionCount: db.$count(
        rolePermissions,
        eq(rolePermissions.role_id, roles.id),
      ),
      userCount: db.$count(userRoles, eq(userRoles.role_id, roles.id)),
    })
    .from(roles)
    .where(eq(roles.tenant_id, ctx.business.id))
    .orderBy(sql`(${roles.is_super_admin} = true OR ${roles.slug} = 'super_admin') desc`, asc(roles.name));

  const totalPermissions = ALL_PERMISSION_KEYS.length;

  return (
    <div className="page">
      <PageHeader
        title="Roles & permissions"
        description="Permissions are granted through roles only — never directly to a person. A user with several roles gets the union of their permissions."
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Roles" },
        ]}
        actions={
          <Button asChild variant="accent" size="sm">
            <Link href="/employees/roles/new" className="gap-1.5">
              <Plus className="size-3.5" />
              New role
            </Link>
          </Button>
        }
      />

      <Notice tone="info">
        {totalPermissions} permissions are registered across your enabled modules.
        The Super Admin role always holds all of them, so newly added modules become
        usable without editing it.
      </Notice>

      <TableShell>
        <Table>
          <THead>
            <TH>Role</TH>
            <TH>Description</TH>
            <TH align="right">Permissions</TH>
            <TH align="right">Employees</TH>
            <TH align="right">Type</TH>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id} muted={row.archived}>
                <TD>
                  <Link
                    href={`/employees/roles/${row.id}`}
                    className="font-medium hover:text-accent hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {row.slug}
                  </div>
                </TD>
                <TD className="max-w-sm text-muted-foreground">
                  {row.description ?? "—"}
                </TD>
                <TD align="right">
                  {row.isSuperAdmin ? (
                    <span className="font-medium">All ({totalPermissions})</span>
                  ) : (
                    <span>
                      {row.permissionCount}
                      <span className="text-muted-foreground">
                        {" "}
                        / {totalPermissions}
                      </span>
                    </span>
                  )}
                </TD>
                <TD align="right">{row.userCount}</TD>
                <TD align="right">
                  {row.archived ? (
                    <Badge variant="soft-neutral">Archived</Badge>
                  ) : row.isSuperAdmin ? (
                    <Badge variant="soft-accent">Super Admin</Badge>
                  ) : row.isSystem ? (
                    <Badge variant="soft-neutral">Provisioned</Badge>
                  ) : (
                    <Badge variant="outline">Custom</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>
    </div>
  );
}
