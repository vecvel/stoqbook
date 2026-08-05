import { ok } from "@/lib/api/response";
import {
  ALL_FEATURES,
  ALL_PERMISSIONS,
  ALL_REPORTS,
  ALL_MODULES,
} from "@/lib/registry";
import { IMPLEMENTED_REPORTS } from "@/lib/services/reports";

/**
 * GET /api/v1 — self-describing index.
 *
 * Generated from the module registry, so it never drifts from what the platform
 * actually exposes (18-api-specification.md § API Documentation).
 */
export async function GET() {
  return ok(
    {
      version: "v1",
      envelope: {
        success: "boolean",
        message: "string",
        data: "object | array",
        meta: "{ page, limit, total, pages }",
        links: "{ self, next, prev }",
      },
      conventions: {
        pagination: "?page=1&limit=25",
        sorting: "?sort=name or ?sort=-created_at",
        search: "?search=term",
        filtering: "?status=active&category=<uuid>",
        fieldSelection: "?fields=id,name,selling_price",
        softDeleted: "?deleted=1 to include soft-deleted rows",
      },
      authentication:
        "Session cookie. Every request resolves the business and passes the full authorization pipeline.",
      resources: [
        { path: "/api/v1/products", methods: ["GET"], permission: "products.view" },
        { path: "/api/v1/products/:id", methods: ["GET"], permission: "products.view" },
        {
          path: "/api/v1/products/search",
          methods: ["GET"],
          permission: "products.view",
          note: "Barcode-aware lookup used by the POS and line editors.",
        },
        {
          path: "/api/v1/products/export",
          methods: ["GET"],
          permission: "products.export",
          note: "CSV. Cost price is omitted without products.view_cost.",
        },
        { path: "/api/v1/inventory", methods: ["GET"], permission: "inventory.view" },
        { path: "/api/v1/customers", methods: ["GET"], permission: "customers.view" },
        { path: "/api/v1/suppliers", methods: ["GET"], permission: "suppliers.view" },
        { path: "/api/v1/sales", methods: ["GET"], permission: "sales.view" },
        { path: "/api/v1/purchases", methods: ["GET"], permission: "purchases.view" },
        {
          path: "/api/v1/employees",
          methods: ["GET"],
          permission: "employees.view",
          note: "Credential and lockout columns are never exposed.",
        },
        {
          path: "/api/v1/settings",
          methods: ["GET"],
          permission: "settings.view",
          note: "Resolved values for the caller's scope, not raw rows. ?group= and ?scope= narrow it.",
        },
        {
          path: "/api/v1/notifications",
          methods: ["GET"],
          permission: "notifications.view",
          note: "The caller's own inbox. ?scope=all needs notifications.view_history.",
        },
        {
          path: "/api/v1/reports/:key",
          methods: ["GET"],
          permission: "declared per report",
          note: "?format=csv exports; requires reports.export.",
        },
        { path: "/api/v1/health", methods: ["GET"], permission: null },
      ],
      registry: {
        modules: ALL_MODULES.map((m) => ({
          slug: m.slug,
          name: m.name,
          isCore: m.isCore,
          dependencies: m.dependencies,
        })),
        featureCount: ALL_FEATURES.length,
        permissionCount: ALL_PERMISSIONS.length,
        reports: ALL_REPORTS.filter((r) => IMPLEMENTED_REPORTS.has(r.key)).map(
          (r) => ({
            key: r.key,
            name: r.name,
            group: r.group,
            permission: r.permission,
          }),
        ),
      },
      errors: {
        401: "Authentication required",
        402: "Licence or plan limit prevents the operation",
        403: "Permission denied",
        404: "Not found",
        409: "Business rule violation",
        422: "Validation failed",
        500: "Unexpected error",
      },
    },
    { message: "StoqBook API v1." },
  );
}
