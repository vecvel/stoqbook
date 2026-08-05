# 42-ai-recommendations.md

# AI Recommendations

Version: **1.0.0**

Status: **Not built.** Phase 5 in **22-roadmap.md**.

---

# Scope

Suggestions the system offers unprompted: what to reorder, what to price
differently, which supplier to prefer, which customers are slipping away.

Distinct from **41-ai-assistant.md**, which answers questions. This one
volunteers.

---

# Most of this is not machine learning

Worth saying up front, because it determines the build order. The highest-value
recommendations in a retail system are arithmetic over data StoqBook already
holds:

| Recommendation | Method |
|---|---|
| Reorder this product | Consumption rate × lead time vs stock on hand |
| Prefer this supplier | `on_time_delivery_rate`, `average_lead_time_days`, price |
| This customer is lapsing | `last_purchase_at` vs their own historical cadence |
| Dead stock | No movement in N days, with capital tied up |
| Margin erosion | Selling price vs weighted average cost, over time |

None of these need a model. All of them need the data that already exists.
Ship them as **rules**, label them plainly, and only reach for a model where a
rule genuinely cannot express the pattern.

A rule that says "reorder 40 units of Surf Excel — you sell 4/day, the supplier
takes 7 days, you have 12 left" is more useful and more trusted than a model
output nobody can check.

---

# Reorder recommendation

The one worth building first.

```text
daily_rate   = units sold in window ÷ days in window        (inventory_movements)
lead_time    = suppliers.average_lead_time_days             (or a default)
safety_stock = daily_rate × safety_days
reorder_point = daily_rate × lead_time + safety_stock
suggested_qty = max(0, reorder_point + cycle_cover − on_hand − on_order)
```

`on_order` must subtract quantities already on an approved, unreceived purchase
order — otherwise the system suggests reordering what is already coming, which
is the fastest way to lose credibility.

Every input is available: movements give the rate, the supplier gives lead
time, `inventory_levels` gives on-hand, `purchase_order_items` gives on-order.

Show the working. The suggestion is a row with its own arithmetic visible.

---

# What needs a model

Where a rule genuinely falls short:

**Seasonality.** A rule using a 30-day window will under-order for Diwali and
over-order after. Needs history and a seasonal decomposition — and at least two
years of data, which a new installation does not have.

**Substitution and cannibalisation.** Sales of one product suppressing
another. Needs correlation across the basket.

**Price elasticity.** How demand responds to a price change. Needs price
variation in the history, which most businesses do not deliberately create.

**Basket affinity.** "Customers who buy this also buy that." Classic
association-rule mining; genuinely useful for placement and bundling.

Note what these have in common: they all need **data volume the installation
may not have**. A recommendation engine trained on three months of one shop's
data will produce confident nonsense.

---

# The cold-start rule

Never show a recommendation the data cannot support. Concretely:

* Fewer than 30 days of movement history → no reorder suggestions at all.
* Fewer than N observations for a product → excluded, not estimated.
* No seasonality without two comparable prior periods.

Say why: "Not enough history yet — reorder suggestions start after 30 days of
sales." That is a better experience than a wrong number, and it sets the
expectation that the figures are earned.

---

# Presentation

Recommendations belong where the decision is made, not on a separate page
nobody visits:

* Reorder suggestions → the low-stock widget and the purchase order form
* Supplier preference → supplier selection on a purchase order
* Lapsing customers → the customers list, as a filter
* Dead stock → the inventory valuation report

Each carries:

1. **The suggestion**, quantified.
2. **The reasoning**, in one line.
3. **The action**, as a button.
4. **A dismissal**, remembered.

Dismissal matters. A suggestion that keeps returning after being rejected is an
irritant, and irritation is how features get ignored.

---

# Measuring whether it works

Log every recommendation and its outcome:

```sql
create table recommendations (
  id, tenant_id, kind, entity_type, entity_id,
  payload jsonb,          -- the suggestion and its inputs
  shown_at, acted_at, dismissed_at, dismissed_reason
);
```

Then the honest questions become answerable: what proportion are acted on, did
acting reduce stockouts, did dismissals cluster on a particular rule. A
recommendation engine nobody measures is a guess with a database behind it.

---

# Constraints

* **Recommendations respect permissions.** A reorder suggestion showing cost is
  hidden from users without `products.view_cost`.
* **Never auto-act.** No automatic purchase orders. The suggestion is prepared;
  a human commits it. Phase 6 might revisit autonomous reordering — not before.
* **Computed in a job**, not on page load. Recommendation queries scan
  movement history; that belongs in the queue (**28-job-queue.md**).
* **Cached with a timestamp**, and the timestamp shown. "As at 07:00" tells the
  user whether to trust it after a busy morning.

---

# Build order

1. `recommendations` table and the outcome logging.
2. Reorder rule, computed nightly by a job.
3. Surface it in the low-stock widget and the PO form.
4. Dead stock and lapsing customers — both simple, both useful.
5. Supplier preference from the performance figures already collected.
6. Basket affinity — the first thing that genuinely warrants a model.
7. Seasonality, once installations have the history for it.

Steps 1–5 need no model at all. That is the point.

---

# Next Document

**43-ai-forecasting.md**
