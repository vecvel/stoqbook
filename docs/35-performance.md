# 35-performance.md

# Performance

Version: **1.0.0**

---

# Targets

From **22-roadmap.md § Performance Targets**, made measurable:

| Surface | Target | Why that number |
|---|---|---|
| POS add-to-cart | < 100 ms | Faster than a cashier can scan the next item |
| POS complete sale | < 500 ms | A queue forms above this |
| Dashboard first paint | < 1.5 s | First screen of the day |
| List page | < 800 ms | |
| Report (typical) | < 3 s | |
| Report (year of data) | < 10 s | Then it must stream or paginate |

POS is the one that actually matters. Everything else can be a second slower
without anyone caring; a till that stutters gets abandoned.

---

# What is already done right

**Request-scoped context caching.** `getContext()` is wrapped in React
`cache()`, so the layout, the page and every server action in one render share
a single set of context queries rather than repeating them.

**Conditional widget loading.** The dashboard only queries data for widgets the
user can actually see:

```ts
keys.has("sales.trend") ? salesTrend(scope) : null
```

A cashier without financial permissions runs a fraction of the queries an
owner does. With a saved layout, fewer still.

**Concurrent fan-out.** Independent queries go through `Promise.all` — the
dashboard, every list page, and search. Latency is the slowest query, not the
sum.

**Exact arithmetic without a decimal library.** `money.ts` works on scaled
BigInt. No `Decimal` object allocation per line.

**One extra row instead of a count.** Search fetches `limit + 1` to detect
truncation rather than running a second `COUNT(*)`.

---

# Known cost centres

**`ILIKE '%term%'` in search.** Cannot use a B-tree index; it is a sequential
scan. Fine at tens of thousands of rows, not at millions. Remedies in order:
`pg_trgm` GIN indexes, then generated `tsvector` columns
(**29-search-system.md**).

**Reports over long ranges.** `MAX_ROWS` caps the result and sets a
`truncated` flag rather than returning everything. That protects the process;
it does not make the query fast. Long-range reports want a read replica or
pre-aggregation.

**The backup export.** `buildBackup()` holds the whole dataset in memory. For
one business that is a few hundred KB and streaming would complicate the
foreign-key ordering guarantee. Revisit only if a business has millions of
invoices.

---

# Rules for query authors

**Never `SELECT *` in a page.** Select the columns rendered. Wide tables like
`products` and `sales_invoices` carry many columns most pages ignore.

**Never query in a loop.** Fetch the set with `inArray` and index it in
JavaScript:

```ts
const rows = await db.select().from(products).where(inArray(products.id, ids));
const byId = new Map(rows.map((r) => [r.id, r]));
```

The one exception in the codebase is the supplier-product remap during a
merge, which must check each row for a collision — and that runs once, by
hand, on a small set.

**Use `db.$count` for correlated counts.** Not a raw `sql` subquery, which
drizzle renders unqualified in a join-less query and which then silently
returns the wrong number (**23-database-design.md**).

**Filter soft-deletes in the index, not after.** `isNull(deleted_at)` in the
`WHERE`, and a partial index if the table is large.

---

# Indexing

Index what real queries filter and sort on:

```ts
index("products_tenant_status_idx").on(t.tenant_id, t.status)
index("sales_invoices_tenant_date_idx").on(t.tenant_id, t.invoice_date)
index("inventory_movements_product_wh_idx").on(t.product_id, t.warehouse_id)
```

That last one carries the ledger sum, which is the hottest aggregate in the
system.

Column order matters: equality first, range last. `(tenant_id, invoice_date)`
serves "this business, this month"; the reverse does not.

Verify with `EXPLAIN (ANALYZE, BUFFERS)` before adding an index and after.
An index that is never chosen is pure write cost.

---

# Transactions

Hold them for as little time as possible, and never across an external call.

`createSale()` does real work inside one transaction — movements, levels,
payments, ledger, loyalty, audit — because all of it must be atomic. What it
does **not** do is send a notification inside the transaction, which would
hold locks for the duration of an SMTP round trip.

Lock ordering is consistent: inventory levels are locked in product order, so
two concurrent sales of the same two products cannot deadlock.

---

# Client-side

The app is server components by default. Client islands are small and
colocated — a dialog, a form, a dropdown — never a page.

**Do not turn a page into a client component to use one hook.** Extract the
interactive part.

Charts are the largest client dependency and are only imported on the
dashboard.

---

# Measuring

Before optimising, measure. In order:

1. `EXPLAIN ANALYZE` the suspect query.
2. Log queries over 500 ms with their **shape**, not their parameters.
3. Check the pool — exhaustion looks like slowness but is a different problem.
4. Only then change code.

Optimising an unmeasured guess is how correct code becomes complicated code
for no gain.

---

# Load expectations

Realistic for one retail business:

```text
Products              1k – 50k
Customers             500 – 20k
Invoices per day      50 – 2,000
Inventory movements   2 – 5 × invoice lines
Concurrent users      1 – 20
```

At the top of that range a single well-indexed Postgres on modest hardware is
comfortable. The architecture does not need to change before a business is
running dozens of stores.

---

# Next Document

**36-white-label.md**
