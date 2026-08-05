import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";

import {
  EmptyRow,
  Pagination,
  SortableTH,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { MergeDialog } from "@/components/shared/merge-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SheetTools } from "@/components/shared/sheet-tools";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { parseListQuery, safeSort } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { canExport, canImport, SPEC_BY_SLUG } from "@/lib/excel";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { mergeDuplicateSuppliers } from "./actions";

export const metadata: Metadata = { title: "Suppliers" };

const SORTABLE = ["company_name", "code", "outstanding", "total_purchases", "rating"] as const;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("suppliers.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
    defaultSort: "company_name",
  });
  const sort = safeSort(query.sort, SORTABLE, {
    field: "company_name",
    direction: "asc",
  });

  const currency = ctx.business.currency;
  const ratingsEnabled = ctx.entitlements.features.has("suppliers.ratings");
  const canViewPayables = hasPermission(ctx, "suppliers.payment");

  const filters = [
    eq(suppliers.tenant_id, ctx.business.id),
    isNull(suppliers.deleted_at),
  ];

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(suppliers.company_name, term),
        ilike(suppliers.code, term),
        ilike(suppliers.contact_person, term),
        ilike(suppliers.phone, term),
        ilike(suppliers.email, term),
        ilike(suppliers.tax_number, term),
      )!,
    );
  }
  if (query.filters.status) {
    filters.push(
      eq(
        suppliers.status,
        query.filters.status as typeof suppliers.$inferSelect.status,
      ),
    );
  }
  if (query.filters.type) {
    filters.push(
      eq(suppliers.type, query.filters.type as typeof suppliers.$inferSelect.type),
    );
  }
  if (query.filters.outstanding === "1") {
    filters.push(sql`${suppliers.outstanding_balance} > 0`);
  }

  const where = and(...filters);

  const orderBy = {
    company_name: suppliers.company_name,
    code: suppliers.code,
    outstanding: suppliers.outstanding_balance,
    total_purchases: suppliers.total_purchases,
    rating: suppliers.rating,
  }[sort.field];

  const [rows, totalRow, aggregate] = await Promise.all([
    db
      .select({
        id: suppliers.id,
        code: suppliers.code,
        companyName: suppliers.company_name,
        contactPerson: suppliers.contact_person,
        type: suppliers.type,
        phone: suppliers.phone,
        email: suppliers.email,
        status: suppliers.status,
        creditDays: suppliers.credit_days,
        outstanding: suppliers.outstanding_balance,
        totalPurchases: suppliers.total_purchases,
        purchaseCount: suppliers.purchase_count,
        lastPurchaseAt: suppliers.last_purchase_at,
        rating: suppliers.rating,
        leadTime: suppliers.average_lead_time_days,
      })
      .from(suppliers)
      .where(where)
      .orderBy(sort.direction === "asc" ? asc(orderBy) : desc(orderBy))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(suppliers).where(where),

    db
      .select({
        payables: sql<string>`coalesce(sum(${suppliers.outstanding_balance}), 0)`,
        spend: sql<string>`coalesce(sum(${suppliers.total_purchases}), 0)`,
        owing: sql<number>`count(*) filter (where ${suppliers.outstanding_balance} > 0)::int`,
      })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenant_id, ctx.business.id),
          isNull(suppliers.deleted_at),
        ),
      ),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];

  const baseParams = {
    search: query.search,
    status: query.filters.status,
    type: query.filters.type,
    outstanding: query.filters.outstanding,
    sort: `${sort.direction === "desc" ? "-" : ""}${sort.field}`,
  };
  const isFiltered = Boolean(
    query.search ||
      query.filters.status ||
      query.filters.type ||
      query.filters.outstanding,
  );

  // Merging picks from the whole book, not just the current page.
  const canMerge = hasPermission(ctx, "suppliers.merge");
  const mergeCandidates = canMerge
    ? (
        await db
          .select({
            id: suppliers.id,
            name: suppliers.company_name,
            code: suppliers.code,
            contact: suppliers.contact_person,
          })
          .from(suppliers)
          .where(
            and(
              eq(suppliers.tenant_id, ctx.business.id),
              isNull(suppliers.deleted_at),
            ),
          )
          .orderBy(asc(suppliers.company_name))
          .limit(500)
      ).map((s) => ({
        id: s.id,
        label: s.name,
        detail: s.contact ?? s.code,
      }))
    : [];

  return (
    <div className="page">
      <PageHeader
        title="Suppliers"
        description={`${total} supplier${total === 1 ? "" : "s"}`}
        actions={
          <>
            <SheetTools
              slug="suppliers"
              label="suppliers"
              canImport={canImport(ctx, SPEC_BY_SLUG.suppliers)}
              canExport={canExport(ctx, SPEC_BY_SLUG.suppliers)}
            />
            {canMerge ? (
              <MergeDialog
                entityLabel="supplier"
                candidates={mergeCandidates}
                action={mergeDuplicateSuppliers}
              />
            ) : null}
            {hasPermission(ctx, "suppliers.create") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/suppliers/new" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New supplier
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid>
        <StatTile label="Suppliers" value={String(total)} icon="Truck" />
        <StatTile
          label="Total spend"
          value={formatMoney(stats?.spend ?? "0", { currency })}
          sublabel="Goods received"
          tone="accent"
          icon="ShoppingBag"
        />
        {canViewPayables ? (
          <StatTile
            label="Outstanding payables"
            value={formatMoney(stats?.payables ?? "0", { currency })}
            sublabel={`${stats?.owing ?? 0} with a balance`}
            tone={Number(stats?.payables ?? 0) > 0 ? "warning" : "neutral"}
            icon="CreditCard"
            href="/suppliers?outstanding=1"
          />
        ) : null}
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search company, contact, phone or tax number…" />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "blocked", label: "Blocked" },
            { value: "archived", label: "Archived" },
          ]}
        />
        <SelectFilter
          paramName="type"
          label="Type"
          options={[
            { value: "manufacturer", label: "Manufacturer" },
            { value: "distributor", label: "Distributor" },
            { value: "wholesaler", label: "Wholesaler" },
            { value: "importer", label: "Importer" },
            { value: "local_vendor", label: "Local vendor" },
            { value: "service_provider", label: "Service provider" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="Truck"
          title="No suppliers yet"
          description="Every purchase order belongs to a supplier. Add your vendors to start purchasing."
          action={
            hasPermission(ctx, "suppliers.create")
              ? { label: "Add a supplier", href: "/suppliers/new" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <SortableTH
                field="company_name"
                currentSort={baseParams.sort}
                baseParams={baseParams}
              >
                Supplier
              </SortableTH>
              <SortableTH field="code" currentSort={baseParams.sort} baseParams={baseParams}>
                Code
              </SortableTH>
              <TH>Type</TH>
              <TH>Contact</TH>
              <TH align="right">Terms</TH>
              <SortableTH
                field="total_purchases"
                currentSort={baseParams.sort}
                baseParams={baseParams}
                align="right"
              >
                Spend
              </SortableTH>
              {canViewPayables ? (
                <SortableTH
                  field="outstanding"
                  currentSort={baseParams.sort}
                  baseParams={baseParams}
                  align="right"
                >
                  Payable
                </SortableTH>
              ) : null}
              {ratingsEnabled ? <TH align="right">Rating</TH> : null}
              <TH>Last order</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={10}>No suppliers match these filters.</EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/suppliers/${row.id}`}
                        className="font-medium hover:text-accent hover:underline"
                      >
                        {row.companyName}
                      </Link>
                      {row.contactPerson ? (
                        <div className="text-[11px] text-muted-foreground">
                          {row.contactPerson}
                        </div>
                      ) : null}
                    </TD>
                    <TD mono>{row.code}</TD>
                    <TD>
                      <Badge variant="soft-neutral">{humanise(row.type)}</Badge>
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.phone ?? row.email ?? "—"}
                    </TD>
                    <TD align="right" className="text-muted-foreground">
                      {row.creditDays > 0 ? `Net ${row.creditDays}` : "—"}
                    </TD>
                    <TD align="right">
                      {formatMoney(row.totalPurchases, { currency })}
                    </TD>
                    {canViewPayables ? (
                      <TD
                        align="right"
                        className={
                          Number(row.outstanding) > 0
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {Number(row.outstanding) > 0
                          ? formatMoney(row.outstanding, { currency })
                          : "—"}
                      </TD>
                    ) : null}
                    {ratingsEnabled ? (
                      <TD align="right">
                        {Number(row.rating) > 0 ? (
                          <span className="font-medium">
                            {Number(row.rating).toFixed(1)}
                            <span className="text-muted-foreground"> / 5</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </TD>
                    ) : null}
                    <TD className="text-muted-foreground">
                      {row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : "—"}
                    </TD>
                    <TD align="right">
                      <StatusBadge status={row.status} />
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
      )}
    </div>
  );
}
