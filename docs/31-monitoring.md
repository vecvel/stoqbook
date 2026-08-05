# 31-monitoring.md

# Monitoring

Version: **1.0.0**

Status: **Partly built.** `/api/v1/health` exists. Everything else here is
specification.

---

# What is worth watching

StoqBook is a single-business, self-hosted product. Nobody is running a
24/7 SRE rota against it. Monitoring must therefore answer three questions
and stop:

1. Is it up?
2. Is anything silently broken?
3. Is any number wrong?

Question 3 is the one most systems skip, and the one that matters most here.

---

# Health

`GET /api/v1/health` — unauthenticated, cheap, no business data.

```json
{ "status": "ok", "version": "1.0.0", "database": "ok", "uptimeSeconds": 84120 }
```

Return `503` when the database check fails, so a load balancer acts on it.
Never include row counts, business names or licence details — this endpoint is
public.

A second endpoint, authenticated and gated on `admin.panel`, may be deeper:

```text
GET /api/admin/health
  database latency, pending jobs, oldest pending job age,
  failed jobs (24h), licence status, disk usage
```

---

# The four signals that matter

| Signal | Source | Alert when |
|---|---|---|
| Oldest pending job age | `jobs` | > 15 min |
| Failed jobs (24h) | `jobs` | > 0 |
| Ledger drift | integrity queries | ≠ 0, ever |
| Licence expiry | `licenses` | < 14 days |

The first two only exist once **28-job-queue.md** is built. The third is
available today and is the single most valuable check in the system.

---

# Integrity monitoring

This is the part specific to StoqBook. Four derived balances each have a
ledger behind them, and drift between them means money or stock is wrong.

```sql
-- inventory
select count(*) from (
  select l.id from inventory_levels l
  left join inventory_movements m
    on m.product_id = l.product_id and m.warehouse_id = l.warehouse_id
  group by l.id, l.quantity_available
  having l.quantity_available <> coalesce(sum(m.quantity), 0)
) d;

-- customers
select count(*) from (
  select c.id from customers c
  left join customer_ledger cl on cl.customer_id = c.id
  where c.deleted_at is null
  group by c.id, c.outstanding_balance
  having c.outstanding_balance <> coalesce(sum(cl.amount), 0)
) d;
```

The same shape applies to suppliers and gift cards.

**Every one of these must be zero.** A non-zero result is not a warning, it is
a defect — run it nightly, alert immediately, and treat it as a stop-work
condition.

Two more worth running:

```sql
-- duplicate settings (the NULLS DISTINCT trap)
select scope, tenant_id, key, count(*) from settings
group by 1,2,3 having count(*) > 1;

-- orphaned document numbers
select document_type, count(*) from number_sequences group by 1 having count(*) > 1;
```

---

# Application metrics

If a metrics backend exists, expose Prometheus text at `/api/metrics`, gated
by a bearer token.

```text
stoqbook_http_requests_total{route,method,status}
stoqbook_http_duration_seconds{route}          histogram
stoqbook_jobs_pending{kind}
stoqbook_jobs_failed_total{kind}
stoqbook_notifications_queued
stoqbook_ledger_drift{ledger}                  must be 0
stoqbook_db_pool_in_use
```

Label by route pattern, never by raw path — `/products/[id]`, not the id.
Unbounded label cardinality is how metrics backends fall over.

Never label with a business name, user id, email or document number.

---

# Error tracking

Server actions swallow errors into `ActionResult` by design, so the user gets
a sentence instead of a stack trace. That means **unhandled errors are
invisible unless reported explicitly**.

Report from the two chokepoints:

```ts
// runAction — the one place every action error passes through
catch (error) {
  const appError = toAppError(error);
  if (appError.status >= 500) reportError(error, { action: name, businessId });
  return failure(appError.message);
}
```

The same applies to `failFrom()` in the API layer.

Expected failures — validation, business rules, permission denials — are not
errors and must not be reported. Reporting them buries the real ones.

Scrub before sending: no passwords, no session tokens, no licence keys, no
customer contact details.

---

# What to alert on

Alert only on things a human must act on:

* Health check failing
* Ledger drift non-zero
* Failed jobs accumulating
* Oldest pending job exceeding threshold
* Disk above 85%
* Licence expiring within 14 days

Do **not** alert on CPU spikes, individual 500s, or slow queries. Those are
dashboard material. An alert that fires without requiring action trains people
to ignore alerts.

---

# In-app surfacing

For a self-hosted product, the admin panel is the monitoring console for most
operators. `/admin` should show:

* Licence status and days remaining — already there
* Job queue depth and failures — once the queue exists
* Last successful backup
* Integrity check status and when it last ran

A green tick that means "the ledgers reconcile" is worth more to a shopkeeper
than any graph.

---

# Build order

1. Extend `/api/v1/health` with the database check and a proper 503.
2. Integrity queries as a scheduled job, writing results somewhere visible.
3. `reportError` in `runAction` and `failFrom`.
4. `/api/admin/health`.
5. Prometheus endpoint, if wanted.

---

# Next Document

**32-logging.md**
