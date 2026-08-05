import { products } from "@/db/schema";
import { handleShow } from "@/lib/api/resource";

/** GET /api/v1/products/:id */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleShow(id, {
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
      discount_price: products.discount_price,
      track_inventory: products.track_inventory,
      track_batches: products.track_batches,
      min_stock: products.min_stock,
      max_stock: products.max_stock,
      reorder_quantity: products.reorder_quantity,
      created_at: products.created_at,
      updated_at: products.updated_at,
    },
    sortable: ["name"],
    defaultSort: { field: "name", direction: "asc" },
  });
}
