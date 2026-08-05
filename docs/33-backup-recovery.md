# 33-backup-recovery.md

# Backup and Recovery

Version: **1.0.0**

Status: **Logical export built; scheduling, files and restore are not.**

---

# What exists

`/settings/backup` and `GET /api/backup`, gated on `settings.backup`.

`buildBackup()` reads every business-owned table in foreign-key order and
returns one JSON document:

```json
{
  "format": "stoqbook-json",
  "version": 1,
  "businessId": "…",
  "businessSlug": "freshmart",
  "takenAt": "2026-08-01T09:44:35.749Z",
  "tables": { "tenants": [...], "products": [...], … }
}
```

The page shows row counts per table before download, and taking a backup is
audited.

---

# What it is not

It is a **data export**, not a `pg_dump`. It carries:

* no indexes
* no sequences
* no enum definitions
* no uploaded files

The UI says exactly this rather than implying otherwise. Anyone relying on it
as their only copy is relying on the wrong thing, and the page tells them so.

---

# Why restore is not offered in the UI

Deliberate, and worth restating because it will be questioned.

Four balances in StoqBook are derived from append-only ledgers, and each is
kept correct by writing both inside one transaction with a row lock. Replaying
rows table by table through the application would produce
`inventory_levels` and `customers.outstanding_balance` values that no longer
match the ledgers behind them — silently, and in a way that only surfaces
weeks later during a stock count.

A restore that can corrupt the ledger is worse than no restore. So the product
offers export, and points at the database for recovery:

```bash
npm run db:reset                      # recreate the schema, empty
psql "$DATABASE_URL" -f dump.sql      # or pg_restore for a custom-format dump
```

If an in-app restore is ever built, it must restore into an **empty** schema in
a single transaction with triggers deferred, then run the integrity queries
from **31-monitoring.md** and refuse to commit on any drift.

---

# The real backup strategy

Three layers. The product provides one; the operator must provide the others.

**1. Physical — the actual backup.**

```bash
pg_dump --format=custom --file=stoqbook-$(date +%F).dump "$DATABASE_URL"
```

Nightly, retained 30 days, at least one copy off the machine. This is the one
that restores.

**2. Logical — the portable copy.** The JSON export. Good for inspection,
migration between installations, and answering "what did this look like in
July". Not a restore path on its own.

**3. Files.** Once **30-file-storage.md** is built, the storage prefix must be
backed up too — `rsync` for local, versioning for S3. Until then there are no
files to lose, and the backup page must start saying so the moment that
changes.

---

# Point-in-time recovery

For a business that cannot lose a day of sales, nightly dumps are not enough.
Enable WAL archiving:

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /archive/%f && cp %p /archive/%f'
```

That allows recovery to any moment, which matters because the realistic
disaster is not disk failure — it is someone approving the wrong thing at
14:32 and needing 14:31 back.

---

# Recovery objectives

State them, because they drive everything above:

| | Target |
|---|---|
| RPO — acceptable data loss | 24 h with nightly dumps; minutes with WAL |
| RTO — acceptable downtime | Under 1 hour for a single-business install |

A single Postgres and a single app process cannot do better without
replication, and for a shop that is the right trade.

---

# Verification

**An unverified backup is not a backup.** Monthly, on a scratch database:

```bash
createdb stoqbook_verify
pg_restore --dbname=stoqbook_verify stoqbook-2026-08-01.dump
psql stoqbook_verify -c "select count(*) from sales_invoices;"
# then the integrity queries from 31-monitoring.md — all must return 0
dropdb stoqbook_verify
```

The integrity queries are the meaningful check. A dump that restores but has
drifted ledgers has preserved the wrong thing.

---

# Scheduled backups

Once the job queue exists (**28-job-queue.md**), add `backup.snapshot`:

* runs on a configurable schedule
* writes to the storage driver
* prunes beyond the retention window
* records the outcome so `/admin` can show "last successful backup"
* raises a **critical** notification on failure

That last one matters more than the backup itself. Silent backup failure is
the classic way to discover, months later, that there are no backups.

---

# Before you touch production data

Whoever is about to run a destructive command should have:

* [ ] Taken a fresh `pg_dump` **now**, not relied on last night's
* [ ] Verified it restores into a scratch database
* [ ] Written down the exact commands to run and to roll back
* [ ] Confirmed nobody is mid-transaction

`npm run db:reset` drops everything. It is a development command. It should
never be aliased, scripted, or run against a live database.

---

# Next Document

**34-deployment.md**
