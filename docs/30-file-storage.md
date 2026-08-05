# 30-file-storage.md

# File Storage

Version: **1.0.0**

Status: **Not built.** Several tables already carry URL columns with nothing
writing to them. This document specifies the missing layer.

---

# What already expects it

| Table | Column | Intended content |
|---|---|---|
| `organizations` | `logo_url` | Logo on invoices and receipts |
| `products` | image fields | Catalogue photographs |
| `expenses` | `attachment_url` | Receipt scan |
| `purchase_invoices` | `attachment_url` | Supplier invoice PDF |
| `supplier_contracts` | `attachment_url` | Signed agreement |

Today these are free-text URL fields: a user can paste a link to a file hosted
elsewhere, and the contracts panel renders it as "Signed copy". That is a
deliberate interim — it is useful, honest, and stores nothing. It is not
upload.

---

# Requirements

* Works with no cloud account, because StoqBook is self-hosted by default.
* Swappable for S3-compatible object storage without touching call sites.
* Files are **never** served straight from disk by path — every read goes
  through an authorization check.
* Uploads are validated by content, not by filename.
* Deleting a record does not orphan its files.

---

# Interface

One driver interface, two implementations to begin with.

```ts
// src/lib/storage/driver.ts
export interface StoredFile {
  key: string;          // "business/<id>/expenses/<uuid>.pdf"
  size: number;
  contentType: string;
  checksum: string;     // sha256
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Presigned URL where the driver supports it; null forces a proxied read. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | null>;
}
```

`LocalDriver` writes under `STORAGE_PATH` (default `./storage`, outside
`public/`). `S3Driver` covers AWS S3, Cloudflare R2, MinIO and anything else
S3-compatible. Selected by `STORAGE_DRIVER`.

---

# Key layout

```text
business/<businessId>/<entity>/<uuid>.<ext>
```

The business id is the first segment so a whole business's files can be
listed, backed up or removed with one prefix. The filename is always a fresh
UUID — never the uploaded name, which is attacker-controlled and a path
traversal risk. The original name is metadata, not a path.

---

# Metadata table

Files need a row, or they cannot be authorized, listed or cleaned up.

```sql
create table files (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  storage_key   text not null unique,
  original_name text not null,
  content_type  text not null,
  size_bytes    integer not null,
  checksum      text not null,
  entity_type   text,          -- 'expense'
  entity_id     uuid,          -- the row it belongs to
  uploaded_by   uuid,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index files_entity_idx on files (tenant_id, entity_type, entity_id);
```

The URL columns then hold `/api/files/<id>`, not a storage path. Storage
layout becomes an implementation detail the database does not know.

---

# Upload

```text
POST /api/files
  ├─ requirePermission(…)         caller must be able to edit the entity
  ├─ size check                   before reading the whole body
  ├─ magic-number sniff           actual bytes, not the extension
  ├─ extension allowlist          jpg png webp pdf csv xlsx
  ├─ driver.put()
  └─ insert files row → return { id, url }
```

**Validate by content.** A file called `receipt.pdf` that begins with `MZ` is
an executable. Check the magic number and reject on mismatch — do not trust
the extension or the browser-supplied MIME type.

Limits are licence limits, using the existing mechanism:
`max_storage_mb` is already a plan limit and already shown on the licence page.
Wire `assertWithinLimit` to actual usage once files exist.

---

# Download

```text
GET /api/files/<id>
  ├─ load the files row (scoped to the business)
  ├─ authorize against the owning entity, not the file
  ├─ driver.signedUrl() → redirect,  or  driver.get() → stream
  └─ Content-Disposition: attachment for anything not an image
```

Authorizing against the **owning entity** is the important part. Permission to
read an expense receipt is `expenses.view`, not a file permission. A file
inherits the authorization of the thing it is attached to; it never has its
own.

Serve `Content-Disposition: attachment` for PDFs and spreadsheets so a
malicious file cannot execute in the origin's context.

---

# Images

Product photographs need derivatives. Generate on upload rather than on read:

```text
thumb   150×150   list rows
card    400×400   grids
full    1200 max  detail
```

`sharp` is already a dependency. Store derivatives as separate keys next to
the original and record them on the file row.

---

# Lifecycle

Uploads are two-phase: a file exists before the record referencing it is
saved. A cancelled form therefore leaves an orphan.

Handle it with a sweep, not with cleverness: a job (**28-job-queue.md**)
deletes files with no `entity_id` older than 24 hours.

When a record is soft-deleted, its files are soft-deleted too. Hard deletion
happens only on purge, and only after the retention window.

---

# Backup

`buildBackup()` today exports rows, not files. Once storage exists the backup
page must say plainly that files are **not** included, and offer either a
separate archive or a documented `rsync` of the storage prefix.

An export that silently omits attachments while calling itself a backup is the
kind of thing people discover at the worst moment.

---

# Security checklist

* [ ] Filename never used as a path
* [ ] Magic-number validation, extension allowlist
* [ ] Size limit enforced before buffering
* [ ] Storage root outside `public/`
* [ ] Every read authorized against the owning entity
* [ ] `Content-Disposition: attachment` for non-images
* [ ] No user-controlled content served from the app origin
* [ ] Uploads audited; deletions audited

---

# Build order

1. Driver interface + `LocalDriver`.
2. `files` table and `/api/files` upload with validation.
3. `/api/files/<id>` download with entity authorization.
4. Wire the expense receipt field — the smallest real case.
5. Image derivatives, then product images.
6. Orphan sweep job.
7. `S3Driver`.
8. Storage usage against `max_storage_mb`.

---

# Next Document

**31-monitoring.md** — beginning the infrastructure set.
