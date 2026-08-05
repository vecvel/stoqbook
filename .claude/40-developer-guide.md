# 40-developer-guide.md

# Developer Guide

Version: **1.0.0**

Practical orientation for someone about to change this codebase. The other
documents specify; this one tells you where things are and what will bite you.

---

# Getting running

```bash
npm install
npm run db:up          # postgres 17, docker, port 5433
cp .env.example .env
npm run db:reset       # schema + demo business "FreshMart"
npm run dev
```

Sign in as `owner@freshmart.test` / `Stoqbook@123`.

If `drizzle-kit` hangs with no output, `DATABASE_URL` is using `localhost`.
Use `127.0.0.1` — the container publishes IPv4 only and `localhost` resolves
to `::1` first on Windows.

---

# Layout

```text
src/
├── app/
│   ├── (app)/          the application, behind AppShell
│   ├── (auth)/         login, first-run setup
│   ├── api/            REST v1, backup, dashboard export
│   ├── license-required/
│   └── page.tsx        root router: setup / login / dashboard
├── components/
│   ├── layout/         shell, sidebar, icon map
│   ├── shared/         the components you should be reusing
│   └── ui/             shadcn primitives — rarely edited
├── db/
│   ├── schema/         88 tables across 8 files
│   ├── seed.ts         registry + demo data
│   └── reset.ts
└── lib/
    ├── actions.ts      runAction, success, failure, form helpers
    ├── api/            generic list/show builder, query parsing
    ├── auth/           password, session
    ├── authz/          context, guard, entitlements, errors
    ├── registry/       ← the centre of the system
    ├── services/       business logic, server-only
    ├── money.ts        exact decimal arithmetic
    ├── timezone.ts     business-day handling
    └── format.ts       every display formatter
```

---

# Read these three files first

**`src/lib/registry/modules.ts`** — every capability in the product, declared
as data. Navigation, permissions, widgets, reports and settings are generated
from it.

**`src/lib/authz/guard.ts`** — the authorization pipeline every entry point
runs.

**`src/lib/services/sales.ts § createSale`** — the reference transaction. If
you understand how it keeps inventory, the customer ledger, loyalty and the
audit trail consistent, you understand the codebase.

---

# The five rules

**1. Declare, do not hardcode.** New capability goes in the registry. If you
are editing the sidebar or the role editor to add a feature, you are in the
wrong file.

**2. Never do float arithmetic on money.** `numeric` columns arrive as
strings. Use `money.ts`. `Number(row.amount) + Number(row.tax)` is a bug even
when it looks right.

**3. Balances have ledgers, and they move together.** Four derived balances
exist. Writing one without its ledger row, in the same transaction, under a
row lock, is the most damaging mistake available here.

**4. Never throw across the RSC boundary.** Server actions return
`ActionResult`. `runAction` handles conversion; expected problems use
`failure()`.

**5. Business days are cut in the business's timezone.** Not UTC. Use
`timezone.ts`.

---

# Adding a feature

Full procedure in **25-module-sdk.md**. The short version:

1. Schema → `src/db/schema/`, export from `index.ts`, add to `BACKUP_TABLES`
2. Declare in `modules.ts`
3. Service in `src/lib/services/`
4. Actions in `app/(app)/<module>/actions.ts`
5. Pages
6. New icon names → `components/layout/icon.tsx`
7. `npm run db:reset`
8. `npx tsc --noEmit && npm run build`
9. **Exercise it in a browser**

---

# Things that have actually gone wrong here

Not hypotheticals. Each of these was a real defect found in this codebase.

**Correlated subqueries returning zero.** Drizzle strips table qualification
from a `PgColumn` inside a `` sql`` `` select field when the outer query has no
joins, so `where "branch_id" = "id"` self-compares the inner table. A store
showed 0 warehouses and 0 staff while having 1 and 5. Use `db.$count`.

**Unique index not preventing duplicates.** Postgres treats NULLs as distinct.
A business-scoped setting leaves three columns null, so the same key existed
twice and which value won was arbitrary. Use `unique(...).nullsNotDistinct()`.

**Timezone key mismatch.** The sales trend built bucket keys with
`toISOString()` (UTC) while grouping in the business timezone, so today never
matched and the chart read ₹0–₹4. Use `tzDateKey` / `recentDayKeys`.

**Bound parameter in GROUP BY.** Binding the timezone rendered `$1` in SELECT
and `$4` in GROUP BY; Postgres treats those as different expressions and
rejects the query. Inline the *validated* zone with `sql.raw()`.

**JSON round-trip losing types.** Saved report filters stored `Date` as a
string and used URL parameter names (`store`) rather than service field names
(`storeId`), so every scheduled run threw after claiming its slot. Deserialize
explicitly.

**Blank icons.** An unmapped icon name renders a silent placeholder rather
than failing. Twelve of them shipped before an audit caught it.

---

# Verifying your work

Compiling is not evidence. In order:

```bash
npx tsc --noEmit     # types
npm run build        # server component boundaries, prerender
npm run db:reset     # seed still works
```

Then open it. Then check the data:

```sql
-- these must all be 0
select count(*) from (
  select l.id from inventory_levels l
  left join inventory_movements m
    on m.product_id = l.product_id and m.warehouse_id = l.warehouse_id
  group by l.id, l.quantity_available
  having l.quantity_available <> coalesce(sum(m.quantity), 0)) d;
```

If you touched sales, purchasing, inventory, partners or gift cards, run the
drift queries. They have caught real bugs.

---

# Registry audit

Worth re-running after any module change. Diff the registry against the code:
permissions never referenced outside the registry, nav hrefs with no
`page.tsx`, widget keys the dashboard never renders, report keys the report
service does not implement.

Every hit is a declaration with nothing behind it — a live 404 or a blank
tile. Note that permissions used only in the registry (a setting's
`permission` field, a nav entry's gate) are false positives; check before
"fixing" them.

---

# Conventions

**Comments explain why.** `// Locked so two concurrent top-ups cannot both read
the same balance` earns its place. `// update the balance` does not.

**Copy is specific.** "Leave approved — the attendance register has been
updated" beats "Success". Say the consequence.

**Terminology is fixed.** Business, not tenant. Store, not branch. The
database keeps `tenant_id` and `branch_id` for forward compatibility; nothing
above it does.

**Only `rounded-xs` and `rounded-full`.** No gradients. Colours from tokens.

---

# Where to look when

| Symptom | Look at |
|---|---|
| Nav item missing | Licence, feature, permission — in that order |
| Permission has no effect | Is it declared in the registry? Seeded? |
| Money slightly wrong | Float arithmetic somewhere |
| Stock disagrees | Run the drift query; find the write without a ledger row |
| Dates off by one | UTC vs business timezone |
| Setting not saving | Duplicate rows; check the unique constraint |
| Count shows 0 | Unqualified correlated subquery |
| Blank icon | Not in the icon map |

---

# Next Document

**41-ai-assistant.md**
