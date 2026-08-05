import { type NextRequest } from "next/server";

import { suppliers } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/** GET /api/v1/suppliers */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: suppliers,
    permission: "suppliers.view",
    tenantColumn: suppliers.tenant_id,
    softDeleteColumn: suppliers.deleted_at,
    columns: {
      id: suppliers.id,
      code: suppliers.code,
      company_name: suppliers.company_name,
      contact_person: suppliers.contact_person,
      type: suppliers.type,
      phone: suppliers.phone,
      email: suppliers.email,
      tax_number: suppliers.tax_number,
      credit_days: suppliers.credit_days,
      outstanding_balance: suppliers.outstanding_balance,
      total_purchases: suppliers.total_purchases,
      purchase_count: suppliers.purchase_count,
      rating: suppliers.rating,
      status: suppliers.status,
      created_at: suppliers.created_at,
    },
    searchColumns: [
      suppliers.company_name,
      suppliers.code,
      suppliers.contact_person,
      suppliers.phone,
      suppliers.email,
    ],
    sortable: [
      "company_name",
      "code",
      "outstanding_balance",
      "total_purchases",
      "created_at",
    ],
    defaultSort: { field: "company_name", direction: "asc" },
    filters: { status: suppliers.status, type: suppliers.type },
  });
}
