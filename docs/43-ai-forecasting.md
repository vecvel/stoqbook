# 43-ai-forecasting.md

# AI Forecasting

Version: **1.0.0**

Status: **Not built.** Phase 5 in **22-roadmap.md**.

---

# What is being forecast

| Forecast | Horizon | Used for |
|---|---|---|
| Demand per product | 1–8 weeks | Reorder quantity, safety stock |
| Revenue | 1–3 months | Cash planning, targets |
| Cash position | 1–3 months | Receivables in, payables out |
| Stockout risk | Days | Urgency ranking |

Demand is the one that pays for itself. Everything else is nice to see.

---

# The data you actually have

Forecasting quality is bounded by history, and a retail installation's history
is thinner than it looks:

```text
inventory_movements   every stock change, dated, typed, signed
sales_invoice_items   quantity and price per line, per day
purchase_order_items  lead time, actual vs expected receipt
```

That is good data — clean, exact, complete. But a new installation has weeks of
it, not years. **Any forecast needs at least 8 weeks of history, and
seasonality needs two comparable prior periods.** Below that, do not forecast;
say why.

Note also what is missing and cannot be recovered: stockouts suppress demand.
A product that sold zero for three days because it was out of stock looks like
zero demand. Censored demand is the single biggest source of forecast bias in
retail, and correcting for it means reconstructing "would have sold" from
periods when stock was available.

---

# Start simple, and stay there longer than feels right

In order of sophistication, and of when you should actually use each:

**1. Moving average.** 7, 14 and 28 day windows. Trivially explainable. This is
what should ship first, and for many products it will not be beaten.

**2. Exponential smoothing (Holt-Winters).** Adds trend and seasonality.
Explainable with effort, cheap to compute, no training pipeline. This is the
right ceiling for a self-hosted product.

**3. Statistical models (ARIMA/Prophet).** Better on strongly seasonal series.
Adds a Python dependency or a service, and a training step. Only if 2 measurably
fails.

**4. Machine learning.** Gradient boosting over engineered features. Needs
volume, tuning and monitoring. For a single shop it will usually lose to (2)
while being impossible to explain.

The honest expectation: for most products in most shops, a 28-day moving
average with a lead-time buffer captures nearly all the available value. Skip
to (4) and you get worse forecasts that nobody trusts.

---

# Accuracy, stated

Track it, publish it, and let the number set expectations:

```text
MAPE  = mean(|actual − forecast| ÷ actual)        headline, per product
Bias  = mean(forecast − actual)                   systematic over/under
MASE  = MAE ÷ MAE(naïve)                          is it beating "same as last week"?
```

**MASE is the one that matters.** If it is not below 1, the model is losing to
"assume next week looks like last week", and should be replaced by that.

Store the forecast when it is made, not just the latest one — otherwise you can
never evaluate it:

```sql
create table forecasts (
  id, tenant_id, kind, entity_type, entity_id,
  horizon_start date, horizon_end date,
  predicted numeric(18,4),
  confidence_low numeric(18,4),
  confidence_high numeric(18,4),
  method text,                 -- 'moving_average_28'
  actual numeric(18,4),        -- filled in when the period closes
  created_at timestamptz
);
```

A job backfills `actual` as horizons close. That table is the whole basis for
saying anything truthful about accuracy.

---

# Presenting uncertainty

A single number implies precision the forecast does not have. Always show a
range:

```text
Next week:  38 – 52 units      (most likely 45)
```

Not "45". The range is the honest output; the point estimate is a convenience.

Where a range cannot be given, say the method and the window: "based on the
last 28 days". A user who knows the basis can judge it themselves — which is
better than trusting a black box.

---

# Where it appears

* **Reorder suggestions** (**42-ai-recommendations.md**) — replace the flat
  daily rate with the forecast, keeping the working visible.
* **Stockout risk** on the inventory list: days of cover at forecast rate.
* **Revenue projection** on the dashboard, clearly marked as a projection and
  visually distinct from actuals.
* **Cash forecast**: receivables by due date minus payables by due date, plus
  projected sales. Mostly arithmetic over data already held.

Never plot a forecast in the same style as actuals. Dashed, lighter, banded —
whatever the chart language allows — but never mistakable for what happened.

---

# Constraints

* **Computed in a job**, nightly. Forecasting scans history; never on page load.
* **Never auto-acts.** A forecast informs a suggestion; a human commits it.
* **Respects permissions.** Revenue forecasts require
  `dashboard.view_financial`.
* **Degrades explicitly.** Insufficient history shows "not enough data yet",
  with what would be enough.
* **Stays local by default.** Moving averages and Holt-Winters run in-process
  with no external service, which keeps the privacy position in
  **41-ai-assistant.md** intact.

---

# Build order

1. `forecasts` table and the actual-backfill job.
2. Moving average, nightly, per product.
3. Stockout risk on the inventory list.
4. Feed the reorder suggestion.
5. Accuracy tracking — MASE against naïve. Publish it in the admin panel.
6. Holt-Winters, compared against (2) on real MASE before replacing it.
7. Censored-demand correction. Bigger accuracy win than any model change.
8. Revenue and cash projections.

Step 5 gates everything after it. Without accuracy measurement, later steps are
unfalsifiable — and an unfalsifiable forecast is a liability, not a feature.

---

# Next Document

**44-testing-strategy.md**
