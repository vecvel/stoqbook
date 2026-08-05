# 29-search-system.md

# Search System

Version: **1.0.0**

Status: **Built.** `src/lib/services/search.ts` and `/search`, satisfying
**05-module-system.md § Dynamic Search**.

---

# Shape

Search is a registry of **sources**. Each source declares which module it
belongs to, what permission it needs, and how to query itself:

```ts
interface SourceDef {
  key: string;              // "products"
  label: string;            // "Products"
  icon: string;
  moduleSlug: string;       // gated on the module being licensed
  permission: string;       // gated on the caller holding it
  feature?: string;         // optionally gated on a feature
  run: (businessId, term, limit, currency) => Promise<SearchHit[]>;
}
```

Sources shipped today: products (name, SKU, barcode), customers (name, code,
phone, email), suppliers (company, code, contact, phone), sales invoices
(number, customer name), purchase orders (number).

---

# The rule that matters

A source is queried **only** when the caller passes module, feature and
permission:

```ts
const allowed = SOURCES.filter((s) =>
  canAccess(ctx, { module: s.moduleSlug, feature: s.feature, permission: s.permission }),
);
```

This is why search can never leak. A cashier without `suppliers.view` does not
get "no results" for a supplier — the supplier source is never run, and the
option does not appear in the filter. Absence of a result and absence of
permission are indistinguishable from outside, which is the correct
information-disclosure posture.

`searchableSources(ctx)` returns the same filtered list for the UI, so the
dropdown and the query can never disagree.

---

# Query construction

Case-insensitive substring across the declared columns:

```ts
function like(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
```

`%` and `_` in user input are escaped. Without that, a search for `100%`
matches everything, and `_` becomes a single-character wildcard — a subtle
correctness bug rather than a security one, but a real one.

Nullable columns are coalesced so a null never excludes a row that matched on
another field:

```ts
textSearch([
  sql`${customers.name}`,
  sql`${customers.code}`,
  sql`coalesce(${customers.phone}, '')`,
], term)
```

---

# Guard rails

**Minimum two characters.** A single letter matches nearly every row in the
catalogue and is never a useful query. Below the threshold the page says so
rather than returning noise.

**Per-group limit with a truncation flag.** Each source fetches `limit + 1`
rows; the extra one reveals that more exist without a second `COUNT` query.
When truncated, the group offers "More matches", which re-runs scoped to that
one source.

**Soft-deleted rows excluded.** Every source filters `deleted_at is null`.

---

# Presentation

Results are grouped by source, each hit reduced to:

```ts
{ id, label, detail, href }
```

`label` is what the record is called; `detail` is what identifies it —
SKU plus barcode, code plus phone, customer plus formatted total. Money is
formatted in the source using the business currency, not shown raw.

Empty groups are dropped entirely rather than rendered as "0 results".

---

# Adding a source

```ts
{
  key: "deliveries",
  label: "Deliveries",
  icon: "Truck",
  moduleSlug: "deliveries",
  permission: "deliveries.view",
  async run(businessId, term, limit) {
    const rows = await db.select({ … }).from(deliveries)
      .where(and(
        eq(deliveries.tenant_id, businessId),
        textSearch([sql`${deliveries.number}`], term),
      ))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, label: r.number, detail: r.status, href: `/deliveries/${r.id}` }));
  },
}
```

Add the icon to `components/layout/icon.tsx`, or it renders blank.

---

# Performance

Sources run concurrently via `Promise.all`, so latency is the slowest source,
not the sum.

`ILIKE '%term%'` cannot use a B-tree index. At current scale — one business,
tens of thousands of rows — that is fine and measurably fast. It will not stay
fine. When a source gets slow:

**Step 1 — trigram indexes.** Cheapest fix, no code change:

```sql
create extension if not exists pg_trgm;
create index products_name_trgm on products using gin (name gin_trgm_ops);
```

**Step 2 — full-text.** For genuine relevance ranking rather than substring
matching:

```sql
alter table products add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(sku, '')), 'B')
  ) stored;
create index products_search_idx on products using gin (search_vector);
```

A generated column keeps the vector correct without a trigger to forget.

**Step 3 — external index.** Only if multi-language stemming or typo tolerance
is genuinely required. It adds infrastructure and a synchronisation problem;
do not reach for it before the first two are exhausted.

---

# Deliberately absent

**No cross-source ranking.** Groups are shown in declaration order rather than
interleaved by score. Comparing "how well does this product match" against
"how well does this invoice match" has no meaningful common scale, and faking
one produces worse results than clear grouping.

**No search history or suggestions.** Both are personal-data surfaces that
need a retention policy; not worth it for the value.

**No indexing pipeline.** Search reads live tables, so a product created a
second ago is findable. That property is worth more than raw speed at this
scale, and losing it is the real cost of step 3 above.

---

# Next Document

**30-file-storage.md** — the other cross-cutting capability that several
modules reference but nothing implements.
