import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/layout/icon";
import { requireUser } from "@/lib/authz/guard";
import { search, searchableSources } from "@/lib/services/search";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Search spans several modules, so it is gated per source rather than by one
  // permission here.
  const ctx = await requireUser();
  const params = await searchParams;

  const term = typeof params.q === "string" ? params.q : "";
  const source = typeof params.source === "string" ? params.source : null;

  const sources = searchableSources(ctx);
  const groups = term ? await search(ctx, term, { source, limit: 8 }) : [];
  const totalHits = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Search"
        description={
          term
            ? `${totalHits} match${totalHits === 1 ? "" : "es"} for “${term}”`
            : "Search products, customers, suppliers, invoices and orders."
        }
      />

      <form action="/search" className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="q" className="field-label">
            Query
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={term}
            placeholder="Name, code, SKU, barcode, phone or document number"
            className="mt-1 h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor="source" className="field-label">
            Limit to
          </label>
          <select
            id="source"
            name="source"
            defaultValue={source ?? ""}
            className="mt-1 h-9 rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
          >
            <option value="">Everything</option>
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-xs bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/90"
        >
          Search
        </button>
      </form>

      {!term ? (
        <EmptyState
          icon="Search"
          title="What are you looking for?"
          description={
            sources.length === 0
              ? "You do not have access to any searchable records yet."
              : `Searching ${sources.map((s) => s.label.toLowerCase()).join(", ")}.`
          }
        />
      ) : term.trim().length < 2 ? (
        <EmptyState
          icon="Search"
          title="Type a little more"
          description="Enter at least two characters — a single letter matches almost everything."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="SearchX"
          title={`Nothing matches “${term}”`}
          description="Check the spelling, or try a code or document number instead."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-xs border border-border bg-card"
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name={group.icon} className="size-3.5 text-muted-foreground" />
                  {group.label}
                </h2>
                {group.truncated ? (
                  <Link
                    href={`/search?q=${encodeURIComponent(term)}&source=${group.key}`}
                    className="text-[11px] text-accent hover:underline"
                  >
                    More matches
                  </Link>
                ) : (
                  <Badge variant="soft-neutral">{group.hits.length}</Badge>
                )}
              </header>
              <ul className="divide-y divide-border">
                {group.hits.map((hit) => (
                  <li key={`${group.key}-${hit.id}`}>
                    <Link
                      href={hit.href}
                      className={cn(
                        "flex items-baseline justify-between gap-3 px-4 py-2.5",
                        "transition-colors hover:bg-muted/50",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {hit.label}
                      </span>
                      {hit.detail ? (
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          {hit.detail}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
