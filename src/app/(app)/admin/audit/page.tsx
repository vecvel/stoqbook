import type { Metadata } from "next";
import { and, asc, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import {
  DateRangeFilter,
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { auditLogs, stores } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDateTime, humanise } from "@/lib/format";
import { ALL_MODULES } from "@/lib/registry";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdmin("admin.audit_view");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 50 });

  const filters = [eq(auditLogs.tenant_id, ctx.business.id)];

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(auditLogs.event, term),
        ilike(auditLogs.summary, term),
        ilike(auditLogs.actor_name, term),
      )!,
    );
  }
  if (query.filters.store) {
    filters.push(eq(auditLogs.store_id, query.filters.store));
  }
  if (query.filters.actor) {
    filters.push(eq(auditLogs.actor_type, query.filters.actor));
  }
  if (query.filters.module) {
    filters.push(eq(auditLogs.module_slug, query.filters.module));
  }
  if (query.filters.from) {
    filters.push(gte(auditLogs.created_at, new Date(query.filters.from)));
  }
  if (query.filters.to) {
    const to = new Date(query.filters.to);
    to.setHours(23, 59, 59, 999);
    filters.push(lte(auditLogs.created_at, to));
  }

  const where = and(...filters);

  const [rows, totalRow, storeOptions] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        event: auditLogs.event,
        summary: auditLogs.summary,
        module: auditLogs.module_slug,
        entityType: auditLogs.entity_type,
        entityId: auditLogs.entity_id,
        actorName: auditLogs.actor_name,
        actorType: auditLogs.actor_type,
        ip: auditLogs.ip_address,
        payload: auditLogs.payload,
        createdAt: auditLogs.created_at,
        storeId: auditLogs.store_id,
        storeName: stores.name,
      })
      .from(auditLogs)
      .leftJoin(stores, eq(stores.id, auditLogs.store_id))
      .where(where)
      .orderBy(desc(auditLogs.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(auditLogs).where(where),

    db
      .select({ id: stores.id, name: stores.name })
      .from(stores)
      .where(eq(stores.tenant_id, ctx.business.id))
      .orderBy(asc(stores.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const baseParams = {
    search: query.search,
    store: query.filters.store,
    actor: query.filters.actor,
    module: query.filters.module,
    from: query.filters.from,
    to: query.filters.to,
  };

  return (
    <div className="page">
      <PageHeader
        title="Audit log"
        description={`${total} recorded event${total === 1 ? "" : "s"} across ${ctx.business.name}`}
      />

      <Notice tone="info">
        Audit records are append-only: they are never edited or deleted, and each
        one captures the acting principal, timestamp and originating address.
      </Notice>

      <FilterBar>
        <SearchFilter placeholder="Search event, summary or actor…" />
        <SelectFilter
          paramName="store"
          label="Store"
          options={storeOptions.map((s) => ({ value: s.id, label: s.name }))}
        />
        <SelectFilter
          paramName="actor"
          label="Actor"
          options={[
            { value: "user", label: "User" },
            { value: "system", label: "System" },
          ]}
        />
        <SelectFilter
          paramName="module"
          label="Module"
          options={ALL_MODULES.map((m) => ({ value: m.slug, label: m.name }))}
        />
        <DateRangeFilter />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>When</TH>
            <TH>Event</TH>
            <TH>Store</TH>
            <TH>Actor</TH>
            <TH>Entity</TH>
            <TH>Detail</TH>
            <TH>IP</TH>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>No audit entries match these filters.</EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TD>
                  <TD>
                    <div className="font-medium">{row.event}</div>
                    {row.module ? (
                      <div className="text-[11px] text-muted-foreground">
                        {humanise(row.module)}
                      </div>
                    ) : null}
                  </TD>
                  <TD>
                    {row.storeId ? (
                      row.storeName
                    ) : (
                      <Badge variant="soft-neutral">Business-wide</Badge>
                    )}
                  </TD>
                  <TD>
                    <div>{row.actorName ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {humanise(row.actorType)}
                    </div>
                  </TD>
                  <TD className="text-[11px] text-muted-foreground">
                    {row.entityType ? humanise(row.entityType) : "—"}
                  </TD>
                  <TD className="max-w-[320px] truncate text-muted-foreground">
                    {row.summary ?? "—"}
                  </TD>
                  <TD mono className="text-[11px] text-muted-foreground">
                    {row.ip ?? "—"}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        <Pagination
          page={query.page}
          limit={query.limit}
          total={total}
          baseParams={baseParams}
        />
      </TableShell>
    </div>
  );
}
