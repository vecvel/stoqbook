import { type NextRequest } from "next/server";

import { products } from "@/db/schema";
import { handleList } from "@/lib/api/resource";

/** GET /api/v1/products */
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: products,
    permission: "products.view",
    tenantColumn: products.tenant_id,
    softDeleteColumn: products.deleted_at,
    columns: {
      id: products.id,
      sku: products.sku,
      barcode: products.barcode,
      name: products.name,
      description: products.description,
      type: products.type,
      status: products.status,
      category_id: products.category_id,
      brand_id: products.brand_id,
      unit_id: products.unit_id,
      tax_group_id: products.tax_group_id,
      cost_price: products.cost_price,
      selling_price: products.selling_price,
      wholesale_price: products.wholesale_price,
      track_inventory: products.track_inventory,
      min_stock: products.min_stock,
      created_at: products.created_at,
      updated_at: products.updated_at,
    },
    searchColumns: [products.name, products.sku, products.barcode],
    sortable: ["name", "sku", "selling_price", "cost_price", "created_at"],
    defaultSort: { field: "name", direction: "asc" },
    filters: {
      status: products.status,
      category: products.category_id,
      brand: products.brand_id,
      type: products.type,
    },
  });
}
