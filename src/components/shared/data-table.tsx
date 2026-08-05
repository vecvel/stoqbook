import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { buildQueryString } from "@/lib/api/query";
import { cn } from "@/lib/utils";

/**
 * Server-rendered table primitives.
 *
 * Sorting and pagination are URL-driven so every list view is bookmarkable,
 * shareable and works without JavaScript.
 */

export function TableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xs border border-border bg-card",
        className,
      )}
    >
      <div className="overflow-x-auto scrollbar-thin">{children}</div>
    </div>
  );
}

export function Table({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <table className={cn("w-full caption-bottom text-sm", className)}>
      {children}
    </table>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-muted/50">
      <tr>{children}</tr>
    </thead>
  );
}

export function TH({
  children,
  align = "left",
  className,
  width,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        "whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Sortable header cell. Toggles direction via the `sort` query parameter. */
export function SortableTH({
  children,
  field,
  currentSort,
  baseParams,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  field: string;
  /** Active sort, e.g. "-created_at". */
  currentSort: string;
  /** Params to preserve while sorting (search, filters, limit). */
  baseParams: Record<string, string | number | null | undefined>;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const descending = currentSort === `-${field}`;
  const ascending = currentSort === field;
  const nextSort = ascending ? `-${field}` : field;

  const href = `${buildQueryString({ ...baseParams, page: 1, sort: nextSort })}`;

  return (
    <TH align={align} className={className}>
      <Link
        href={href || "?"}
        scroll={false}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          (ascending || descending) && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        {ascending ? (
          <ArrowUp className="size-3" />
        ) : descending ? (
          <ArrowDown className="size-3" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-40" />
        )}
      </Link>
    </TH>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({
  children,
  className,
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/40",
        muted && "opacity-60",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children,
  align = "left",
  className,
  colSpan,
  mono,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
  mono?: boolean;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-3 py-2 align-middle",
        align === "right" && "text-right tabular",
        align === "center" && "text-center",
        mono && "font-mono text-xs",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Totals row rendered at the foot of financial tables. */
export function TFoot({ children }: { children: React.ReactNode }) {
  return (
    <tfoot className="border-t-2 border-border bg-muted/50 font-semibold">
      <tr>{children}</tr>
    </tfoot>
  );
}

export function EmptyRow({
  colSpan,
  children = "No records found.",
}: {
  colSpan: number;
  children?: React.ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-10 text-center text-sm text-muted-foreground"
      >
        {children}
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Pagination                                                                 */
/* -------------------------------------------------------------------------- */

export function Pagination({
  page,
  limit,
  total,
  baseParams,
}: {
  page: number;
  limit: number;
  total: number;
  baseParams: Record<string, string | number | null | undefined>;
}) {
  const pages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
  if (total === 0) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Windowed page list: first, last, and a band around the current page.
  const window = new Set<number>([1, pages, page - 1, page, page + 1]);
  const visible = [...window]
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2.5">
      <span className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{from}</span>–
        <span className="font-medium text-foreground">{to}</span> of{" "}
        <span className="font-medium text-foreground">{total}</span>
      </span>

      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <PageLink
            params={baseParams}
            page={page - 1}
            disabled={page <= 1}
            label="Previous"
          />
          {visible.map((p, i) => (
            <span key={p} className="flex items-center gap-1">
              {i > 0 && p - visible[i - 1] > 1 ? (
                <span className="px-1 text-xs text-muted-foreground">…</span>
              ) : null}
              <PageLink
                params={baseParams}
                page={p}
                label={String(p)}
                active={p === page}
              />
            </span>
          ))}
          <PageLink
            params={baseParams}
            page={page + 1}
            disabled={page >= pages}
            label="Next"
          />
        </div>
      ) : null}
    </div>
  );
}

function PageLink({
  params,
  page,
  label,
  disabled,
  active,
}: {
  params: Record<string, string | number | null | undefined>;
  page: number;
  label: string;
  disabled?: boolean;
  active?: boolean;
}) {
  const classes = cn(
    "inline-flex h-7 min-w-7 items-center justify-center rounded-xs border px-2 text-xs transition-colors",
    active
      ? "border-accent bg-accent text-accent-foreground font-semibold"
      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
    disabled && "pointer-events-none opacity-40",
  );

  if (disabled) {
    return (
      <span className={classes} aria-disabled>
        {label}
      </span>
    );
  }

  return (
    <Link
      href={buildQueryString({ ...params, page }) || "?"}
      scroll={false}
      className={classes}
    >
      {label}
    </Link>
  );
}
