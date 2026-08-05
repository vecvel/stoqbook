# 46-migration-guide.md

# Migration Guide

Version: **1.0.0**

Two different things are called migration. Both are covered here:

1. **Schema migrations** — evolving the database between releases.
2. **Data migration** — bringing a business's existing records into StoqBook.

---

# Part 1 — Schema migrations

## Development vs release

| | Command | Use |
|---|---|---|
| Development | `drizzle-kit push` | Diffs schema against the live database |
| Release | `drizzle-kit generate` then `migrate` | Versioned SQL, reviewed |

`push` is convenient and dangerous: it proposes whatever closes the gap,
including destructive changes, and in a non-TTY shell it either fails or needs
`--force`. It must never run against a customer database.

`npm run db:reset` drops everything. Development only. Never alias it.

## Writing a safe migration

The rule: **a migration runs on data you have never seen.**

**Adding a column.** Nullable, or with a default. Never `NOT NULL` without a
default on a populated table.

```sql
alter table expenses add column approval_status approval_status
  not null default 'not_required';
```

**Adding a constraint.** Resolve the data in the same migration, or it fails
halfway. This is exactly what the settings unique constraint needed:

```sql
delete from settings s using settings t
where s.scope = t.scope
  and s.tenant_id is not distinct from t.tenant_id
  and s.branch_id is not distinct from t.branch_id
  and s.warehouse_id is not distinct from t.warehouse_id
  and s.user_id is not distinct from t.user_id
  and s.key = t.key
  and s.created_at < t.created_at;

alter table settings add constraint settings_unique_key
  unique nulls not distinct (scope, tenant_id, branch_id, warehouse_id, user_id, key);
```

Note `is not distinct from`, not `=`. With nullable columns, `=` never matches
NULL and the deduplication silently does nothing.

**Renaming.** Never in one release:

```text
Release N     add new column, backfill, write both, read old
Release N+1   read new
Release N+2   drop old
```

**Adding an enum value.** Safe, and append-only. *Removing* one requires
rewriting every row that uses it — treat as breaking.

**Adding an index.** Use `CREATE INDEX CONCURRENTLY` on a large table so it
does not hold a write lock. It cannot run inside a transaction, so it needs its
own migration.

## Registry changes

Not schema, but they migrate too. Modules, features and permissions live in code
and are mirrored into the database by the seeder. An upgrade that adds any of
them must reseed the registry, or new permissions never become assignable.

Renaming a **permission key**, **module slug**, **report key** or **widget key**
orphans customer data, because those strings are persisted in
`role_permissions`, `saved_reports` and `dashboard_layouts`. Add an alias rather
than renaming.

## Verifying a migration

```bash
pg_restore --dbname=stoqbook_verify previous-release.dump
npx drizzle-kit migrate
# then the drift queries from 31-monitoring.md — all must be 0
```

Testing against an empty database proves nothing about an upgrade.

---

# Part 2 — Migrating a business into StoqBook

A new customer arrives with data in spreadsheets, Tally, or another POS. This is
the part that determines whether they succeed.

## Order matters

Dependencies force a sequence. Getting this wrong means re-importing:

```text
1  Business setup wizard        the installation itself
2  Stores, warehouses
3  Units, tax groups            products reference these
4  Categories, brands
5  Products                     without stock
6  Customers, suppliers
7  Opening stock                the critical step — see below
8  Open receivables/payables    outstanding balances only
```

Steps 1–4 are already covered by setup, which seeds units, tax groups,
departments, designations, leave types and shifts. Do not import what setup
already created.

## Products

Required: name, SKU, unit, tax group, selling price. Recommended: barcode, cost
price, category, brand, reorder level.

Two rules that save pain later:

* **Import the cost price.** Opening stock uses it to set the initial weighted
  average. Skip it and every margin figure is wrong until the first purchase.
* **Barcodes must be unique** if `products.barcode_unique` is on. Deduplicate
  before importing, not after.

## Opening stock — the step that must not be improvised

Opening stock is not an UPDATE to `inventory_levels`. It is a movement of type
`opening_stock`, written through `setOpeningStock()` so the ledger and the
balance agree and the weighted average cost is set.

```text
For each product × warehouse with stock:
  setOpeningStock(ctx, { productId, warehouseId, quantity, unitCost })
```

Writing `inventory_levels` directly produces exactly the drift the whole design
exists to prevent, and it will surface at the first stock count.

After importing, run the drift query. It must be zero.

## Open balances

Do **not** import historical invoices. It is tempting and it is a trap: you
inherit tax periods, payment allocations and returns you cannot reconstruct
faithfully.

Import the **outstanding balance only**, as a single opening ledger entry per
partner:

```text
customerLedger: { kind: "opening", amount: outstanding, note: "Opening balance as at <date>" }
```

Then set `customers.outstanding_balance` to match — in the same transaction.
Historical detail stays in the old system, which is where it is already
reconciled.

## What not to migrate

* Historical invoices and purchase orders — keep the old system read-only
* Old audit logs — they belong to the old system's authorization model
* Users' passwords — issue portal access instead, which generates a one-time
  password per employee
* Anything you cannot reconcile. An unreconciled import is worse than a clean
  start with a documented cut-over date.

## Cut-over

```text
1  Import reference data and products into StoqBook
2  Freeze the old system at close of business
3  Import opening stock at that moment's quantities
4  Import outstanding balances at that moment
5  Run the drift queries — all must be 0
6  Spot-check: 10 products' stock, 5 partners' balances, against the old system
7  Open on StoqBook; keep the old system read-only for reference
```

Step 6 is what earns trust. Do it with the business owner watching, on records
they choose.

## Tooling

There is no import UI today. Products can be imported via the API
(`products.import` permission and `products.bulk_import` feature are declared).
Everything else needs a script.

A script is the right answer for a one-off migration — it can be re-run against
a reset database while the mapping is being worked out, which a UI cannot. It
must call the **services**, never the tables, so every invariant holds.

---

# Rollback

For a schema migration: restore the pre-upgrade dump and deploy the previous
version. Only possible if a dump was taken first, which is why it is step one
of every upgrade instruction.

For a data migration: `npm run db:reset`, then re-run the import. This is why
the import must be a repeatable script and why the cut-over happens after the
mapping is proven.

---

# End of the documentation set

Documents 01–22 specify the product. Documents 23–46 cover the platform
concerns behind it. Together they describe both what StoqBook is and how it is
built — including, deliberately, which parts are specification rather than
shipped code.
