import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { assertWithinLimit } from "@/lib/services/business";

import { EMPTY_EMPLOYEE, EmployeeForm } from "../employee-form";
import { loadEmployeeFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New employee" };

export default async function NewEmployeePage() {
  const ctx = await requirePermission("employees.create");

  // Surface the plan limit before the form is filled in, not after submitting.
  await assertWithinLimit(ctx.business.id, "employees", ctx.entitlements);

  const [options, settings] = await Promise.all([
    loadEmployeeFormOptions(ctx),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  return (
    <div className="page">
      <PageHeader
        title="New employee"
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: "New" },
        ]}
      />
      <EmployeeForm
        values={{
          ...EMPTY_EMPLOYEE,
          storeId: ctx.activeStore?.id ?? "",
        }}
        roles={options.roles}
        stores={options.stores}
        departments={options.departments}
        designations={options.designations}
        passwordMinLength={readNumber(
          settings,
          "security.password_min_length",
          8,
        )}
        canManageRoles={hasPermission(ctx, "employees.manage_roles")}
        isSelf={false}
      />
    </div>
  );
}
