# 25-module-sdk.md

# Module SDK

Version: **1.0.0**

How to add a module. **05-module-system.md** states the architecture; this is
the working procedure against the shipped code.

---

# The one rule

Everything a module contributes is declared in **one object** in
`src/lib/registry/modules.ts`. Navigation, RBAC, the dashboard, the settings
page, the reports index and the seeder all read that declaration.

If you find yourself editing the sidebar, the role editor or the settings page
to add a feature, stop — the registry is the place.

---

# The declaration

```ts
const deliveries: ModuleDef = {
  slug: "deliveries",
  name: "Deliveries",
  description: "Dispatch, routing and proof of delivery.",
  category: "retail",           // core | retail | crm | hr | finance | analytics
  icon: "Truck",                // must exist in components/layout/icon.tsx
  version: "1.0.0",
  isCore: false,                // core modules can never be unlicensed
  visibility: "business",       // business | admin | both
  dependencies: ["sales"],      // disabling sales disables this too
  sortOrder: 65,                // position in the sidebar

  features: [
    { slug: "deliveries.dispatch", name: "Dispatch", isDefault: true },
    { slug: "deliveries.routing", name: "Route Planning" },
  ],

  permissions: [
    { action: "view", name: "View deliveries" },
    { action: "dispatch", name: "Dispatch orders", feature: "deliveries.dispatch" },
  ],

  navigation: [
    {
      label: "Deliveries",
      href: "/deliveries",
      icon: "Truck",
      permission: "deliveries.view",
      children: [
        { label: "Dispatch board", href: "/deliveries", permission: "deliveries.view" },
        {
          label: "Routes",
          href: "/deliveries/routes",
          permission: "deliveries.dispatch",
          feature: "deliveries.routing",
        },
      ],
    },
  ],

  widgets: [
    {
      key: "deliveries.pending",
      name: "Pending Deliveries",
      permission: "deliveries.view",
      size: "small",     // small | medium | large | full
      priority: 55,      // lower sorts first
    },
  ],

  reports: [
    {
      key: "deliveries.performance",
      name: "Delivery Performance",
      permission: "reports.operational",
      group: "operational",
    },
  ],

  settings: [
    {
      key: "deliveries.default_window_hours",
      label: "Default delivery window (hours)",
      type: "number",           // text | textarea | number | boolean | select | money
      scope: "business",        // business | branch | warehouse | user
      default: 48,
      permission: "settings.update",
      group: "Deliveries",
    },
  ],

  events: ["DeliveryDispatched", "DeliveryCompleted", "DeliveryFailed"],
};
```

Then add it to the exported list:

```ts
export const ALL_MODULE_DEFS: ModuleDef[] = [ /* … */, deliveries];
```

Nothing else needs editing for it to appear.

---

# What that gets you, automatically

| Declared | Consumed by |
|---|---|
| `permissions` | Role editor, `requirePermission()`, seeder |
| `features` | Plan editor, licence overrides, `canAccess()` |
| `navigation` | Sidebar, filtered by licence → module → feature → permission |
| `widgets` | Dashboard, in priority order, per-user layout |
| `reports` | Reports index and the saved/scheduled report picker |
| `settings` | Settings page, grouped by `group` |
| `events` | Notification rule editor's event list |
| `dependencies` | Cascade when a module is unlicensed |

Permission keys are formed as `<slug>.<action>` — declare the action only.

---

# The nine steps

**1. Schema.** Add tables in the right file under `src/db/schema/`, following
**23-database-design.md**. Export from `index.ts`. Add to `BACKUP_TABLES`.

**2. Registry.** Declare the module as above.

**3. Service.** Business logic goes in `src/lib/services/<module>.ts`, marked
`import "server-only"`. Services take `ctx: BusinessContext` first and accept
an optional `client: DbClient = db` if they might run inside a transaction.

**4. Actions.** Server actions in `src/app/(app)/<module>/actions.ts`. Every
one is wrapped in `runAction` and starts with a guard.

**5. Pages.** Server components under `src/app/(app)/<module>/`.

**6. Client islands.** Only where interaction demands it, colocated with the
page, named for what they do (`dispatch-panel.tsx`).

**7. Icons.** Any new icon name must be added to
`src/components/layout/icon.tsx` — the map is the only resolution point, and
an unmapped name silently renders a blank placeholder.

**8. Seed.** `npm run db:reset` mirrors the registry into the database.

**9. Verify.** `npx tsc --noEmit`, `npm run build`, then exercise it in the
browser. Compiling is not evidence that it works.

---

# The guard

Every entry point begins with one:

```ts
const ctx = await requirePermission("deliveries.dispatch", {
  feature: "deliveries.routing",
});
```

`authorize()` runs the pipeline in order and throws at the first failure:

```text
authenticate → business status → licence → module → feature → permission
```

Variants:

| Function | Use |
|---|---|
| `requirePermission(key, opts)` | Almost always |
| `requireUser()` | Signed in, licence not checked |
| `requireLicensed()` | Signed in with a valid licence, no specific permission |
| `requireAdmin(key)` | Admin panel; licence deliberately not required |
| `can(opts)` | Non-throwing, for conditional UI |
| `hasPermission(ctx, key)` | Pure predicate on a loaded context |

Never read `ctx.user` without having gone through a guard first.

---

# Server actions

```ts
export async function dispatchDelivery(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("deliveries.dispatch");

    const id = uuid(form, "id");
    if (!id) return failure("Delivery not found.");

    await dispatch(ctx, { deliveryId: id });

    revalidate("/deliveries", "/dashboard");
    return success(undefined, "Delivery dispatched.");
  });
}
```

Rules:

* **Never throw across the RSC boundary.** `runAction` converts a thrown
  `AppError` into `{ ok: false, message }`. Expected problems use `failure()`.
* Use the form helpers — `str`, `num`, `bool`, `uuid`, `decimalStr`,
  `dateOrNull`, `optionalStr` — rather than reading `FormData` directly.
* `revalidate()` every path whose data changed.
* Return a message that says what happened, including the consequence
  ("Leave approved — the attendance register has been updated").

---

# Money

Never `Number()` a numeric column. Use `src/lib/money.ts`:

```ts
import { add, sub, mul, div, cmp, isPositive, negate } from "@/lib/money";

const total = add(subtotal, tax);          // exact, on scaled BigInt
if (cmp(paid, total) < 0) { /* underpaid */ }
```

Line and document arithmetic already exists in `src/lib/services/pricing.ts`
(`computeLine`, `computeDocument`, `effectivePrice`). Reuse it rather than
recomputing tax and discount rules.

---

# Dates

Business days are cut in the business's zone, never UTC. Use
`src/lib/timezone.ts`:

```ts
import { tzDateKey, startOfDayInTz, recentDayKeys } from "@/lib/timezone";
```

For a `timestamp without time zone` day column, store midnight of the business
day:

```ts
new Date(`${tzDateKey(when, ctx.business.timezone)}T00:00:00.000Z`)
```

If you group by a timezone-converted expression in SQL, inline the **validated**
zone with `sql.raw()`. A bound parameter renders as a different placeholder in
`SELECT` than in `GROUP BY`, and Postgres then rejects the query.

---

# Events and notifications

Declare event names in `events`. To actually raise one:

```ts
await emit({
  businessId: ctx.business.id,
  event: "DeliveryFailed",
  moduleSlug: "deliveries",
  priority: "high",
  title: "Delivery failed",
  body: `${order} could not be delivered.`,
  actionUrl: "/deliveries",
  fallbackPermission: "deliveries.dispatch",
  variables: { order, customer, reason },   // for template substitution
});
```

Always pass `variables` — without them a business's own template renders with
its `{{placeholders}}` visible. See **27-event-system.md**.

---

# Audit

Anything that changes data worth explaining later:

```ts
await auditEvent(ctx, {
  event: "DeliveryDispatched",
  moduleSlug: "deliveries",
  entityType: "delivery",
  entityId: id,
  summary: `${number} dispatched to ${customer}`,
  payload: { changes: diff(before, after) },
});
```

Use `diff()` rather than dumping rows. Never put a secret in a payload.

---

# UI conventions

Reuse `src/components/shared/`: `PageHeader`, `TableShell`/`Table`/`TH`/`TD`,
`StatGrid`/`StatTile`, `FilterBar`, `CrudPanel`, `EmptyState`/`Notice`,
`StatusBadge`, `Field`/`FieldRow`/`SubmitButton`.

Hard constraints:

* **Only `rounded-xs` and `rounded-full`.** No other radius, anywhere.
* **No gradients.**
* Colours come from the token set, never hard-coded hex.
* Comments explain **why**, not what.

`CrudPanel` handles the whole list-plus-form pattern but cannot express
multi-select; write a purpose-built form when a field is a set.

---

# Search

To make a module searchable, add a source to `SOURCES` in
`src/lib/services/search.ts`. Each declares its module, permission and
optional feature, and is only queried when the caller passes all three — so
search can never leak a capability the user lacks. See
**29-search-system.md**.

---

# API

Collection endpoints use the generic builder:

```ts
export async function GET(request: NextRequest) {
  return handleList(request, {
    table: deliveries,
    permission: "deliveries.view",
    columns: { id: deliveries.id, number: deliveries.number },
    searchColumns: [deliveries.number],
    sortable: ["number", "created_at"],
    defaultSort: { field: "created_at", direction: "desc" },
    tenantColumn: deliveries.tenant_id,
  });
}
```

That gives pagination, sorting, search, field selection and the standard
envelope for free. See **38-public-api.md**.

---

# Verifying the module is wired

An audit script is the fastest check. Diff the registry against the code:
permissions never referenced outside the registry, nav hrefs with no
`page.tsx`, widget keys the dashboard never renders, report keys the report
service does not implement. Every one of those is a declaration with nothing
behind it — a live 404 or a blank tile.

---

# Anti-patterns

| Don't | Do |
|---|---|
| Hardcode a sidebar entry | Declare `navigation` |
| Check `user.role === "manager"` | Check a permission |
| `Number(row.amount)` for arithmetic | `add`/`sub`/`mul` from `money.ts` |
| Throw from a server action | `failure()` inside `runAction` |
| Cross-import another module's service | Emit an event |
| Add a settings field to the settings page | Declare `settings` in the module |
| Reference a store as "branch" in copy | Say "store" |

---

# Next Document

**26-plugin-system.md** — how the registry becomes a loading point for
modules that ship separately from the core.
