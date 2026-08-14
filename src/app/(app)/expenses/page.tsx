import type { Metadata } from "next";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import { CrudPanel, type CrudRow } from "@/components/shared/crud-panel";
import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import {
  DateRangeFilter,
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { db } from "@/db";
import { stores, expenseCategories, expenses, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission, seesAllStores } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatMoney, humanise } from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";

import {
  deleteExpenseCategory,
  saveExpense,
  saveExpenseCategory,
} from "./actions";
import { ExpenseApprovalButtons } from "./approval-buttons";
import { ExpenseForm } from "./expense-form";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("expenses.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
  });

  const currency = ctx.business.currency;
  const canCreate = hasPermission(ctx, "expenses.create");
  const canApprove =
    hasPermission(ctx, "expenses.approve") &&
    ctx.entitlements.features.has("expenses.approvals");

  const filters = [eq(expenses.tenant_id, ctx.business.id)];

  if (!seesAllStores(ctx) && ctx.activeStore) {
    filters.push(eq(expenses.store_id, ctx.activeStore.id));
  }
  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(expenses.title, term),
        ilike(expenses.expense_number, term),
        ilike(expenses.reference, term),
      )!,
    );
  }
  if (query.filters.category) {
    filters.push(eq(expenses.category_id, query.filters.category));
  }
  if (query.filters.from) {
    filters.push(gte(expenses.expense_date, new Date(query.filters.from)));
  }
  if (query.filters.to) {
    const to = new Date(query.filters.to);
    to.setHours(23, 59, 59, 999);
    filters.push(lte(expenses.expense_date, to));
  }

  const where = and(...filters);

  const [rows, totalRow, aggregate, categoryRows] = await Promise.all([
    db
      .select({
        id: expenses.id,
        number: expenses.expense_number,
        title: expenses.title,
        date: expenses.expense_date,
        amount: expenses.amount,
        taxAmount: expenses.tax_amount,
        method: expenses.method,
        reference: expenses.reference,
        note: expenses.note,
        categoryId: expenses.category_id,
        categoryName: expenseCategories.name,
        storeName: stores.name,
        createdById: expenses.created_by,
        createdByName: users.full_name,
        approvalStatus: expenses.approval_status,
        rejectionReason: expenses.rejection_reason,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.category_id))
      .innerJoin(stores, eq(stores.id, expenses.store_id))
      .leftJoin(users, eq(users.id, expenses.created_by))
      .where(where)
      .orderBy(desc(expenses.expense_date))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(expenses).where(where),

    db
      .select({
        total: sql<string>`coalesce(sum(${expenses.amount} + ${expenses.tax_amount}), 0)`,
        thisMonth: sql<string>`coalesce(sum(case when date_trunc('month', ${expenses.expense_date}) = date_trunc('month', now()) then ${expenses.amount} + ${expenses.tax_amount} else 0 end), 0)`,
      })
      .from(expenses)
      .where(where),

    db
      .select({
        id: expenseCategories.id,
        name: expenseCategories.name,
        isActive: expenseCategories.is_active,
        usage: db.$count(
          expenses,
          eq(expenses.category_id, expenseCategories.id),
        ),
      })
      .from(expenseCategories)
      .where(eq(expenseCategories.tenant_id, ctx.business.id))
      .orderBy(asc(expenseCategories.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];
  const pageTotal = rows.reduce(
    (acc, r) => acc + Number(r.amount) + Number(r.taxAmount),
    0,
  );

  const baseParams = {
    search: query.search,
    category: query.filters.category,
    from: query.filters.from,
    to: query.filters.to,
  };

  const categoryCrudRows: CrudRow[] = categoryRows.map((row) => ({
    id: row.id,
    values: { name: row.name, is_active: row.isActive },
    deleteBlockedReason:
      row.usage > 0 ? `${row.usage} expense${row.usage === 1 ? "" : "s"} recorded` : undefined,
    cells: {
      name: <span className="font-medium">{row.name}</span>,
      usage: row.usage,
    },
  }));

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        description="Operating costs feed net profit and cash reporting."
      />

      <StatGrid>
        <StatTile
          label="Total expenses"
          value={formatMoney(stats?.total ?? "0", { currency })}
          sublabel={
            Object.values(baseParams).some(Boolean) ? "Filtered" : "All time"
          }
          tone="danger"
          icon="Wallet"
        />
        <StatTile
          label="This month"
          value={formatMoney(stats?.thisMonth ?? "0", { currency })}
          icon="TrendingDown"
        />
        <StatTile label="Entries" value={String(total)} icon="FileText" />
      </StatGrid>

      {canCreate ? (
        <ExpenseForm
          categories={categoryRows
            .filter((c) => c.isActive)
            .map((c) => ({ id: c.id, name: c.name }))}
          currencySymbol={currency}
          saveAction={saveExpense}
        />
      ) : null}

      <FilterBar>
        <SearchFilter placeholder="Search title, number or reference…" />
        <SelectFilter
          paramName="category"
          label="Category"
          options={categoryRows.map((c) => ({ value: c.id, label: c.name }))}
        />
        <DateRangeFilter />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Number</TH>
            <TH>Date</TH>
            <TH>Description</TH>
            <TH>Category</TH>
            <TH>Method</TH>
            <TH>Store</TH>
            <TH>Recorded by</TH>
            <TH align="right">Amount</TH>
            <TH align="right">Approval</TH>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={9}>
                No expenses recorded for these filters.
              </EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD mono>{row.number}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDate(row.date)}
                  </TD>
                  <TD>
                    <div className="font-medium">{row.title}</div>
                    {row.reference ? (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {row.reference}
                      </div>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">
                    {row.categoryName ?? "—"}
                  </TD>
                  <TD className="text-muted-foreground">
                    {humanise(row.method)}
                  </TD>
                  <TD className="text-muted-foreground">{row.storeName}</TD>
                  <TD className="text-muted-foreground">
                    {row.createdByName ?? "—"}
                  </TD>
                  <TD align="right" className="font-medium">
                    {formatMoney(
                      Number(row.amount) + Number(row.taxAmount),
                      { currency },
                    )}
                  </TD>
                  <TD align="right">
                    {row.approvalStatus === "pending" && canApprove ? (
                      <ExpenseApprovalButtons
                        expenseId={row.id}
                        expenseNumber={row.number}
                        ownedByMe={row.createdById === ctx.user.id}
                      />
                    ) : row.approvalStatus === "not_required" ? (
                      <span className="text-[11px] text-muted-foreground">
                        Not needed
                      </span>
                    ) : (
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <StatusBadge status={row.approvalStatus} />
                        {row.rejectionReason ? (
                          <span className="max-w-[160px] truncate text-[11px] text-muted-foreground">
                            {row.rejectionReason}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
          {rows.length > 0 ? (
            <TFoot>
              <TD colSpan={7} align="right">
                Page total
              </TD>
              <TD align="right">{formatMoney(pageTotal, { currency })}</TD>
              <TD />
            </TFoot>
          ) : null}
        </Table>
        <Pagination
          page={query.page}
          limit={query.limit}
          total={total}
          baseParams={baseParams}
        />
      </TableShell>

      {hasPermission(ctx, "expenses.update") ? (
        <CrudPanel
          title="Expense categories"
          description="Used for grouping in the expense and profit reports."
          addLabel="Add category"
          emptyMessage="No categories defined."
          columns={[
            { key: "name", label: "Name" },
            { key: "usage", label: "Entries", align: "right" },
          ]}
          rows={categoryCrudRows}
          fields={[
            { name: "name", label: "Category name", required: true },
            { name: "is_active", label: "Active", type: "boolean" },
          ]}
          saveAction={saveExpenseCategory}
          deleteAction={deleteExpenseCategory}
          canWrite
          canDelete
        />
      ) : null}
    </div>
  );
}
