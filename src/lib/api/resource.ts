import "server-only";

import { type NextRequest } from "next/server";
import { and, asc, count, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import { db } from "@/db";
import { parseListQuery, pickFields, safeSort } from "@/lib/api/query";
import { failFrom, ok, paginationMeta } from "@/lib/api/response";
import { requirePermission } from "@/lib/authz/guard";
import { buildQueryString } from "@/lib/api/query";

/**
 * Generic list endpoint builder.
 *
 * Every collection route shares the same envelope, pagination, sorting, search,
 * filtering and field selection, so behaviour is uniform across resources
 * (18-api-specification.md).
 */
export interface ResourceConfig {
  /* Typed as the base `PgTable` rather than a generic: the table is only ever
     used positionally in `from()`, and a generic parameter makes drizzle`s
     selection-shape conditional unresolvable. */
  table: PgTable;
  /** Permission required to read the collection. */
  permission: string;
  /** Feature entitlement required, if any. */
  feature?: string;
  /** Columns exposed in responses, keyed by their public name. */
  columns: Record<string, PgColumn>;
  /** Columns searched by `?search=`. */
  searchColumns?: PgColumn[];
  /** Columns permitted in `?sort=`. */
  sortable: string[];
  defaultSort: { field: string; direction: "asc" | "desc" };
  /** Exact-match filters, keyed by query parameter name. */
  filters?: Record<string, PgColumn>;
  /** Soft-delete column to exclude by default. */
  softDeleteColumn?: PgColumn;
  /** Business scoping column — always `tenant_id`. */
  tenantColumn: PgColumn;
  /**
   * Conditions the caller always applies, such as narrowing to the signed-in
   * user's own rows. Kept separate from `filters` on purpose: a filter is driven
   * by a query parameter and can therefore be omitted by the client, while these
   * cannot.
   */
  extraConditions?: SQL[];
}

export async function handleList(request: NextRequest, config: ResourceConfig) {
  try {
    /* `onDenied: "throw"` because this is an API: a denial must come back as a
       JSON envelope with a 403, not as a rendered HTML error page. */
    const ctx = await requirePermission(config.permission, {
      feature: config.feature,
      onDenied: "throw",
    });

    const query = parseListQuery(request.nextUrl.searchParams, {
      defaultLimit: 25,
      defaultSort: `${config.defaultSort.direction === "desc" ? "-" : ""}${config.defaultSort.field}`,
    });

    const conditions: (SQL | undefined)[] = [
      eq(config.tenantColumn, ctx.business.id),
    ];

    // Soft-deleted rows are excluded unless explicitly requested.
    if (config.softDeleteColumn && query.filters.deleted !== "1") {
      conditions.push(isNull(config.softDeleteColumn));
    }

    if (query.search && config.searchColumns?.length) {
      const term = `%${query.search}%`;
      conditions.push(
        or(...config.searchColumns.map((column) => ilike(column, term))),
      );
    }

    for (const [param, column] of Object.entries(config.filters ?? {})) {
      const value = query.filters[param];
      if (value) conditions.push(eq(column, value));
    }

    for (const condition of config.extraConditions ?? []) {
      conditions.push(condition);
    }

    const where = and(...conditions.filter(Boolean));

    const sort = safeSort(query.sort, config.sortable, config.defaultSort);
    const sortColumn = config.columns[sort.field];

    const [rows, totalRow] = await Promise.all([
      db
        .select(config.columns)
        .from(config.table)
        .where(where)
        .orderBy(sort.direction === "asc" ? asc(sortColumn) : desc(sortColumn))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ value: count() }).from(config.table).where(where),
    ]);

    const total = Number(totalRow[0]?.value ?? 0);
    const pages = Math.max(1, Math.ceil(total / query.limit));

    const linkParams = {
      ...query.filters,
      search: query.search,
      limit: query.limit,
      sort: `${sort.direction === "desc" ? "-" : ""}${sort.field}`,
    };
    const path = request.nextUrl.pathname;

    return ok(
      rows.map((row) => pickFields(row as Record<string, unknown>, query.fields)),
      {
        message: `${total} record(s).`,
        meta: paginationMeta(query.page, query.limit, total),
        links: {
          self: `${path}${buildQueryString({ ...linkParams, page: query.page })}`,
          next:
            query.page < pages
              ? `${path}${buildQueryString({ ...linkParams, page: query.page + 1 })}`
              : null,
          prev:
            query.page > 1
              ? `${path}${buildQueryString({ ...linkParams, page: query.page - 1 })}`
              : null,
        },
      },
    );
  } catch (error) {
    return failFrom(error);
  }
}

/** Generic single-record endpoint. */
export async function handleShow(id: string, config: ResourceConfig) {
  try {
    const ctx = await requirePermission(config.permission, {
      feature: config.feature,
      onDenied: "throw",
    });

    const idColumn = config.columns.id;
    if (!idColumn) {
      throw new Error("Resource config must expose an `id` column.");
    }

    const [row] = await db
      .select(config.columns)
      .from(config.table)
      .where(and(eq(config.tenantColumn, ctx.business.id), eq(idColumn, id)))
      .limit(1);

    if (!row) {
      const { NotFoundError } = await import("@/lib/authz/errors");
      throw NotFoundError();
    }

    return ok(row);
  } catch (error) {
    return failFrom(error);
  }
}
