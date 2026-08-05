# 32-logging.md

# Logging

Version: **1.0.0**

Status: **Audit logging built; application logging is `console` only.**

---

# Three different things

They are routinely confused. They are not the same.

| | Audit log | Application log | Metrics |
|---|---|---|---|
| Question | Who changed what? | Why did it break? | How is it behaving? |
| Store | `audit_logs` table | stdout / aggregator | Time series |
| Audience | Business owner, auditor | Developer | Operator |
| Retention | Years | Days to weeks | Months, downsampled |
| Mutable | **Never** | Rotates | Downsamples |
| Built | Yes | No | No |

This document covers the middle column. The audit log is
**21-security.md** and the section below; metrics are **31-monitoring.md**.

---

# Audit log (built)

Append-only. No update path, no delete path, no soft delete.

```ts
await auditEvent(ctx, {
  event: "ExpenseApproved",
  moduleSlug: "expenses",
  entityType: "expense",
  entityId: id,
  summary: "EXP-2026-000001 approved",
  payload: { changes: diff(before, after) },
});
```

Three writers:

| Function | Actor |
|---|---|
| `auditEvent(ctx, …)` | A signed-in user |
| `auditAdmin(ctx, …)` | Same, defaulted to the `admin` module |
| `auditSystem({…})` | No user — setup, jobs, scheduled work |

Design decisions worth keeping:

* **`diff()` not snapshots.** Payloads hold `{ field: { from, to } }` for
  changed fields only. A snapshot of every row would make the table
  unreadable and unaffordable.
* **Secrets never enter a payload.** The invite flow records the email and
  deliberately not the generated password.
* **IP and user agent** are captured from request headers, and absent
  gracefully when running outside a request (seeds, jobs).

Surfaced at `/admin/audit`, and as the `admin.audit_trail` report.

---

# Application logging (to build)

Structured JSON to stdout. The process does not own log shipping — the
platform does. Do not write log files from the app.

```ts
// src/lib/log.ts
log.info("sale.completed", { invoiceId, total, durationMs });
log.warn("license.expiring", { daysRemaining });
log.error("job.failed", { kind, attempts, error: err.message });
```

```json
{"ts":"2026-08-01T09:44:35.749Z","level":"error","msg":"job.failed",
 "kind":"notification.deliver","attempts":3,"requestId":"01J…"}
```

Levels:

| Level | Meaning |
|---|---|
| `error` | Broken; a human should look |
| `warn` | Degraded but handled — retry, fallback, approaching a limit |
| `info` | Notable lifecycle events — boot, migration, scheduled run |
| `debug` | Development only; off in production |

Default to `info` in production. `debug` in production is how secrets end up
in logs.

---

# Request correlation

Assign an id at the edge and thread it through:

```text
x-request-id header (or generated) → async context → every log line
```

Return it on error responses so a user can quote it in a support message. That
single id turns "it broke yesterday" into a searchable query.

---

# What must never be logged

* Passwords, in any form — including "the value that failed validation"
* Session tokens or their hashes
* Licence keys
* Full customer contact details
* Complete request bodies from POST endpoints
* Anything from a `password`, `token`, `secret` or `key` field

Redact centrally in the logger rather than at each call site. A denylist
applied at one chokepoint is the only version that holds up.

---

# Database logging

Do not log every query — it is noise and it leaks parameters. Log only:

* Queries slower than a threshold (500 ms), with the **query shape**, never
  the bound values
* Connection pool exhaustion
* Transaction rollbacks with their cause

---

# What to log at the boundaries

**Server actions.** One line on failure, from inside `runAction`. Successes are
already in the audit log; logging them twice doubles volume for nothing.

**API routes.** Method, route pattern, status, duration, request id. Route
pattern, not the resolved path — `/api/v1/products/[id]` keeps cardinality
bounded and keeps ids out of logs.

**Jobs.** Claim, complete or fail, with kind, attempt and duration.

**Auth.** Sign-in outcomes go to `login_history`, which is a table, not a log —
it is business data the security page renders. Log only unexpected failures.

---

# Retention

| Stream | Keep |
|---|---|
| Application logs | 14–30 days |
| `audit_logs` | Years — a compliance decision, not an engineering one |
| `login_history` | 90 days, then prune |
| `notifications` | 90 days for delivered/read |
| `report_runs` | 1 year |

`audit_logs` grows without bound by design. When it becomes a problem, archive
old partitions to cold storage — never delete. Partition by month if it gets
large enough to matter.

---

# Self-hosted reality

Most installations will have no log aggregator. Structured JSON on stdout is
still the right choice: `docker compose logs` remains readable, and `jq`
works. The important thing is that nothing is *only* in the logs — anything a
business owner needs is in the audit log, the notification delivery page or
the admin panel, all of which are queryable in the product.

---

# Build order

1. `src/lib/log.ts` with levels, JSON output and central redaction.
2. Request id middleware, threaded through async context.
3. Wire `runAction` and `failFrom`.
4. Slow-query logging.
5. Job lifecycle logging, alongside the queue.

---

# Next Document

**33-backup-recovery.md**
