import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Download } from "lucide-react";

import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import {
  DateRangeFilter,
  FilterBar,
  ResetFilters,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile, type TileTone } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { categories, users } from "@/db/schema";
import { buildQueryString } from "@/lib/api/query";
import { canAccess, hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  formatQuantity,
  humanise,
} from "@/lib/format";
import { REPORT_BY_KEY } from "@/lib/registry";
import {
  IMPLEMENTED_REPORTS,
  runReport,
  type ColumnFormat,
  type ReportColumn,
} from "@/lib/services/reports";

import { scopedWarehouses } from "../../inventory/warehouse-scope";
import { SaveReportDialog } from "./save-report-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const { key } = await params;
  const report = REPORT_BY_KEY[decodeURIComponent(key)];
  return { title: report?.name ?? "Report" };
}

export default async function ReportRunnerPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const query = await searchParams;

  const definition = REPORT_BY_KEY[key];
  if (!definition || !IMPLEMENTED_REPORTS.has(key)) notFound();

  // The report's own declared permission is the gate.
  const ctx = await requirePermission(definition.permission, {
    module: definition.moduleSlug,
    feature: definition.feature,
  });

  // Double-check module and feature entitlement for defence in depth.
  if (
    !canAccess(ctx, {
      module: definition.moduleSlug,
      feature: definition.feature,
      permission: definition.permission,
    })
  ) {
    notFound();
  }

  const from = typeof query.from === "string" && query.from ? new Date(query.from) : null;
  const to = typeof query.to === "string" && query.to ? new Date(query.to) : null;
  const storeId =
    typeof query.store === "string" && query.store ? query.store : null;
  const warehouseId =
    typeof query.warehouse === "string" && query.warehouse ? query.warehouse : null;
  const categoryId =
    typeof query.category === "string" && query.category ? query.category : null;

  const [result, warehouseOptions, categoryOptions] = await Promise.all([
    runReport(ctx, key, { from, to, storeId, warehouseId, categoryId }),
    scopedWarehouses(ctx),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(
        and(
          eq(categories.tenant_id, ctx.business.id),
          isNull(categories.deleted_at),
        ),
      )
      .orderBy(asc(categories.path)),
  ]);

  const currency = ctx.business.currency;
  const exportHref = `/api/v1/reports/${encodeURIComponent(key)}${buildQueryString(
    {
      from: query.from as string,
      to: query.to as string,
      store: storeId,
      warehouse: warehouseId,
      category: categoryId,
      format: "csv",
    },
  )}`;

  /* Only the filters actually applied are carried into a saved report, so a
     schedule does not silently pin defaults the author never chose. */
  const activeFilters: Record<string, string> = {};
  for (const name of ["from", "to", "store", "warehouse", "category", "status"]) {
    const value = query[name];
    if (typeof value === "string" && value) activeFilters[name] = value;
  }

  const canSchedule =
    hasPermission(ctx, "reports.schedule") &&
    ctx.entitlements.features.has("reports.scheduled");
  const canSave = canSchedule;

  const recipientOptions = canSchedule
    ? (
        await db
          .select({ id: users.id, name: users.full_name })
          .from(users)
          .where(
            and(
              eq(users.tenant_id, ctx.business.id),
              eq(users.status, "active"),
              isNull(users.deleted_at),
            ),
          )
          .orderBy(asc(users.full_name))
          .limit(50)
      ).map((u) => ({ id: u.id, name: u.name }))
    : [];

  const canExport = canAccess(ctx, {
    module: "reports",
    feature: "reports.export",
    permission: "reports.export",
  });

  return (
    <div className="page">
      <PageHeader
        title={definition.name}
        description={definition.description}
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: definition.name },
        ]}
        actions={
          <>
            {canSave ? (
              <SaveReportDialog
                reportKey={key}
                reportName={definition.name}
                filters={activeFilters}
                recipients={recipientOptions}
                canSchedule={canSchedule}
              />
            ) : null}
            {canExport ? (
              <Button asChild variant="outline" size="sm">
                <Link href={exportHref}>
                  <Download className="size-3.5" />
                  Export CSV
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <FilterBar className="no-print">
        <DateRangeFilter />
        {ctx.stores.length > 1 ? (
          <SelectFilter
            paramName="store"
            label="Store"
            options={ctx.stores.map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : null}
        {warehouseOptions.length > 1 ? (
          <SelectFilter
            paramName="warehouse"
            label="Warehouse"
            options={warehouseOptions.map((w) => ({
              value: w.id,
              label: w.name,
            }))}
          />
        ) : null}
        {categoryOptions.length > 0 ? (
          <SelectFilter
            paramName="category"
            label="Category"
            options={categoryOptions.map((c) => ({ value: c.id, label: c.name }))}
          />
        ) : null}
        <ResetFilters />
      </FilterBar>

      {result.summary.length > 0 ? (
        <StatGrid>
          {result.summary.map((card) => (
            <StatTile
              key={card.label}
              label={card.label}
              value={formatValue(card.value, card.format, currency)}
              tone={(card.tone ?? "neutral") as TileTone}
            />
          ))}
        </StatGrid>
      ) : null}

      {result.truncated ? (
        <Notice tone="warning" title="Results truncated">
          This report returned more rows than can be displayed. Narrow the date
          range, or export to CSV for the full dataset.
        </Notice>
      ) : null}

      <TableShell>
        <Table>
          <THead>
            {result.columns.map((column) => (
              <TH key={column.key} align={column.align}>
                {column.label}
              </TH>
            ))}
          </THead>
          <TBody>
            {result.rows.length === 0 ? (
              <EmptyRow colSpan={result.columns.length}>
                No data for this period or filter combination.
              </EmptyRow>
            ) : (
              result.rows.map((row, index) => (
                <TR key={String(row._id ?? index)}>
                  {result.columns.map((column) => (
                    <TD key={column.key} align={column.align}>
                      {renderCell(row, column, currency)}
                    </TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
          {result.totals && result.rows.length > 0 ? (
            <TFoot>
              {result.columns.map((column) => (
                <TD key={column.key} align={column.align}>
                  {result.totals![column.key] !== undefined
                    ? formatValue(
                        result.totals![column.key],
                        column.format,
                        currency,
                      )
                    : ""}
                </TD>
              ))}
            </TFoot>
          ) : null}
        </Table>
      </TableShell>

      <p className="text-xs text-muted-foreground">
        {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · generated{" "}
        {formatDateTime(new Date())} by {ctx.user.full_name}
        {ctx.activeStore && !storeId ? ` · ${ctx.activeStore.name}` : ""}
      </p>
    </div>
  );
}

function renderCell(
  row: Record<string, unknown>,
  column: ReportColumn,
  currency: string,
): React.ReactNode {
  const value = row[column.key];

  if (column.format === "status") {
    return value ? <StatusBadge status={String(value)} /> : "—";
  }

  const text = formatValue(value, column.format, currency);

  // First column links to the underlying record when a target is declared.
  if (column.linkTo && row._id) {
    return (
      <Link
        href={`${column.linkTo}/${String(row._id)}`}
        className="font-medium text-accent hover:underline"
      >
        {text}
      </Link>
    );
  }

  return text;
}

function formatValue(
  value: unknown,
  format: ColumnFormat | undefined,
  currency: string,
): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (format) {
    case "money":
      return formatMoney(value as string, { currency });
    case "quantity":
      return formatQuantity(value as string);
    case "number":
      return formatNumber(Number(value));
    case "percent":
      return formatPercent(value as number);
    case "date":
      return formatDate(value as Date);
    case "datetime":
      return formatDateTime(value as Date);
    case "status":
      return humanise(String(value));
    default:
      return typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
  }
}
