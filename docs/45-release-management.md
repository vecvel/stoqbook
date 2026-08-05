# 45-release-management.md

# Release Management

Version: **1.0.0**

Status: **Not formalised.** The product is at 1.0.0 with no release process.

---

# What makes releases here unusual

StoqBook is **self-hosted, one business per installation, perpetual licence**.
That inverts several SaaS assumptions:

* **You do not control when a customer upgrades.** Some will run 1.0 for years.
* **You cannot migrate everyone at once.** Each installation upgrades alone.
* **A bad release cannot be rolled back centrally.** The customer has to do it,
  at 9am, with a shop to open.
* **A perpetual licence implies support obligations** for versions long after
  they ship.

Every decision below follows from those four facts.

---

# Versioning

Semantic versioning, with the meanings made concrete for this product:

| Change | Bump | Examples |
|---|---|---|
| Breaking | **major** | API v1 field removed; a permission renamed; a required migration that cannot be reversed |
| Feature | **minor** | New module; new report; new settings |
| Fix | **patch** | Bug fix; copy correction; performance |

The registry makes one class of change sharper than usual: **renaming a
permission key is breaking**, because a business may have granted it to a
custom role. Adding a permission is not — the Owner picks it up automatically
and other roles simply do not have it yet.

Same for module slugs, report keys and widget keys: they are persisted in
`role_permissions`, `saved_reports` and `dashboard_layouts` respectively.
Renaming any of them orphans customer data. Prefer adding an alias over
renaming.

---

# Release checklist

Before tagging:

```text
[ ] npx tsc --noEmit                 clean
[ ] npm run build                    clean
[ ] npm run db:reset                 seed works from empty
[ ] tests pass (44-testing-strategy.md)
[ ] drift queries return 0 after seeding
[ ] upgrade tested from the previous release's database, not just from empty
[ ] migrations reviewed for destructiveness
[ ] CHANGELOG written for the reader, not from git log
[ ] version bumped in package.json
```

The **upgrade-from-previous** step is the one that gets skipped and the one that
breaks installations. Testing `db:reset` proves a fresh install works; it says
nothing about a customer's populated database.

---

# Migration discipline

Development uses `drizzle-kit push`. **Releases must ship versioned
migrations** (`drizzle-kit generate`), because `push` diffs against whatever is
there and will propose destructive changes without being asked.

Rules for a migration that will run on someone else's data:

* **Additive by default.** New nullable column, or a default.
* **Never rename in one step.** Add the new column, backfill, switch reads,
  drop later — across two releases if the data matters.
* **A unique constraint needs the data resolved first.** Adding
  `settings_unique_key` required deduplicating existing rows; the migration must
  do that itself, not fail and leave the installation half-upgraded.
* **Every migration is reversible, or documents why not.**
* **Long-running migrations are announced.** A shop needs to know it cannot open
  for ten minutes.

Registry changes need a reseed of modules, features and permissions as part of
the upgrade, or new permissions never become assignable.

---

# Changelog

Written for a business owner, not a developer:

```markdown
## 1.1.0 — 2026-09-15

### Added
- Gift cards: issue, top up and redeem at the till.
- Shift patterns, used to judge lateness on the attendance register.

### Fixed
- Store list showed 0 warehouses and 0 staff for stores that had them.
- Settings could be saved twice, making which value applied unpredictable.

### Upgrade notes
- Run migrations before starting the app.
- New permissions (`sales.gift_cards`) are available to the Owner immediately;
  grant them to other roles under Employees → Roles.
```

"Upgrade notes" is not optional when a release adds permissions, changes a
default, or needs a reseed. That section is the difference between a smooth
upgrade and a support ticket.

---

# Support policy

State it, because a perpetual licence invites the question:

| Version | Support |
|---|---|
| Current minor | Fixes and security |
| Previous minor | Security only |
| Previous major | Security only, for a stated window |
| Older | None |

Security fixes are backported to whatever the policy says, and shipped as patch
releases with no other changes — a security patch that also refactors is a
patch nobody will apply.

---

# Release cadence

* **Patch** — as needed; security fixes immediately.
* **Minor** — every 6–8 weeks, when something is genuinely ready.
* **Major** — rarely, and only for a breaking change worth the disruption.

Do not ship on a calendar for its own sake. A self-hosted customer experiences
every release as work, so each one must be worth the interruption.

---

# Feature flags

The `feature_flags` table exists and is business-wide on/off. Use it to ship a
large feature dark, enable it for one installation, then remove the flag once
proven.

The discipline that keeps flags useful: **every flag has an owner and a removal
date.** Flags that outlive their purpose become permanent untested branches.

Note flags can only remove access, never grant beyond the licence — they are
evaluated after the plan and overrides.

---

# Rolling back

The customer's rollback path, which must be documented in the release notes,
not improvised during an incident:

```bash
# 1. stop the app
# 2. restore the pre-upgrade dump
pg_restore --clean --dbname="$DATABASE_URL" pre-upgrade.dump
# 3. deploy the previous version
# 4. start
```

This only works if a dump was taken. The upgrade instructions must say so as
the **first** step, in the imperative, before anything else.

If a migration is irreversible, the release notes must say that plainly:
"rolling back this release requires restoring a backup".

---

# Build order

1. `CHANGELOG.md` and the checklist above, written down.
2. Switch to generated migrations for anything shipped.
3. An upgrade test: restore a previous-version dump, migrate, verify drift is 0.
4. Support policy published.
5. CI producing a tagged artifact.

Step 3 is the one that prevents the worst class of release failure, and it is
mostly a script.

---

# Next Document

**46-migration-guide.md**
