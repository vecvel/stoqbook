import { type NextRequest } from "next/server";

import { salesInvoices } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/** GET /api/v1/sales */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: salesInvoices,
    permission: "sales.view",
    tenantColumn: salesInvoices.tenant_id,
    columns: {
      id: salesInvoices.id,
      invoice_number: salesInvoices.invoice_number,
      invoice_date: salesInvoices.invoice_date,
      status: salesInvoices.status,
      channel: salesInvoices.channel,
      customer_id: salesInvoices.customer_id,
      customer_name: salesInvoices.customer_name,
      branch_id: salesInvoices.branch_id,
      subtotal: salesInvoices.subtotal,
      discount_amount: salesInvoices.discount_amount,
      tax_amount: salesInvoices.tax_amount,
      grand_total: salesInvoices.grand_total,
      paid_amount: salesInvoices.paid_amount,
      balance_amount: salesInvoices.balance_amount,
      payment_status: salesInvoices.payment_status,
      created_at: salesInvoices.created_at,
    },
    searchColumns: [
      salesInvoices.invoice_number,
      salesInvoices.customer_name,
      salesInvoices.customer_phone,
    ],
    sortable: ["invoice_date", "invoice_number", "grand_total", "created_at"],
    defaultSort: { field: "invoice_date", direction: "desc" },
    filters: {
      status: salesInvoices.status,
      payment: salesInvoices.payment_status,
      channel: salesInvoices.channel,
      branch: salesInvoices.branch_id,
      customer: salesInvoices.customer_id,
    },
  });
}
