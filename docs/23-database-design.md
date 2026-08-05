# 23-database-design.md

# Database Design

Version: **1.0.0**

Companion to **06-database-architecture.md**, which states the conventions.
This document records how those conventions are actually applied in the
shipped schema, and the rules a new module must follow.

---

# Status

Implemented. 88 tables across seven schema files under `src/db/schema/`.

```text
_shared.ts       column builders + every pgEnum
admin.ts         business, modules, features, permissions, plans, licences
organization.ts  stores, warehouses, users, roles, HR
catalog.ts       products, categories, brands, units, tax groups
inventory.ts     levels, movements, adjustments, transfers, counts
purchasing.ts    requisitions, orders, receipts, invoices, returns, expenses
sales.ts         quotations, orders, invoices, payments, returns, gift cards
partners.ts      customers, suppliers, their addresses and ledgers
system.ts        sessions, settings, numbering, notifications, reporting
```

`index.ts` re-exports all of them. Import from `@/db/schema`, never from a
file directly — that keeps the seam movable.

---

# The structural-name rule

The database keeps `tenant_id` and `branch_id`. Everything above it says
**business** and **store**.

```text
Database layer     tenant_id, branch_id, tenants, branches
Service layer      businessId, storeId
UI layer           "business", "store"
```

This is deliberate, not legacy. `06-database-architecture.md` requires the
schema to stay forward-compatible if multiple businesses on one server are
ever needed. Renaming the columns would close that door for no gain.

A new module must follow the same split: structural names in the table
definition, business vocabulary in every layer above.

---

# Every table

Required on all tables:

```text
id           uuid primary key, defaultRandom()
created_at   timestamptz not null default now()
updated_at   timestamptz not null default now()
```

Use the shared builders rather than restating them:

```ts
import { pk, timestamps, actorColumns, softDelete, money, qty, rate } from "./_shared";

export const widgets = pgTable("widgets", {
  id: pk(),
  tenant_id: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ...timestamps,
  ...actorColumns,   // created_by / updated_by — sensitive tables only
  ...softDelete,     // deleted_at / deleted_by — see below
});
```

---

# Numeric types

| Kind | Builder | Type | Why |
|---|---|---|---|
| Money | `money("amount")` | `numeric(18,4)` | Exact. Never float. |
| Quantity | `qty("quantity")` | `numeric(18,4)` | Fractional units (kg, litre). |
| Percentage | `rate("tax_rate")` | `numeric(9,4)` | e.g. `18.0000`. |

`numeric` arrives in JavaScript as a **string**. Never coerce it with
`Number()` before arithmetic — route every calculation through
`src/lib/money.ts`, which works on scaled BigInt.

---

# Soft delete

`deleted_at` marks a row inactive. Add it when a record can be withdrawn but
its history must survive: products, customers, suppliers, employees, stores.

Do **not** add it to financial history. Invoices, payments, ledger entries and
audit logs are never deleted; they are cancelled or reversed by a new row.

Every query over a soft-deletable table must filter:

```ts
.where(and(eq(products.tenant_id, businessId), isNull(products.deleted_at)))
```

---

# Ledger tables

The most important pattern in the schema. Four balances in StoqBook are
**derived**, and each has an append-only ledger behind it:

| Balance | Ledger | Written by |
|---|---|---|
| `inventory_levels.quantity_available` | `inventory_movements` | `stock-ops.ts` |
| `customers.outstanding_balance` | `customer_ledger` | `partners.ts` |
| `suppliers.outstanding_balance` | `supplier_ledger` | `partners.ts` |
| `gift_cards.balance` | `gift_card_transactions` | `gift-cards.ts` |

Rules, without exception:

1. The ledger is authoritative; the balance column is a synchronised cache.
2. Both move **inside the same transaction**.
3. The balance row is locked with `SELECT … FOR UPDATE` before it is read.
4. A ledger row is never updated or deleted. Corrections are new rows.

The invariant is checkable, and should be checked after any change to these
paths:

```sql
select count(*) from (
  select l.id from inventory_levels l
  left join inventory_movements m
    on m.product_id = l.product_id and m.warehouse_id = l.warehouse_id
  group by l.id, l.quantity_available
  having l.quantity_available <> coalesce(sum(m.quantity), 0)
) drift;   -- must be 0
```

A new module that introduces a running balance must adopt this pattern rather
than inventing another.

---

# Nullable columns and unique indexes

Postgres treats `NULL`s as **distinct** in a unique index by default. A partial
key with nullable columns therefore does *not* prevent duplicates.

This bit us once, on `settings`: a business-scoped row leaves `branch_id`,
`warehouse_id` and `user_id` null, so two rows with the same key were both
accepted and which one won was arbitrary. The fix:

```ts
unique("settings_unique_key")
  .on(t.scope, t.tenant_id, t.branch_id, t.warehouse_id, t.user_id, t.key)
  .nullsNotDistinct(),
```

Note it must be `unique(...)`, not `uniqueIndex(...)` — only the constraint
builder exposes `nullsNotDistinct()` in the installed Drizzle version.

**Whenever a unique key includes a nullable column, use a constraint with
`nullsNotDistinct()`.** Otherwise it is decoration.

---

# Foreign keys

Ordering matters to `drizzle-kit push`: a foreign key must reference a column
that already carries a unique constraint at the point the FK is emitted. An
FK onto a non-primary-key column can fail with

```text
there is no unique constraint matching given keys for referenced table
```

The resolution used for `features` and `permissions` was to reference
`modules.id` (the primary key) and carry a denormalised `module_slug` text
column alongside for readable queries. Prefer that shape over an FK onto a
natural key.

`onDelete` choice:

| Relationship | Rule |
|---|---|
| Owned by the business | `cascade` |
| Referenced by financial history | `restrict` |
| Optional classification | `set null` |

---

# Indexing

Index what is filtered or sorted in a real query, not everything.

Established patterns:

```ts
index("products_tenant_status_idx").on(t.tenant_id, t.status)   // list filter
index("audit_logs_tenant_created_idx").on(t.tenant_id, t.created_at)  // time scan
uniqueIndex("expenses_number_key").on(t.tenant_id, t.expense_number)  // doc number
```

Every document-number column gets a unique index scoped to the business.

---

# Correlated subqueries — a trap

Drizzle strips table qualification from a `PgColumn` inside a `` sql`` ``
template used as a select field **when the outer query has no joins**. This
produces silently wrong results:

```ts
// WRONG — emits: where "branch_id" = "id", which self-compares the inner table
warehouseCount: sql<number>`(
  select count(*) from ${warehouses} where ${warehouses.branch_id} = ${branches.id}
)`
```

Use `db.$count`, which qualifies correctly and returns a number:

```ts
warehouseCount: db.$count(
  warehouses,
  and(eq(warehouses.branch_id, branches.id), isNull(warehouses.deleted_at)),
)
```

For aggregates `$count` cannot express, interpolate a real query builder so the
`where` is built by the normal path:

```ts
stockValue: sql<string>`(${db
  .select({ v: sql`coalesce(sum(${levels.quantity_available} * ${levels.average_cost}), 0)` })
  .from(levels)
  .where(eq(levels.warehouse_id, warehouses.id))})`
```

---

# Migrations

Development uses `drizzle-kit push`, which diffs the schema against the live
database. `npm run db:reset` drops, pushes and reseeds.

`push` prompts interactively when a change could lose data (adding a unique
constraint to a populated table, dropping a column). In a non-TTY shell it
fails rather than guessing. Apply those by hand with explicit SQL, having first
resolved the data:

```sql
-- deduplicate, then constrain
delete from settings s using settings t
where s.key = t.key
  and s.tenant_id is not distinct from t.tenant_id
  and s.created_at < t.created_at;

alter table settings add constraint settings_unique_key
  unique nulls not distinct (scope, tenant_id, branch_id, warehouse_id, user_id, key);
```

For production, generate versioned migrations with `drizzle-kit generate` and
apply with `drizzle-kit migrate`. See **46-migration-guide.md**.

---

# Connection

`src/db/index.ts` exports `db` (Drizzle over `node-postgres`) and `pool`.
`Transaction` and `DbClient` are exported so a service can accept either:

```ts
export async function postLedger(
  input: LedgerEntry,
  client: DbClient = db,   // caller passes `tx` to join an open transaction
): Promise<void>
```

Any service that may be called from inside a larger transaction must take this
parameter. Ledger writers always do.

---

# Local database

Postgres 17 in Docker, published on **5433** to avoid clashing with a local
install. `DATABASE_URL` must use `127.0.0.1`, not `localhost` — the container
publishes on IPv4 only, and `localhost` resolves to `::1` first on Windows,
which makes drizzle-kit hang with no error.

---

# Checklist for a new table

* [ ] `pk()`, `...timestamps`
* [ ] `tenant_id` with `onDelete: "cascade"`
* [ ] `branch_id` if the record belongs to one store
* [ ] `money()` / `qty()` / `rate()` for numerics — never `real`
* [ ] `...softDelete` only if withdrawal is meaningful and history must survive
* [ ] `...actorColumns` if the table is sensitive
* [ ] Unique index on any document number, scoped by `tenant_id`
* [ ] `nullsNotDistinct()` on any unique key containing a nullable column
* [ ] Exported from `index.ts`
* [ ] Added to `BACKUP_TABLES` in `src/lib/services/backup.ts`, in FK order

That last one is easy to forget and silently omits the table from every backup.

The single exception is a table holding **work in flight rather than records**:
`jobs` is excluded on purpose, because restoring an old queue would re-deliver
every notification it still contained. If a new table is in that category, leave
it out and say why in a comment where the reader will look for it — an
undocumented omission is indistinguishable from the mistake above.

---

# Next Document

**24-data-models.md** — the entities themselves, their relationships, and the
lifecycle each one follows.
