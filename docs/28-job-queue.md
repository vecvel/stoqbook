# 28-job-queue.md

# Job Queue

Version: **1.0.0**

Status: **Built.** `src/lib/jobs/` — queue, runner, handlers, ticker; the admin
screen is `/admin/jobs`; the cron entry point is `POST /api/jobs/tick`.

---

# What was waiting, and what now happens

| Feature | Before | Now |
|---|---|---|
| Email / SMS / WhatsApp notifications | Row written `queued`, never sent | `notification.deliver` posts to the configured HTTP API and marks the row `sent` |
| Webhook channel | Same | Signed POST (HMAC-SHA256 over `timestamp.body`) through the same handler — not a separate job kind |
| Scheduled reports | Ran only on **Run due now** | `sweepDueReports()` claims and enqueues `report.run_scheduled`; the button now just drains the queue immediately |
| Quiet-hour notifications | Queued correctly, nothing released them | `notification.release_quiet` releases them once the window closes |
| Notification retry | Not implemented | Exponential backoff with jitter, capped at an hour, 5 attempts |
| Ledger drift | Never checked unless someone ran SQL | `integrity.check` audits all four balance/ledger pairs and raises a critical notification on drift |

Copy that used to say "queues only" has been replaced: the integrations page now
*derives* readiness from whether a channel has both a switch and an endpoint, so
it cannot drift out of step with what the queue will actually do.

A kind is only added to the `JobKind` union once a handler is registered for it.
An enqueueable kind with no handler fails on first claim, which is worse than
not being able to enqueue it at all.

---

# Constraint that shapes the design

StoqBook is **self-hosted, single-business, one process**. Introducing Redis or
a broker to send a handful of emails a day would be a worse product. The queue
must therefore:

* use Postgres, which is already required;
* work with zero extra infrastructure;
* survive being run as a second process, or a cron hit, or nothing at all.

---

# Schema

```sql
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  kind          text not null,                  -- 'notification.deliver'
  payload       jsonb not null default '{}',
  status        job_status not null default 'pending',
  priority      integer not null default 100,   -- lower runs first
  run_after     timestamptz not null default now(),
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  locked_at     timestamptz,
  locked_by     text,
  last_error    text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create type job_status as enum ('pending','running','completed','failed','cancelled');

create index jobs_claim_idx on jobs (status, run_after, priority)
  where status = 'pending';
create index jobs_tenant_kind_idx on jobs (tenant_id, kind, created_at);
```

---

# Claiming

One statement, no race, no advisory locks:

```sql
update jobs
set    status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
where  id in (
  select id from jobs
  where  status = 'pending' and run_after <= now()
  order  by priority, run_after
  limit  $2
  for update skip locked
)
returning *;
```

`FOR UPDATE SKIP LOCKED` is the whole trick: several workers can claim
concurrently and never collide. This is the same claim-before-work pattern
`runDueReports()` already uses for schedules — that function is effectively a
hand-rolled single-purpose queue, and should be folded into this one.

---

# Retry

Exponential backoff with jitter, capped:

```ts
const delaySeconds = Math.min(3600, 2 ** attempts * 30) + Math.random() * 30;
```

```text
attempt 1 → +30s    attempt 3 → +2m    attempt 5 → +8m
```

On the final failure the job moves to `failed` with `last_error` kept. Failed
jobs are never silently discarded — the admin panel must be able to show them,
because a queue that loses work quietly is worse than no queue.

Jitter matters: without it, a burst that fails together retries together
forever.

---

# Handlers

```ts
// src/lib/jobs/registry.ts
export type JobHandler<T> = (payload: T, ctx: JobContext) => Promise<void>;

export function registerJob<T>(kind: string, handler: JobHandler<T>): void;
```

```ts
registerJob<{ notificationId: string }>("notification.deliver", async (p, ctx) => {
  await deliverNotification(ctx, p.notificationId);
});
```

Handlers must be **idempotent**. A job can run twice: the worker may die
between doing the work and marking it complete. Check whether the effect has
already happened before applying it.

---

# Initial job kinds

| Kind | Purpose |
|---|---|
| `notification.deliver` | Send one queued notification on its channel |
| `notification.release_quiet` | Deliver messages held by quiet hours |
| `report.run_scheduled` | Run one due saved report |
| `webhook.post` | POST one signed event |
| `backup.snapshot` | Write a scheduled backup |
| `inventory.low_stock_scan` | Raise `LowStockDetected` |
| `license.expiry_check` | Warn before a licence lapses |

---

# Running the worker

Three modes, all built. Nothing outbound is delivered until one is running, so
choosing one is part of installing the software, not an optimisation.

**1. Separate process.** `npm run worker` (`src/worker.ts`) runs the same code
with no HTTP server, polling every 15s. The right answer for a real deployment:
the queue keeps draining through a web-server restart, and a wedged handler
takes down the worker rather than the till. Shuts down between passes on
SIGINT/SIGTERM rather than mid-batch.

**2. In-process ticker.** `src/lib/jobs/ticker.ts`, started from
`src/instrumentation.ts` when `JOB_TICKER=1`. Zero extra process. Dies with the
web server and does nothing while the server is idle. Guarded against
double-start (dev HMR evaluates a module more than once) and skips a pass if the
previous one is still going. Running it *and* the standalone worker is safe —
`SKIP LOCKED` makes double-claim impossible — but pointless.

**3. External cron.** `POST /api/jobs/tick` with `JOB_TICK_SECRET` as a bearer
token, compared in constant time. Returns **503 while the secret is unset**: an
unguarded tick endpoint is a denial-of-service handle, so absent configuration
closes the endpoint rather than opening it.

All three call the same `enqueueRecurring()` + `drain()` pair, so the outcome
does not depend on which one you picked.

Claiming advances state before the work happens, at both levels: `run_after` for
report schedules, and `attempts` at job claim time — so a worker that dies
mid-job does not get infinite free retries.

---

# Observability

`/admin/jobs`: pending / running / failed counts, oldest-pending age, the recent
job list ordered failures-first, per-row `last_error`, and retry / cancel
actions. Plus the registered-kind list, because "no handler for X" is otherwise
an opaque failure.

Oldest-pending-age is the one number that tells you the queue is stuck; the
screen warns above 15 minutes and names the three ways to fix it. Queue health
also appears as a tile on the admin overview — nothing else on that page would
tell an owner that notifications stopped going out an hour ago.

Failures-first ordering is deliberate: a failure that scrolled off the first page
is a failure nobody will notice.

---

# What must not go in the queue

* Anything the user is waiting for. A sale, a receipt, a stock movement — all
  synchronous, all transactional.
* Anything that must be atomic with a database change. Use the transaction, or
  the outbox pattern in **27-event-system.md**.

The queue is for work that is slow, external, or scheduled. Nothing else.

---

# Two traps found while building this

**`db.execute(sql...)` bypasses Drizzle's column mapping.** The claim query has
to be raw SQL for `FOR UPDATE SKIP LOCKED`, so it returns raw driver rows:
timestamps as strings, integers possibly as strings. Typing the result as
`JobRow` was a lie that surfaced later as `value.toISOString is not a function`
inside `markFailed`. `hydrate()` normalises every row at the boundary.

**`UPDATE … RETURNING` has no ordering guarantee.** The inner `select` picks the
right rows by priority, but they come back in whatever order the update touched
them — so "lower priority runs first" held for *selection* and not for
*execution*. `claim()` re-sorts the hydrated rows.

Both were found by exercising the queue against real Postgres rather than
trusting the types, which is the only way either would have surfaced.

---

# Excluded from backup

`jobs` is the one table deliberately absent from `BACKUP_TABLES`. It holds work
in flight, not business records: restoring a week-old backup would put a week of
already-delivered notifications back in the queue and send every one again.
Losing the queue on a restore costs one sweep. Replaying it costs the business
its credibility with its own customers.

---

# Next Document

**29-search-system.md** — the one cross-module surface that is finished.
