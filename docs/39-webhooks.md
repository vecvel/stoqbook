# 39-webhooks.md

# Webhooks

Version: **1.0.0**

Status: **Settings and channel exist; the sender does not.** A notification
rule can already select the `webhook` channel, and
`integrations.webhook_url` / `integrations.webhook_secret` are configurable —
but nothing posts. The integrations page says "queues only" for exactly this
reason.

---

# Where it fits

A webhook is a subscriber that forwards a domain event over HTTP. It depends
on two things not yet built:

* **27-event-system.md** — the subscriber bus
* **28-job-queue.md** — delivery with retry

Building webhooks before those means hand-rolling both, badly. Build them
first.

```text
Business action → publish(event) → webhook subscriber → enqueue webhook.post
                                                              ↓
                                                     sign → POST → retry
```

Delivery must be asynchronous. A sale must never wait on someone else's
endpoint, and must never fail because it timed out.

---

# Endpoint configuration

One URL in settings is enough to start, but the useful shape is a table —
several endpoints, each subscribing to different events:

```sql
create table webhook_endpoints (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  url          text not null,
  secret       text not null,          -- generated, shown once
  events       jsonb not null default '[]',   -- [] means all
  is_active    boolean not null default true,
  description  text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count   integer not null default 0,
  created_at   timestamptz not null default now()
);
```

Validate the URL on save: HTTPS only in production, and reject private address
ranges unless explicitly allowed. Posting to `http://169.254.169.254/` is
server-side request forgery against the cloud metadata endpoint, and a
user-supplied URL is exactly the vector.

---

# Payload

```json
{
  "id": "01J8XA…",
  "event": "SaleCompleted",
  "occurredAt": "2026-08-01T09:44:35.749Z",
  "businessId": "…",
  "data": {
    "invoiceId": "…",
    "invoiceNumber": "INV-2026-000009",
    "grandTotal": "175.0000",
    "customerId": null
  }
}
```

Rules:

* **`id` is stable across retries.** It is how the receiver deduplicates.
* **Money stays a string.** Serialising `175.0000` as a JSON number invites the
  receiver to parse it as a float — the exact mistake the whole money layer
  exists to prevent.
* **Identifiers, not joined objects.** Send `customerId`; let the receiver
  fetch the customer if it wants one. Embedding invites the payload to grow
  without bound and leaks fields the subscriber may not be entitled to.
* **Never send** password hashes, licence keys, session tokens or full
  customer contact details.

---

# Signing

HMAC-SHA256 over `timestamp.body`, in the Stripe style:

```http
X-StoqBook-Event: SaleCompleted
X-StoqBook-Delivery: 01J8XA…
X-StoqBook-Timestamp: 1785000275
X-StoqBook-Signature: sha256=abc123…
```

```ts
const signed = `${timestamp}.${body}`;
const signature = createHmac("sha256", endpoint.secret).update(signed).digest("hex");
```

The timestamp is inside the signed payload so a captured request cannot be
replayed later. Document that receivers must reject anything older than five
minutes, and must compare signatures in constant time.

The secret is generated on endpoint creation and shown once — same rule as API
keys and the employee invite.

---

# Delivery and retry

One job per endpoint per event, so a slow endpoint cannot delay another.

```text
timeout            10 s
success            2xx
retryable          408, 429, 5xx, timeout, connection error
permanent          4xx other than 408/429
backoff            30s, 2m, 8m, 30m, 2h   (5 attempts)
```

A permanent failure is not retried — a `404` will still be a `404` in two
hours.

After a run of consecutive failures (say 20), disable the endpoint and raise a
**critical** notification. An endpoint that has been dead for a week should not
still be generating load, and the business should know.

---

# Delivery log

Receivers will ask "did you send it?", and the answer must be evidence:

```sql
create table webhook_deliveries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  endpoint_id  uuid not null references webhook_endpoints(id) on delete cascade,
  event        text not null,
  payload      jsonb not null,
  attempt      integer not null,
  status_code  integer,
  response_ms  integer,
  error        text,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);
```

Surface it in the admin panel with a **Resend** action. Retain 30 days.

Store the response status and timing, not the response body — bodies are
unbounded and can contain anything.

---

# What the receiver must do

Worth documenting for integrators, because these are the failures that
generate support load:

1. **Respond 200 immediately**, then process asynchronously. Slow processing
   causes timeouts, which cause retries, which cause duplicates.
2. **Verify the signature** before parsing.
3. **Deduplicate on `id`.** Delivery is at-least-once; duplicates are expected,
   not exceptional.
4. **Tolerate unknown fields.** New fields are added within a version.
5. **Do not depend on ordering.** Two events can arrive out of order.

---

# Testing

The admin screen needs a **Send test event** button that posts a synthetic
`ping` and shows the exact response. Without it, every integration begins with
a round of blind debugging.

---

# Build order

1. Event bus (**27**) and job queue (**28**).
2. `webhook_endpoints` with URL validation and secret generation.
3. `webhook.post` job: sign, POST, classify, retry.
4. `webhook_deliveries` and the admin screen.
5. Test event.
6. Auto-disable after sustained failure.

---

# Next Document

**40-developer-guide.md**
