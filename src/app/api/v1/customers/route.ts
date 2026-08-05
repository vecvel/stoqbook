import { type NextRequest } from "next/server";

import { customers } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/** GET /api/v1/customers */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: customers,
    permission: "customers.view",
    tenantColumn: customers.tenant_id,
    softDeleteColumn: customers.deleted_at,
    columns: {
      id: customers.id,
      code: customers.code,
      name: customers.name,
      company_name: customers.company_name,
      type: customers.type,
      phone: customers.phone,
      email: customers.email,
      tax_number: customers.tax_number,
      credit_limit: customers.credit_limit,
      outstanding_balance: customers.outstanding_balance,
      loyalty_points: customers.loyalty_points,
      total_purchases: customers.total_purchases,
      purchase_count: customers.purchase_count,
      last_purchase_at: customers.last_purchase_at,
      status: customers.status,
      created_at: customers.created_at,
    },
    searchColumns: [
      customers.name,
      customers.code,
      customers.phone,
      customers.email,
      customers.company_name,
    ],
    sortable: [
      "name",
      "code",
      "outstanding_balance",
      "total_purchases",
      "created_at",
    ],
    defaultSort: { field: "name", direction: "asc" },
    filters: {
      status: customers.status,
      type: customers.type,
      group: customers.group_id,
    },
  });
}
