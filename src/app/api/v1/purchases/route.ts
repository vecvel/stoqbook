import { type NextRequest } from "next/server";

import { purchaseOrders } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/** GET /api/v1/purchases */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: purchaseOrders,
    permission: "purchases.view",
    tenantColumn: purchaseOrders.tenant_id,
    columns: {
      id: purchaseOrders.id,
      order_number: purchaseOrders.order_number,
      order_date: purchaseOrders.order_date,
      expected_date: purchaseOrders.expected_date,
      status: purchaseOrders.status,
      approval_status: purchaseOrders.approval_status,
      supplier_id: purchaseOrders.supplier_id,
      branch_id: purchaseOrders.branch_id,
      warehouse_id: purchaseOrders.warehouse_id,
      subtotal: purchaseOrders.subtotal,
      tax_amount: purchaseOrders.tax_amount,
      grand_total: purchaseOrders.grand_total,
      created_at: purchaseOrders.created_at,
    },
    searchColumns: [purchaseOrders.order_number],
    sortable: ["order_date", "order_number", "grand_total", "created_at"],
    defaultSort: { field: "order_date", direction: "desc" },
    filters: {
      status: purchaseOrders.status,
      approval: purchaseOrders.approval_status,
      supplier: purchaseOrders.supplier_id,
      branch: purchaseOrders.branch_id,
    },
  });
}
