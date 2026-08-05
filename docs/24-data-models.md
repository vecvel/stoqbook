# 24-data-models.md

# Data Models

Version: **1.0.0**

The entities StoqBook stores, how they relate, and the lifecycle each follows.
**23-database-design.md** covers the conventions; this covers the meaning.

---

# The shape of the whole thing

```text
Business (exactly one row)
├── Organization        profile printed on documents
├── Store[]             trading locations
│   └── Warehouse[]     stock-holding locations
├── Role[] ─ Permission[]
├── User[]              employees, with or without portal access
├── Catalogue           Category, Brand, Unit, TaxGroup, Product
├── Inventory           Level (balance) + Movement (ledger)
├── Partners            Customer, Supplier — each with a ledger
├── Purchasing          Requisition → Order → Receipt → Invoice → Payment
├── Selling             Quotation → Order → Invoice → Payment → Return
├── Money out           Expense
├── System              Setting, Sequence, Notification, AuditLog
└── Licence             Plan + Licence + overrides
```

---

# Business

One row in `tenants`. Created by the first-run wizard and never by anything
else — `setupBusiness()` refuses if a row already exists.

```text
created ──▶ active ──▶ suspended ──▶ active
                  └──▶ archived ──▶ active
```

No `deleted` state. Removing the business means removing the installation.
Suspension and archival are reversible and destroy nothing; the guard blocks
operational screens but lets the Owner into `/admin` to lift them.

---

# Store and Warehouse

A **store** (`branches`) is a trading location: it owns sales, purchases,
employees and document sequences. A **warehouse** holds stock and belongs to
one store.

Stock lives at the warehouse; money lives at the store. A transaction always
names a store, and any transaction that moves stock also names a warehouse.

Exactly one store is `is_default`, and it cannot be deleted. A store holding
inventory or staff cannot be deleted either — it is deactivated instead.

---

# User and Role

`users` are employees. Portal access is separate from employment:

| Column | Meaning |
|---|---|
| `status` | pending / active / suspended / resigned / archived |
| `login_enabled` | May sign in at all |
| `password_hash` | Null until access is issued |

Permissions come **only** from roles — never assigned to a user directly. A
user with several roles gets the union.

The **Owner** role is special: `is_owner = true`, and it holds no
`role_permissions` rows at all. Its permissions are computed at request time
from the registry, so a module added tomorrow is usable immediately without
editing any role. Never grant it rows.

---

# Product

The catalogue is business-wide, not per store. Only pricing varies by store
(`product_store_prices`).

```text
draft ──▶ active ──▶ inactive ──▶ active
                 ├─▶ discontinued
                 └─▶ archived
```

Only `active` products can be sold. `archived` and `inactive` are refused at
the till; `discontinued` gets its own message so staff know the difference.

Price resolution, in order (`pricing.ts § effectivePrice`):

```text
promotional price, if inside its date window
  └─▶ wholesale price, if the customer is wholesale
        └─▶ store price, if one is set
              └─▶ selling price
```

---

# Inventory

Two tables, and the relationship between them is the core invariant:

```text
inventory_movements   append-only, authoritative
inventory_levels      synchronised balance, locked FOR UPDATE
```

Movement types: `opening_stock`, `purchase`, `sale`, `sale_return`,
`purchase_return`, `transfer_in`, `transfer_out`, `adjustment`, `damage`,
`expired`, `reserved`, `released`, `production`, `consumption`.

Sign convention: positive adds, negative removes. `quantity_available` must
always equal `SUM(movements.quantity)` for that product and warehouse.

Cost is **weighted average**, recalculated on every inbound movement:

```text
new_avg = (existing_qty × existing_avg + received_qty × landed_unit_cost)
          ÷ (existing_qty + received_qty)
```

Landed cost includes freight and other charges apportioned across the receipt,
which is why receiving — not ordering — is what sets cost.

---

# Purchasing

```text
Requisition ─▶ Order ─▶ Receipt ─▶ Invoice ─▶ Payment
                  │         │
                  │         └─▶ Return (debit note)
                  └─▶ Cancelled
```

The order is a commitment and moves no stock. **Receiving** moves stock and
sets landed cost. The invoice creates the payable. Only then can a payment be
recorded. Skipping a step is refused rather than inferred.

Orders above `purchases.approval_threshold` enter `pending_approval` and
cannot be received until approved.

---

# Selling

```text
Quotation ─▶ Sales Order ─▶ Invoice ─▶ Payment
                              │
                              └─▶ Return (credit note)
```

Retail skips straight to the invoice: POS creates one directly.

A **quotation** has no stock or ledger effect at all. Converting it calls the
same `createSale()` every other invoice uses, passing the quoted line prices
explicitly so the customer is billed what they were quoted even if the
catalogue has since moved.

A completed invoice, in one transaction: writes negative inventory movements,
updates levels, records payments, updates the customer ledger and receivable,
awards loyalty, and writes an audit entry. Either all of it happens or none.

---

# Customer and Supplier

Both carry a ledger and a derived balance, on the pattern above.

Customers: `outstanding_balance` (receivable), `store_credit`,
`loyalty_points`. Credit sales check `credit_limit` before the sale, not after.

Suppliers: `outstanding_balance` (payable), plus performance figures
(`rating`, `average_lead_time_days`, `on_time_delivery_rate`).

**Merging** two partners repoints every child row at the survivor, sums the
balances and lifetime totals, and archives the duplicate. Nothing is deleted,
so every invoice stays reachable from exactly one partner. The walk-in
customer cannot be merged away — POS depends on it existing.

---

# Gift Card

A fifth balance-plus-ledger pair. `gift_cards.balance` is backed by
`gift_card_transactions` with kinds `issue`, `topup`, `redeem`, `refund`,
`adjustment`.

Redemption happens inside the sale's own transaction, in `sales.ts`, because
it must succeed or fail with the sale. Issuance, top-up and closure live in
`gift-cards.ts`.

Closing a card with a balance writes a negative ledger entry rather than
zeroing the column, so money that left the card is always traceable.

Outstanding balances are a **liability**, not revenue. Revenue is recognised
on redemption.

---

# Attendance and Leave

Keyed on the **business day**, not a UTC date, so a night shift belongs to the
day it started in the business's own zone.

```text
Leave: pending ─▶ approved ─▶ (writes `leave` onto every attendance day)
              └─▶ rejected / cancelled
```

Approving leave writes attendance rows for every covered day, so the two
registers can never disagree. That is why approved leave cannot be
"cancelled" — it must be rejected, which corrects attendance too.

---

# Expense

```text
recorded ─▶ not_required          (below threshold)
        └─▶ pending ─▶ approved
                   └─▶ rejected
```

Self-approval is refused. That constraint is the only reason the step exists.

---

# Settings

Resolved most-specific-wins:

```text
business ─▶ store ─▶ warehouse ─▶ user
```

The registry default back-stops everything, so a missing row is never an
error. Each setting declares its scope; a setting is written at the level it
declares, not the level the user happens to be in.

---

# Licence

```text
Plan ──▶ Licence ──▶ Overrides ──▶ Effective entitlements
```

The plan is a template. The licence points at a plan and may carry
`module_overrides`, `feature_overrides` and `limit_overrides`, which always
win. Core modules can never be switched off, and dependencies are enforced
after overrides — disabling Products cascades to Inventory and POS.

Only differences from the plan are stored as overrides, so the list stays
meaningful rather than a full copy.

---

# Audit Log

Append-only. Never updated, never deleted, no soft delete.

Records actor (`user` or `system`), event, module, entity, store, a short
summary, a small before/after `diff` payload, IP and user agent. Payloads are
diffs rather than row snapshots so they stay readable — and secrets are never
written into them (the invite flow records the email, never the password).

---

# Relationship rules

* Every business-owned table carries `tenant_id`.
* Store-scoped tables also carry `branch_id`.
* Stock-scoped tables also carry `warehouse_id`.
* A financial document is never hard-deleted; it is cancelled or reversed.
* A derived balance always has a ledger, and they move together.
* Reference data that history points at is deactivated, not deleted.

---

# Next Document

**25-module-sdk.md** — how to add a module so navigation, permissions,
widgets, reports and settings appear on their own.
