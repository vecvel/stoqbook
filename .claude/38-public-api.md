# 38-public-api.md

# Public API

Version: **1.0.0**

Status: **Built for reads, session-authenticated.** API keys and write
endpoints are the gap. Companion to **18-api-specification.md**, which
specifies the contract; this records what exists and what is missing.

---

# What exists

`/api/v1`, session-authenticated, running the full authorization pipeline on
every request.

```text
GET  /api/v1                       discovery — modules, endpoints
GET  /api/v1/health
GET  /api/v1/products              list
GET  /api/v1/products/[id]
GET  /api/v1/products/search       typeahead, used by POS
GET  /api/v1/products/export
GET  /api/v1/customers
GET  /api/v1/suppliers
GET  /api/v1/inventory
GET  /api/v1/sales
GET  /api/v1/purchases
GET  /api/v1/reports/[key]         any implemented report, CSV or JSON
```

Plus two non-versioned application endpoints: `/api/backup` and
`/api/dashboard/export`.

---

# The generic builder

Collection endpoints are declarations, not hand-written handlers:

```ts
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: products,
    permission: "products.view",
    feature: "products.catalog",
    columns: { id: products.id, sku: products.sku, name: products.name },
    searchColumns: [products.name, products.sku, products.barcode],
    sortable: ["name", "sku", "created_at"],
    defaultSort: { field: "name", direction: "asc" },
    filters: { category: products.category_id, status: products.status },
    softDeleteColumn: products.deleted_at,
    tenantColumn: products.tenant_id,
  });
}
```

That yields pagination, sorting, search, exact-match filters, field selection,
soft-delete exclusion, the standard envelope and pagination links — uniformly,
because there is one implementation.

A new resource should be a `ResourceConfig`, not a new handler.

---

# Envelope

```json
{
  "ok": true,
  "message": "42 record(s).",
  "data": [ … ],
  "meta": { "page": 1, "limit": 25, "total": 42, "pages": 2 },
  "links": { "self": "…", "next": "…", "prev": null }
}
```

Errors keep the shape:

```json
{ "ok": false, "error": { "code": "FORBIDDEN", "message": "You do not have permission." } }
```

Codes map to the same `AppError` types the UI uses, so a permission failure
reads identically through both surfaces.

---

# Authorization

Every request runs the full pipeline:

```text
authenticate → business status → licence → module → feature → permission
```

Consequences worth stating plainly:

* An unlicensed module returns `403` with `MODULE_NOT_LICENSED`, not `404`.
* A suspended business returns `403` for everything, API included.
* An expired licence blocks the API exactly as it blocks the UI.

There is no API-only bypass. That is deliberate: a bypass would become the way
people work around licensing.

---

# The gap: API keys

Session cookies are wrong for machine access. What is needed:

```sql
create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  key_prefix   text not null,          -- "sk_live_a1b2" — shown in the UI
  key_hash     text not null,          -- sha256 of the full key
  scopes       jsonb not null default '[]',
  created_by   uuid,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
```

Rules, following the same reasoning as sessions and the employee invite:

* **Only the hash is stored.** The full key is shown once, at creation, and
  never again. A database leak cannot yield working keys.
* **A prefix is stored in clear** so the UI can identify a key without
  revealing it.
* **Scopes are a subset of permissions.** A key can never exceed what its
  creator held. Scope checks compose with — never replace — the pipeline.
* **Revocation is immediate**, not a TTL.
* Creation and revocation are audited.

```http
Authorization: Bearer sk_live_a1b2c3…
```

Resolution builds the same `BusinessContext` a session does, with permissions
intersected with the key's scopes, so every downstream check is unchanged.

---

# The gap: writes

Read endpoints exist; writes do not. Requirements before adding them:

**Idempotency.** A retried `POST` must not create a second sale.

```http
Idempotency-Key: 01J8XA…
```

Store key → response for 24 hours; replay the stored response on repeat. For
anything that moves stock or money this is not optional.

**Reuse the services.** A write endpoint calls `createSale()` — the same
function POS uses. It must never assemble its own inserts, or the two paths
will drift and one will forget the ledger.

**Validate at the edge.** Parse and reject before touching the database, with
field-level errors in the envelope.

Priority order, by real demand: create sale, create/update product, adjust
stock, create customer.

---

# Rate limiting

None today. Session auth and a single business make abuse unlikely, but keys
change that. When keys land:

```text
per key   600 req / min
per IP    100 req / min  (unauthenticated)
```

Return `429` with `Retry-After`, and `X-RateLimit-Remaining` on every
response. A token bucket in Postgres is adequate at this scale; do not add
Redis for it.

---

# Versioning

`/api/v1` is in the path. The contract:

* Additive changes — new fields, new endpoints — happen within `v1`.
* Removing or renaming a field requires `v2`.
* `v1` keeps working for a stated deprecation window after `v2` ships.
* `/api/v1` discovery advertises the current version.

Clients must tolerate unknown fields. Say so in the developer guide.

---

# Not exposed, deliberately

* **Anything in `/admin`.** Licence, plans, flags, business status are
  operator actions, not integration surface.
* **Backup.** `/api/backup` is session-only. A key that can exfiltrate the
  whole database is a liability.
* **Audit log writes.** Append-only, written by the application. An API that
  can forge audit entries defeats the audit log.

---

# Build order

1. `api_keys` table, hashing, resolution middleware.
2. Admin screen: create, list, revoke.
3. Rate limiting.
4. Idempotency store.
5. Write endpoints, calling existing services, in demand order.
6. OpenAPI document generated from the `ResourceConfig` declarations.

Step 6 matters: the configs already hold columns, filters and sortable fields,
so the spec can be generated rather than maintained by hand — which is the
only way it stays true.

---

# Next Document

**39-webhooks.md**
