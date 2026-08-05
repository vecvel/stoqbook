# 44-testing-strategy.md

# Testing Strategy

Version: **1.0.0**

Status: **No automated tests exist.** Verification to date has been
typecheck, production build, and manual exercise in a browser with SQL
assertions against the database. That has caught real bugs, but it does not
scale and it does not prevent regressions.

This document says what to build, in the order that buys the most safety per
hour spent.

---

# What actually needs testing here

Not everything is equally risky. The risk in StoqBook is concentrated:

| Area | Risk if wrong | Priority |
|---|---|---|
| `money.ts` | Every figure in the product | **Highest** |
| Ledger transactions | Silent stock/money corruption | **Highest** |
| `pricing.ts` | Wrong totals on every document | High |
| Authorization pipeline | Data exposure | High |
| `timezone.ts` | Off-by-one-day everywhere | High |
| Registry derivations | Missing nav, broken permissions | Medium |
| Report runners | Wrong numbers in a report | Medium |
| Page rendering | Visible, quickly noticed | Low |

Test top-down. A test suite that covers button clicks but not
`add("0.1", "0.2")` is testing the wrong product.

---

# Layer 1 — pure unit tests

No database, no framework. These are fast, deterministic, and cover the code
where a bug is most expensive.

**`money.ts`** — the whole point of the file is exactness:

```ts
expect(add("0.1", "0.2")).toBe("0.3000");        // not 0.30000000000000004
expect(mul("19.99", "3")).toBe("59.9700");
expect(div("100", "3")).toBe("33.3333");
expect(cmp("1.0000", "1")).toBe(0);
expect(negate("5.5000")).toBe("-5.5000");
expect(isPositive("0")).toBe(false);
```

**`pricing.ts`** — the tax/discount rules, which are subtle:

```ts
// inclusive tax must extract, not add
computeLine({ quantity: "1", unitPrice: "118", taxRate: "18", taxMode: "inclusive" })
  → { taxableAmount: "100.0000", taxAmount: "18.0000", total: "118.0000" }

// line discount before document discount, in that order
// round-off applies to the grand total only
```

**`timezone.ts`** — the day-boundary logic:

```ts
// 23:30 UTC on the 1st is already the 2nd in Asia/Kolkata
tzDateKey(new Date("2026-08-01T23:30:00Z"), "Asia/Kolkata") → "2026-08-02"
recentDayKeys(14, "Asia/Kolkata").at(-1) → today in that zone
```

**Registry derivations** — cheap and catches declaration mistakes:

```ts
// every permission's declared feature exists
// every nav href is unique
// every dependency names a real module
// resolveModuleDependencies cascades: no products → no inventory → no pos
```

That last group is effectively the audit script turned into assertions, and
would have caught the twelve unmapped icons and the dead nav links before they
shipped.

---

# Layer 2 — integration tests, against a real Postgres

The ledger invariants cannot be tested with a mock. Use a throwaway database
per run: create, push schema, seed, run, drop.

The tests that matter most:

```ts
// a sale writes movements and levels that agree
await createSale(ctx, { lines: [{ productId, quantity: "3" }], … });
expect(await inventoryDrift()).toBe(0);
expect(await levelFor(productId)).toBe(sub(before, "3"));

// receiving sets weighted average landed cost
// 100 @ 10 then 100 @ 12 with 200 freight → avg 12.00
expect(await avgCostFor(productId)).toBe("12.0000");

// negative stock is refused when the setting says so
await expect(createSale(ctx, { lines: [{ productId, quantity: "9999" }] }))
  .rejects.toThrow(/INSUFFICIENT_STOCK/);

// a failed sale rolls back completely — no partial movements
// concurrent sales of the same product do not oversell (FOR UPDATE holds)
// merging customers preserves ledger reconciliation
// approving leave writes attendance for every covered day
// closing a gift card writes a negative ledger entry, not a silent zero
```

Every one of these corresponds to an invariant asserted elsewhere in these
documents. The drift queries from **31-monitoring.md** become the assertion
helper:

```ts
async function assertNoDrift() {
  expect(await inventoryDrift()).toBe(0);
  expect(await customerLedgerDrift()).toBe(0);
  expect(await supplierLedgerDrift()).toBe(0);
  expect(await giftCardDrift()).toEqual([]);
}
```

Call it at the end of every integration test. It is one line and it is the
single most valuable assertion in the suite.

---

# Layer 3 — authorization tests

Table-driven, because the matrix is the specification:

```ts
const cases = [
  { role: "cashier",   permission: "products.view_cost",  expect: false },
  { role: "cashier",   permission: "pos.use",             expect: true  },
  { role: "manager",   permission: "expenses.approve",    expect: false },
  { role: "owner",     permission: "admin.license_manage", expect: true },
];
```

Plus the pipeline's ordering, which is a real behaviour:

* Unlicensed module → `MODULE_NOT_LICENSED`, not a permission error
* Suspended business → blocked for non-owners, `/admin` open to the Owner
* Expired licence → operational screens blocked, licence page reachable
* Owner holds every permission without any `role_permissions` rows

And the negative cases that matter most: search must not return a source the
caller lacks; a report must refuse a permission the caller lacks even when
scheduled by someone who had it.

---

# Layer 4 — end-to-end, kept small

Playwright, and deliberately few. E2E is slow and brittle; spend it only on
journeys where a break is catastrophic and invisible to lower layers:

1. First-run setup → dashboard
2. Sign in → POS → complete a sale → stock decreased
3. Purchase order → approve → receive → cost updated
4. Sale → return → stock restored, refund recorded

Four journeys. Not forty.

---

# What not to test

* shadcn primitives — upstream's job
* Static copy — it changes and the test adds nothing
* Getters and simple mappers
* Exact pixel layout — the radius/colour rules are lint material, not tests

Coverage percentage is the wrong target. `money.ts` and the ledger paths should
be near-total; a list page needs none.

---

# CI

```yaml
services: [postgres:17]
steps:
  - npm ci
  - npx tsc --noEmit
  - npm run lint
  - npm run test:unit
  - npm run test:integration     # against the service container
  - npm run build
  - npm run test:e2e             # main branch only
```

Note that ESLint currently fails repo-wide with a circular-structure error from
`@eslint/eslintrc`. That has to be fixed before `npm run lint` can gate
anything — a step that always fails gets removed, and then nothing is checked.

---

# Build order

1. Test runner + `money.ts` tests. Highest value, lowest effort.
2. `pricing.ts` and `timezone.ts`.
3. Registry consistency assertions (the audit, as tests).
4. Integration harness: ephemeral database, seeded fixtures.
5. `assertNoDrift()` and the ledger tests.
6. Authorization matrix.
7. Fix ESLint, wire CI.
8. The four E2E journeys.

Steps 1–2 alone would have caught money and date bugs found by hand in this
codebase. Step 5 protects the thing the product exists to get right.

---

# Next Document

**45-release-management.md**
