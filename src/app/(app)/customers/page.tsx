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
import { customerGroups, customers } from "@/db/schema";
import { parseListQuery, safeSort } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { canExport, canImport, SPEC_BY_SLUG } from "@/lib/excel";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { mergeDuplicateCustomers } from "./actions";

export const metadata: Metadata = { title: "Customers" };

const SORTABLE = ["name", "code", "outstanding", "total_purchases", "last_purchase"] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("customers.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
    defaultSort: "name",
  });
  const sort = safeSort(query.sort, SORTABLE, { field: "name", direction: "asc" });

  const currency = ctx.business.currency;
  const creditEnabled = ctx.entitlements.features.has("customers.credit");
  const loyaltyEnabled = ctx.entitlements.features.has("customers.loyalty");

  const filters = [
    eq(customers.tenant_id, ctx.business.id),
    isNull(customers.deleted_at),
  ];

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(customers.name, term),
        ilike(customers.code, term),
        ilike(customers.phone, term),
        ilike(customers.email, term),
        ilike(customers.company_name, term),
      )!,
    );
  }
  if (query.filters.status) {
    filters.push(
      eq(
        customers.status,
        query.filters.status as typeof customers.$inferSelect.status,
      ),
    );
  }
  if (query.filters.type) {
    filters.push(
      eq(customers.type, query.filters.type as typeof customers.$inferSelect.type),
    );
  }
  if (query.filters.group) {
    filters.push(eq(customers.group_id, query.filters.group));
  }
  if (query.filters.outstanding === "1") {
    filters.push(sql`${customers.outstanding_balance} > 0`);
  }

  const where = and(...filters);

  const orderBy = {
    name: customers.name,
    code: customers.code,
    outstanding: customers.outstanding_balance,
    total_purchases: customers.total_purchases,
    last_purchase: customers.last_purchase_at,
  }[sort.field];

  const [rows, totalRow, aggregate, groupOptions] = await Promise.all([
    db
      .select({
        id: customers.id,
        code: customers.code,
        name: customers.name,
        companyName: customers.company_name,
        type: customers.type,
        phone: customers.phone,
        email: customers.email,
        status: customers.status,
        isWalkIn: customers.is_walk_in,
        creditLimit: customers.credit_limit,
        outstanding: customers.outstanding_balance,
        loyaltyPoints: customers.loyalty_points,
        totalPurchases: customers.total_purchases,
        purchaseCount: customers.purchase_count,
        lastPurchaseAt: customers.last_purchase_at,
        groupName: customerGroups.name,
      })
      .from(customers)
      .leftJoin(customerGroups, eq(customerGroups.id, customers.group_id))
      .where(where)
      .orderBy(sort.direction === "asc" ? asc(orderBy) : desc(orderBy))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(customers).where(where),

    db
      .select({
        outstanding: sql<string>`coalesce(sum(${customers.outstanding_balance}), 0)`,
        lifetime: sql<string>`coalesce(sum(${customers.total_purchases}), 0)`,
        withCredit: sql<number>`count(*) filter (where ${customers.outstanding_balance} > 0)::int`,
      })
      .from(customers)
      .where(
        and(
          eq(customers.tenant_id, ctx.business.id),
          isNull(customers.deleted_at),
        ),
      ),

    db
      .select({ id: customerGroups.id, name: customerGroups.name })
      .from(customerGroups)
      .where(eq(customerGroups.tenant_id, ctx.business.id))
      .orderBy(asc(customerGroups.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];

  const baseParams = {
    search: query.search,
    status: query.filters.status,
    type: query.filters.type,
    group: query.filters.group,
    outstanding: query.filters.outstanding,
    sort: `${sort.direction === "desc" ? "-" : ""}${sort.field}`,
  };
  const isFiltered = Boolean(
    query.search ||
      query.filters.status ||
      query.filters.type ||
      query.filters.group ||
      query.filters.outstanding,
  );

  /* Merging picks from the whole book, not just the current page, and the
     walk-in fixture is excluded because it can never be merged away. */
  const canMerge = hasPermission(ctx, "customers.merge");
  const mergeCandidates = canMerge
    ? (
        await db
          .select({
            id: customers.id,
            name: customers.name,
            code: customers.code,
            phone: customers.phone,
          })
          .from(customers)
          .where(
            and(
              eq(customers.tenant_id, ctx.business.id),
              isNull(customers.deleted_at),
              eq(customers.is_walk_in, false),
            ),
          )
          .orderBy(asc(customers.name))
          .limit(500)
      ).map((c) => ({
        id: c.id,
        label: c.name,
        detail: c.phone ?? c.code,
      }))
    : [];

  return (
    <div className="page">
      <PageHeader
        title="Customers"
        description={`${total} customer${total === 1 ? "" : "s"}`}
        actions={
          <>
            <SheetTools
              slug="customers"
              label="customers"
              canImport={canImport(ctx, SPEC_BY_SLUG.customers)}
              canExport={canExport(ctx, SPEC_BY_SLUG.customers)}
            />
            {canMerge ? (
              <MergeDialog
                entityLabel="customer"
                candidates={mergeCandidates}
                action={mergeDuplicateCustomers}
              />
            ) : null}
            {ctx.entitlements.features.has("customers.groups") &&
            hasPermission(ctx, "customers.update") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/customers/groups">Groups</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "customers.create") ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/customers/new" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New customer
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Customers"
          value={String(total)}
          icon="Users"
        />
        <StatTile
          label="Lifetime value"
          value={formatMoney(stats?.lifetime ?? "0", { currency })}
          sublabel="All completed sales"
          tone="accent"
          icon="Coins"
        />
        {creditEnabled ? (
          <StatTile
            label="Outstanding credit"
            value={formatMoney(stats?.outstanding ?? "0", { currency })}
            sublabel={`${stats?.withCredit ?? 0} with a balance`}
            tone={Number(stats?.outstanding ?? 0) > 0 ? "warning" : "neutral"}
            icon="CreditCard"
            href="/customers?outstanding=1"
          />
        ) : null}
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search name, code, phone or email…" />
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
            { value: "retail", label: "Retail" },
            { value: "wholesale", label: "Wholesale" },
            { value: "corporate", label: "Corporate" },
            { value: "distributor", label: "Distributor" },
            { value: "walk_in", label: "Walk-in" },
          ]}
        />
        {groupOptions.length > 0 ? (
          <SelectFilter
            paramName="group"
            label="Group"
            options={groupOptions.map((g) => ({ value: g.id, label: g.name }))}
          />
        ) : null}
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="Users"
          title="No customers yet"
          description="Walk-in billing works without customer records. Add customers to track purchase history, credit and loyalty."
          action={
            hasPermission(ctx, "customers.create")
              ? { label: "Add a customer", href: "/customers/new" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <SortableTH field="name" currentSort={baseParams.sort} baseParams={baseParams}>
                Customer
              </SortableTH>
              <SortableTH field="code" currentSort={baseParams.sort} baseParams={baseParams}>
                Code
              </SortableTH>
              <TH>Type</TH>
              <TH>Contact</TH>
              <SortableTH
                field="total_purchases"
                currentSort={baseParams.sort}
                baseParams={baseParams}
                align="right"
              >
                Lifetime
              </SortableTH>
              <TH align="right">Orders</TH>
              {creditEnabled ? (
                <SortableTH
                  field="outstanding"
                  currentSort={baseParams.sort}
                  baseParams={baseParams}
                  align="right"
                >
                  Owes
                </SortableTH>
              ) : null}
              {loyaltyEnabled ? <TH align="right">Points</TH> : null}
              <SortableTH
                field="last_purchase"
                currentSort={baseParams.sort}
                baseParams={baseParams}
              >
                Last purchase
              </SortableTH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={10}>No customers match these filters.</EmptyRow>
              ) : (
                rows.map((row) => {
                  const overLimit =
                    Number(row.creditLimit) > 0 &&
                    Number(row.outstanding) > Number(row.creditLimit);
                  return (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/customers/${row.id}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.companyName ? (
                          <div className="text-[11px] text-muted-foreground">
                            {row.companyName}
                          </div>
                        ) : null}
                        {row.isWalkIn ? (
                          <Badge variant="soft-neutral" className="mt-1">
                            Default
                          </Badge>
                        ) : null}
                      </TD>
                      <TD mono>{row.code}</TD>
                      <TD>
                        <Badge variant="soft-neutral">{humanise(row.type)}</Badge>
                        {row.groupName ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {row.groupName}
                          </div>
                        ) : null}
                      </TD>
                      <TD className="text-muted-foreground">
                        {row.phone ?? row.email ?? "—"}
                      </TD>
                      <TD align="right">
                        {formatMoney(row.totalPurchases, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {row.purchaseCount}
                      </TD>
                      {creditEnabled ? (
                        <TD
                          align="right"
                          className={
                            overLimit
                              ? "font-semibold text-destructive"
                              : Number(row.outstanding) > 0
                                ? "font-semibold text-warning"
                                : "text-muted-foreground"
                          }
                        >
                          {Number(row.outstanding) > 0
                            ? formatMoney(row.outstanding, { currency })
                            : "—"}
                        </TD>
                      ) : null}
                      {loyaltyEnabled ? (
                        <TD align="right" className="text-muted-foreground">
                          {Number(row.loyaltyPoints) > 0
                            ? Number(row.loyaltyPoints)
                            : "—"}
                        </TD>
                      ) : null}
                      <TD className="text-muted-foreground">
                        {row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : "—"}
                      </TD>
                      <TD align="right">
                        <StatusBadge status={row.status} />
                      </TD>
                    </TR>
                  );
                })
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
