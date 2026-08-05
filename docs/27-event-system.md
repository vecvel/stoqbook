# 27-event-system.md

# Event System

Version: **1.0.0**

Status: **Partly built.** Events are declared, named and consumed by the
notification engine and the audit trail. There is no general subscriber bus
yet. This document describes both halves honestly.

---

# What exists today

Two consumers, both real:

```text
Business action
   ├─▶ auditEvent(ctx, {...})   → audit_logs        (always)
   └─▶ emit({...})              → notifications     (when someone should know)
```

Every module declares its event names in the registry:

```ts
events: ["SaleCompleted", "SaleCancelled", "SaleReturned"],
```

Those names populate the notification rule editor's autocomplete, so an
administrator writes rules against real event names rather than guesses.

---

# Raising an event

```ts
await emit({
  businessId: ctx.business.id,
  event: "LowStockDetected",
  moduleSlug: "inventory",
  priority: "high",              // critical | high | medium | low | silent
  title: "Stock running low",
  body: `${product} is down to ${quantity}.`,
  actionUrl: "/inventory?filter=low",
  fallbackPermission: "inventory.view",
  variables: { product, quantity, minimum, store },
});
```

`variables` is not optional in practice. A business can override the wording
with its own template; if the caller passes no variables, that template renders
with `{{placeholders}}` visible to the user. Pass every value the wording could
reasonably want.

---

# Resolution order

```text
emit(event)
  ├─ recipients:  explicit userIds
  │               └─ else rule.recipient_user_ids + rule.recipient_roles
  │                  └─ else everyone holding fallbackPermission (+ Owner)
  ├─ channels:    rule.channels, default ["in_app"]
  ├─ priority:    input.priority ?? rule.priority ?? "medium"
  ├─ template:    business template for (event, channel), else the caller's text
  └─ per recipient:
        preferences → drop if disabled, intersect channels
        quiet hours → queue instead of deliver
        critical    → ignores both of the above
```

Only active users are ever notified. Quiet-hour messages are **queued, not
dropped**, so they arrive once the window closes.

---

# Event naming

`PascalCase`, past tense, subject first:

```text
SaleCompleted        not  sale_completed, CompleteSale, SaleCompleteEvent
StockAdjusted
PurchaseOrderCreated
LeaveApproved
GiftCardIssued
```

Past tense matters: an event records something that has already happened, and
a subscriber must never be able to prevent it.

---

# Where events are raised from

Inside the transaction that made the change, when the notification must not
outlive a rollback:

```ts
await db.transaction(async (tx) => {
  // …the actual change…
  await auditEvent(ctx, { … }, tx);   // joins the transaction
});
```

`emit()` currently writes outside the transaction. That is a deliberate
trade-off — a failed notification must not roll back a completed sale — but it
means a notification can exist for a change that later fails. Where that
matters, emit after the transaction commits, which is what `requestLeave` and
`saveExpense` do.

---

# What is missing: the subscriber bus

Today a module that wants to react to another module's event must be called
directly. That is the coupling **05-module-system.md** says to avoid, and it is
the main thing standing between StoqBook and a plugin ecosystem.

The design:

```ts
// src/lib/events/bus.ts
export interface DomainEvent<T = Record<string, unknown>> {
  event: string;
  businessId: string;
  moduleSlug: string;
  entityType?: string;
  entityId?: string;
  payload: T;
  occurredAt: Date;
  actorId: string | null;
}

export type Subscriber = (e: DomainEvent) => Promise<void>;

export function subscribe(event: string | "*", handler: Subscriber): void;
export async function publish(e: DomainEvent, client?: DbClient): Promise<void>;
```

`publish()` becomes the single call a service makes. It fans out to the audit
writer, the notification engine, and any registered subscribers.

Rules for subscribers:

1. **A subscriber cannot veto.** The event already happened.
2. **A subscriber cannot throw into the publisher.** Errors are caught, logged
   and recorded as a failed handler.
3. **Slow work is enqueued, not done inline.** A subscriber that needs to call
   an external service enqueues a job (**28-job-queue.md**).
4. **Ordering is not guaranteed** between subscribers of the same event.

---

# Delivery guarantee

Today: in-process, at-most-once, no retry. A subscriber that fails loses the
event.

The upgrade path, when it is needed, is an outbox — write the event to a table
in the same transaction as the change, and have a worker deliver it:

```text
domain_events(id, business_id, event, payload, occurred_at, processed_at, attempts, last_error)
```

That converts delivery to at-least-once, which means subscribers must become
idempotent. Do not adopt the outbox without also making handlers idempotent —
half the pattern is worse than neither.

---

# Webhooks

Webhooks are a subscriber that forwards to HTTP. The settings exist
(`integrations.webhook_url`, `integrations.webhook_secret`) and the
notification channel exists; the sender does not. See **39-webhooks.md**.

---

# Event catalogue

Declared across the registry today. Representative, not exhaustive:

| Module | Events |
|---|---|
| Sales | SaleCompleted, SaleCancelled, SaleReturned, QuotationCreated, QuotationConverted, GiftCardIssued |
| Inventory | StockAdjusted, StockTransferred, LowStockDetected, OpeningStockCreated |
| Purchases | PurchaseOrderCreated, PurchaseApproved, GoodsReceived, PaymentRecorded |
| Customers | CustomerCreated, CustomersMerged, CreditLimitExceeded, LoyaltyEarned |
| Employees | LeaveRequested, LeaveApproved, AttendanceMarked, EmployeeInvited |
| Expenses | ExpenseRecorded, ExpenseApproved, ExpenseRejected |
| Admin | BusinessSuspended, LicenseAssigned, FeatureFlagUpdated |

`ALL_EVENTS` in the registry index is the live list, derived from the module
declarations — use it rather than duplicating this table.

---

# Build order

1. `publish()` wrapping the two existing consumers — no behaviour change.
2. `subscribe()` with error isolation.
3. Move notification emission behind `publish()`.
4. Outbox table and worker, plus idempotency, when at-least-once is needed.
5. Webhook subscriber.

---

# Next Document

**28-job-queue.md** — the missing worker, which several features already
depend on.
