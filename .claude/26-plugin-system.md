# 26-plugin-system.md

# Plugin System

Version: **1.0.0**

Status: **Designed, not built.** The registry already provides the seam a
plugin system needs; this document specifies what must be added and — more
importantly — the constraints any implementation has to respect.

---

# Why this is nearly free

A module today is a plain data object plus some files. It does not register
itself by calling into the core; the core reads it. That inversion is what
makes plugins tractable:

```text
Today      ALL_MODULE_DEFS = [dashboard, pos, products, …]   // a static array
Plugin     ALL_MODULE_DEFS = core.concat(discovered())        // same shape
```

Everything downstream — navigation, RBAC, widgets, reports, settings, the
seeder — already consumes the array without knowing where entries came from.

---

# What a plugin is

A directory with a manifest, a module declaration, optional services, optional
routes, and optional migrations.

```text
plugins/loyalty-plus/
├── plugin.json          manifest
├── module.ts            exports a ModuleDef
├── services/            server-only business logic
├── schema.ts            its own tables, prefixed
├── migrations/          versioned SQL
└── routes/              pages, mounted under its slug
```

```json
{
  "id": "loyalty-plus",
  "name": "Loyalty Plus",
  "version": "1.2.0",
  "author": "Acme Ltd",
  "stoqbookVersion": ">=1.0.0 <2.0.0",
  "provides": { "module": "./module.ts", "schema": "./schema.ts" },
  "requires": { "modules": ["customers", "sales"] },
  "permissions": ["read:customers", "write:loyalty"],
  "signature": "…"
}
```

---

# Lifecycle

```text
Discovered ─▶ Validated ─▶ Installed ─▶ Registered ─▶ Enabled ─▶ Licensed ─▶ Active
                  │                                        │
                  └─▶ Rejected                             └─▶ Disabled ─▶ Uninstalled
```

**Validated** is the gate that matters. Before a plugin is installed:

* Manifest parses and the version range matches the running core.
* Its `ModuleDef` passes the same shape validation core modules do.
* Its slug does not collide with an existing module.
* Its permission keys are all prefixed with its own slug.
* Its table names are all prefixed with its own id.
* Every module in `requires.modules` exists.

A plugin failing any of these is rejected with the specific reason, not
silently skipped.

---

# Non-negotiable constraints

**1. A plugin cannot widen authorization.** It declares permissions; it does
not grant them. Its code must go through `requirePermission()` like any other.
The Owner-holds-everything rule means a new plugin's permissions become
available to the Owner automatically — that is intended, and is the only
automatic grant.

**2. A plugin cannot reach another module's tables.** It reads other modules
through their exported services, or by subscribing to events. Direct
cross-module SQL is what makes a plugin ecosystem unmaintainable.

**3. A plugin cannot bypass the ledger rules.** If it introduces a running
balance it adopts the balance-plus-ledger pattern from
**23-database-design.md**. A plugin that writes `inventory_levels` without a
matching movement is a defect, and the drift query will catch it.

**4. A plugin's tables are namespaced.** `loyalty_plus_tiers`, not `tiers`.
This keeps core migrations and plugin migrations from ever colliding.

**5. A plugin runs in the same process.** There is no sandbox. Installation is
therefore an administrative act equivalent to deploying code, gated on
`admin.plugin_manage`, and the UI must say so plainly rather than implying
plugins are safe to install casually.

---

# Registration

`src/lib/registry/index.ts` becomes:

```ts
import { CORE_MODULE_DEFS } from "./modules";
import { loadPlugins } from "./plugins";

const plugins = await loadPlugins();          // validated at load
export const ALL_MODULES = [...CORE_MODULE_DEFS, ...plugins.map((p) => p.module)];
```

Loading happens once at boot. A plugin that throws while loading is logged and
skipped — one broken plugin must not take the installation down.

Because the registry is read at module-load time and the seeder mirrors it,
installing a plugin requires a restart and a `db:seed` to register its
permissions. That is acceptable for a self-hosted product and should be stated
in the UI rather than engineered around.

---

# Migrations

Plugins own their schema and must not touch core tables. Each ships versioned
SQL, applied in order and recorded:

```text
plugin_migrations(plugin_id, version, applied_at, checksum)
```

A checksum mismatch on an already-applied migration is an error, not a
re-apply. Uninstalling offers to drop the plugin's tables; the default is to
keep them, because data loss should never be the default.

---

# Extension points

| Point | Mechanism |
|---|---|
| Navigation, widgets, reports, settings | `ModuleDef` — already works |
| Business events | Subscribe via the event system (**27**) |
| Background work | Enqueue jobs (**28**) |
| Search | Contribute a source (**29**) |
| API | Routes under `/api/plugins/<id>/…` |
| Report runners | Register into the `RUNNERS` map |
| Dashboard tiles | Declare a widget; render via a registered component |

The last one needs the only genuinely new machinery: a component registry
mapping widget keys to React components, so the dashboard can render a widget
it does not statically import.

---

# Marketplace

Out of scope until the above is solid. When it comes:

* Plugins are signed; the installer verifies the signature.
* The manifest declares the capabilities it needs, shown before install.
* Version compatibility is enforced against the running core.
* Installation stays an explicit administrative action with an audit entry.

---

# What to build first

1. `loadPlugins()` with strict manifest validation and slug/table namespacing.
2. The widget component registry.
3. Plugin migrations with checksums.
4. The admin screen: list, install from directory, enable, disable, uninstall.
5. Signing.

Steps 1–3 are the load-bearing ones. Everything else is UI over them.

---

# Next Document

**27-event-system.md** — how modules talk without importing each other.
