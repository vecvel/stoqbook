import "server-only";

import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  customers,
  products,
  purchaseOrders,
  salesInvoices,
  suppliers,
} from "@/db/schema";
import { canAccess, type BusinessContext } from "@/lib/authz/context";
import { formatMoney } from "@/lib/format";

/**
 * Global search (05-module-system.md § Dynamic Search).
 *
 * Each module contributes the fields it considers searchable. A source is only
 * queried when its module is licensed, its feature entitled and the user holds
 * the permission — so results can never leak a capability the user does not
 * otherwise have.
 */

export interface SearchHit {
  id: string;
  /** Primary line, e.g. a product name or invoice number. */
  label: string;
  /** Secondary line: SKU, phone, total — whatever identifies the record. */
  detail: string | null;
  href: string;
}

export interface SearchGroup {
  key: string;
  label: string;
  icon: string;
  moduleSlug: string;
  hits: SearchHit[];
  /** True when more matches exist than were returned. */
  truncated: boolean;
}

interface SourceDef {
  key: string;
  label: string;
  icon: string;
  moduleSlug: string;
  permission: string;
  feature?: string;
  run: (
    businessId: string,
    term: string,
    limit: number,
    currency: string,
  ) => Promise<SearchHit[]>;
}

/** Matches anywhere in the field; `%` and `_` in user input are escaped. */
function like(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function textSearch(columns: SQL[], term: string) {
  const pattern = like(term);
  return or(...columns.map((c) => ilike(c, pattern)));
}

const SOURCES: SourceDef[] = [
  {
    key: "products",
    label: "Products",
    icon: "Package",
    moduleSlug: "products",
    permission: "products.view",
    async run(businessId, term, limit) {
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          barcode: products.barcode,
        })
        .from(products)
        .where(
          and(
            eq(products.tenant_id, businessId),
            isNull(products.deleted_at),
            textSearch(
              [
                sql`${products.name}`,
                sql`${products.sku}`,
                sql`coalesce(${products.barcode}, '')`,
              ],
              term,
            ),
          ),
        )
        .orderBy(products.name)
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        detail: [r.sku, r.barcode].filter(Boolean).join(" · ") || null,
        href: `/products/${r.id}`,
      }));
    },
  },
  {
    key: "customers",
    label: "Customers",
    icon: "Users",
    moduleSlug: "customers",
    permission: "customers.view",
    async run(businessId, term, limit) {
      const rows = await db
        .select({
          id: customers.id,
          name: customers.name,
          code: customers.code,
          phone: customers.phone,
        })
        .from(customers)
        .where(
          and(
            eq(customers.tenant_id, businessId),
            isNull(customers.deleted_at),
            textSearch(
              [
                sql`${customers.name}`,
                sql`${customers.code}`,
                sql`coalesce(${customers.phone}, '')`,
                sql`coalesce(${customers.email}, '')`,
              ],
              term,
            ),
          ),
        )
        .orderBy(customers.name)
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        detail: [r.code, r.phone].filter(Boolean).join(" · ") || null,
        href: `/customers/${r.id}`,
      }));
    },
  },
  {
    key: "suppliers",
    label: "Suppliers",
    icon: "Truck",
    moduleSlug: "suppliers",
    permission: "suppliers.view",
    async run(businessId, term, limit) {
      const rows = await db
        .select({
          id: suppliers.id,
          name: suppliers.company_name,
          code: suppliers.code,
          phone: suppliers.phone,
          contact: suppliers.contact_person,
        })
        .from(suppliers)
        .where(
          and(
            eq(suppliers.tenant_id, businessId),
            isNull(suppliers.deleted_at),
            textSearch(
              [
                sql`${suppliers.company_name}`,
                sql`${suppliers.code}`,
                sql`coalesce(${suppliers.contact_person}, '')`,
                sql`coalesce(${suppliers.phone}, '')`,
              ],
              term,
            ),
          ),
        )
        .orderBy(suppliers.company_name)
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        label: r.name,
        detail: [r.code, r.contact ?? r.phone].filter(Boolean).join(" · ") || null,
        href: `/suppliers/${r.id}`,
      }));
    },
  },
  {
    key: "sales",
    label: "Sales invoices",
    icon: "Receipt",
    moduleSlug: "sales",
    permission: "sales.view",
    async run(businessId, term, limit, currency) {
      const rows = await db
        .select({
          id: salesInvoices.id,
          number: salesInvoices.invoice_number,
          customerName: salesInvoices.customer_name,
          grandTotal: salesInvoices.grand_total,
          date: salesInvoices.invoice_date,
        })
        .from(salesInvoices)
        .where(
          and(
            eq(salesInvoices.tenant_id, businessId),
            textSearch(
              [
                sql`${salesInvoices.invoice_number}`,
                sql`coalesce(${salesInvoices.customer_name}, '')`,
              ],
              term,
            ),
          ),
        )
        .orderBy(desc(salesInvoices.invoice_date))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        label: r.number,
        detail: `${r.customerName ?? "Walk-in"} · ${formatMoney(r.grandTotal, { currency })}`,
        href: `/sales/${r.id}`,
      }));
    },
  },
  {
    key: "purchases",
    label: "Purchase orders",
    icon: "ShoppingBag",
    moduleSlug: "purchases",
    permission: "purchases.view",
    async run(businessId, term, limit, currency) {
      const rows = await db
        .select({
          id: purchaseOrders.id,
          number: purchaseOrders.order_number,
          supplierName: suppliers.company_name,
          grandTotal: purchaseOrders.grand_total,
        })
        .from(purchaseOrders)
        .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
        .where(
          and(
            eq(purchaseOrders.tenant_id, businessId),
            textSearch([sql`${purchaseOrders.order_number}`], term),
          ),
        )
        .orderBy(desc(purchaseOrders.order_date))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        label: r.number,
        detail: [r.supplierName, formatMoney(r.grandTotal, { currency })]
          .filter(Boolean)
          .join(" · "),
        href: `/purchases/${r.id}`,
      }));
    },
  },
];

/** Sources this user is allowed to search, in declaration order. */
export function searchableSources(ctx: BusinessContext): {
  key: string;
  label: string;
}[] {
  return SOURCES.filter((s) =>
    canAccess(ctx, {
      module: s.moduleSlug,
      feature: s.feature,
      permission: s.permission,
    }),
  ).map((s) => ({ key: s.key, label: s.label }));
}

export interface SearchOptions {
  /** Restrict to one source key; omit to search everything allowed. */
  source?: string | null;
  /** Hits per group. */
  limit?: number;
}

export async function search(
  ctx: BusinessContext,
  term: string,
  options: SearchOptions = {},
): Promise<SearchGroup[]> {
  const trimmed = term.trim();
  // A single character matches almost everything and is never a useful query.
  if (trimmed.length < 2) return [];

  const limit = options.limit ?? 6;

  const allowed = SOURCES.filter((s) => {
    if (options.source && s.key !== options.source) return false;
    return canAccess(ctx, {
      module: s.moduleSlug,
      feature: s.feature,
      permission: s.permission,
    });
  });

  const groups = await Promise.all(
    allowed.map(async (source) => {
      // One extra row reveals whether more exist without a second count query.
      const hits = await source.run(
        ctx.business.id,
        trimmed,
        limit + 1,
        ctx.business.currency,
      );
      return {
        key: source.key,
        label: source.label,
        icon: source.icon,
        moduleSlug: source.moduleSlug,
        hits: hits.slice(0, limit),
        truncated: hits.length > limit,
      };
    }),
  );

  return groups.filter((g) => g.hits.length > 0);
}
