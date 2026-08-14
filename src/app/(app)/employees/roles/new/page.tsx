import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/authz/guard";

import { buildPermissionGroups } from "../permission-groups";
import { RoleForm } from "../role-form";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage() {
  const ctx = await requirePermission("employees.manage_roles", {
    feature: "employees.roles",
  });

  return (
    <div className="page">
      <PageHeader
        title="New role"
        description="Choose exactly which actions this role permits. Unlimited custom roles are supported."
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "Roles", href: "/employees/roles" },
          { label: "New" },
        ]}
      />
      <RoleForm
        role={{
          name: "",
          description: "",
          isSuperAdmin: false,
          isSystem: false,
          granted: [],
        }}
        groups={buildPermissionGroups(ctx)}
      />
    </div>
  );
}
