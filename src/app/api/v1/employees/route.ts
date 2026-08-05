import { type NextRequest } from "next/server";

import { users } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/**
 * GET /api/v1/employees
 *
 * Note what is absent: `password_hash`, `failed_login_attempts` and
 * `locked_until`. The generic list builder returns exactly the columns declared
 * here, so credential and lockout state cannot leak through field selection — an
 * employee directory has no business exposing authentication internals.
 */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: users,
    permission: "employees.view",
    feature: "employees.profiles",
    tenantColumn: users.tenant_id,
    softDeleteColumn: users.deleted_at,
    columns: {
      id: users.id,
      employee_code: users.employee_code,
      full_name: users.full_name,
      email: users.email,
      phone: users.phone,
      status: users.status,
      login_enabled: users.login_enabled,
      employment_type: users.employment_type,
      department_id: users.department_id,
      designation_id: users.designation_id,
      branch_id: users.branch_id,
      joining_date: users.joining_date,
      last_login_at: users.last_login_at,
      created_at: users.created_at,
    },
    searchColumns: [
      users.full_name,
      users.employee_code,
      users.email,
      users.phone,
    ],
    sortable: [
      "full_name",
      "employee_code",
      "status",
      "joining_date",
      "last_login_at",
      "created_at",
    ],
    defaultSort: { field: "full_name", direction: "asc" },
    filters: {
      status: users.status,
      employment_type: users.employment_type,
      department: users.department_id,
      designation: users.designation_id,
      store: users.branch_id,
    },
  });
}
