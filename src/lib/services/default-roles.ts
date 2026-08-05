/**
 * Default roles provisioned for a new installation (04-rbac.md).
 * They are fully editable afterwards — this is a starting point, not a
 * constraint.
 *
 * Permission keys are validated against the registry at seed time, so a typo
 * fails loudly rather than silently granting nothing.
 *
 * **On store scope.** `stores.view_all` is what separates a store manager from a
 * regional one: without it a user only ever sees the store they are working in.
 * "Manager" deliberately does *not* hold it — a role called Manager that
 * silently exposes every store's takings is not what anyone assigning it
 * expects. Cross-store oversight is the separate Operations Manager role, so
 * granting it is a visible decision.
 */
import { ALL_PERMISSION_KEYS } from "@/lib/registry";

export interface DefaultRole {
  slug: string;
  name: string;
  description: string;
  isOwner?: boolean;
  /** "*" grants everything; the Owner role uses this. */
  permissions: string[] | "*";
}

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    slug: "owner",
    name: "Owner",
    description: "Full access to every module, setting and report.",
    isOwner: true,
    permissions: "*",
  },
  {
    slug: "manager",
    name: "Store Manager",
    description:
      "Runs one store day to day: catalogue, stock, purchasing, sales and its staff. Sees only the store they are working in.",
    permissions: [
      "dashboard.view",
      "dashboard.customize",

      /* Administers their own store without business-wide control: they can
         create roles that apply inside it and move staff around within it. */
      "stores.switch",
      "stores.manage_roles",
      "stores.manage_staff",

      "products.view",
      "products.create",
      "products.update",
      "products.archive",
      "products.view_cost",
      "products.import",
      "products.export",
      "products.print_barcode",
      "products.manage_taxonomy",

      "inventory.view",
      "inventory.opening_stock",
      "inventory.adjust",
      "inventory.approve_adjustment",
      "inventory.transfer",
      "inventory.approve_transfer",
      "inventory.receive_transfer",
      "inventory.count",
      "inventory.reserve",
      "inventory.audit",
      "inventory.export",

      "purchases.view",
      "purchases.create",
      "purchases.update",
      "purchases.approve",
      "purchases.receive",
      "purchases.cancel",
      "purchases.return",
      "purchases.payment",
      "purchases.export",

      "sales.view",
      "sales.create",
      "sales.update",
      "sales.cancel",
      "sales.return",
      "sales.refund",
      "sales.discount",
      "sales.discount_override",
      "sales.credit",
      "sales.print",
      "sales.export",

      "pos.use",
      "pos.open_session",
      "pos.close_session",
      "pos.void",

      "customers.view",
      "customers.create",
      "customers.update",
      "customers.credit",
      "customers.loyalty",
      "customers.export",

      "suppliers.view",
      "suppliers.create",
      "suppliers.update",
      "suppliers.payment",
      "suppliers.export",

      "employees.view",
      "employees.attendance",
      "employees.leave",

      "expenses.view",
      "expenses.create",
      "expenses.update",

      "reports.view",
      "reports.sales",
      "reports.purchases",
      "reports.inventory",
      "reports.customers",
      "reports.suppliers",
      "reports.employees",
      "reports.export",

      "notifications.view",
      "notifications.send",

      "settings.view",
    ],
  },
  {
    slug: "operations_manager",
    name: "Operations Manager",
    description:
      "Oversees every store: the same operational powers as a Store Manager, plus visibility across all of them.",
    permissions: [
      "dashboard.view",
      "dashboard.customize",
      "dashboard.view_financial",

      /* The one permission that distinguishes this role from Store Manager.
         Everything else below is identical, which is the point: the difference
         between the two roles is reach, not capability. */
      "stores.view_all",
      "stores.switch",
      "stores.manage_roles",
      "stores.manage_staff",

      "products.view",
      "products.create",
      "products.update",
      "products.archive",
      "products.view_cost",
      "products.import",
      "products.export",
      "products.print_barcode",
      "products.manage_taxonomy",

      "inventory.view",
      "inventory.opening_stock",
      "inventory.adjust",
      "inventory.approve_adjustment",
      "inventory.transfer",
      "inventory.approve_transfer",
      "inventory.receive_transfer",
      "inventory.count",
      "inventory.reserve",
      "inventory.audit",
      "inventory.export",

      "purchases.view",
      "purchases.create",
      "purchases.update",
      "purchases.approve",
      "purchases.receive",
      "purchases.cancel",
      "purchases.return",
      "purchases.payment",
      "purchases.export",

      "sales.view",
      "sales.create",
      "sales.update",
      "sales.cancel",
      "sales.return",
      "sales.refund",
      "sales.discount",
      "sales.discount_override",
      "sales.credit",
      "sales.print",
      "sales.export",

      "pos.use",
      "pos.open_session",
      "pos.close_session",
      "pos.void",

      "customers.view",
      "customers.create",
      "customers.update",
      "customers.credit",
      "customers.loyalty",
      "customers.export",

      "suppliers.view",
      "suppliers.create",
      "suppliers.update",
      "suppliers.payment",
      "suppliers.export",

      "employees.view",
      "employees.attendance",
      "employees.leave",

      "expenses.view",
      "expenses.create",
      "expenses.update",
      "expenses.approve",

      "reports.view",
      "reports.sales",
      "reports.purchases",
      "reports.inventory",
      "reports.customers",
      "reports.suppliers",
      "reports.employees",
      "reports.financial",
      "reports.export",

      "notifications.view",
      "notifications.send",

      "settings.view",
    ],
  },
  {
    slug: "cashier",
    name: "Cashier",
    description: "Bills customers at the counter. Sees only their own store.",
    permissions: [
      "dashboard.view",

      "products.view",

      "sales.view",
      "sales.create",
      "sales.print",

      "pos.use",
      "pos.open_session",
      "pos.close_session",

      "customers.view",
      "customers.create",

      "notifications.view",
    ],
  },
  {
    slug: "inventory_manager",
    name: "Inventory Manager",
    description: "Owns stock accuracy across warehouses.",
    permissions: [
      "dashboard.view",

      "products.view",
      "products.create",
      "products.update",
      "products.view_cost",
      "products.import",
      "products.export",
      "products.print_barcode",
      "products.manage_taxonomy",

      "inventory.view",
      "inventory.opening_stock",
      "inventory.adjust",
      "inventory.transfer",
      "inventory.receive_transfer",
      "inventory.count",
      "inventory.reserve",
      "inventory.audit",
      "inventory.import",
      "inventory.export",

      "purchases.view",
      "purchases.receive",

      "suppliers.view",

      "reports.view",
      "reports.inventory",
      "reports.purchases",
      "reports.export",

      "notifications.view",
    ],
  },
  {
    slug: "accountant",
    name: "Accountant",
    description:
      "Read-only on operations, full access to financial reporting across every store.",
    permissions: [
      "dashboard.view",
      "dashboard.view_financial",

      /* Kept for the Accountant: books that stopped at one store would be no
         use. This is read-only access — the role grants no operational writes. */
      "stores.view_all",

      "products.view",
      "products.view_cost",

      "inventory.view",

      "sales.view",
      "sales.export",

      "purchases.view",
      "purchases.payment",
      "purchases.export",

      "customers.view",
      "customers.credit",

      "suppliers.view",
      "suppliers.payment",

      "expenses.view",
      "expenses.create",
      "expenses.update",
      "expenses.export",

      "reports.view",
      "reports.sales",
      "reports.purchases",
      "reports.inventory",
      "reports.customers",
      "reports.suppliers",
      "reports.financial",
      "reports.audit",
      "reports.export",

      "notifications.view",
    ],
  },
];

/**
 * Resolves a role's permission list against the registry, dropping any key that
 * no longer exists so a renamed permission cannot break provisioning.
 */
export function resolveRolePermissions(role: DefaultRole): string[] {
  if (role.permissions === "*") return [...ALL_PERMISSION_KEYS];
  const valid = new Set(ALL_PERMISSION_KEYS);
  return role.permissions.filter((p) => valid.has(p));
}

/** Keys declared on a default role that the registry does not define. */
export function unknownPermissionKeys(): { role: string; key: string }[] {
  const valid = new Set(ALL_PERMISSION_KEYS);
  const problems: { role: string; key: string }[] = [];
  for (const role of DEFAULT_ROLES) {
    if (role.permissions === "*") continue;
    for (const key of role.permissions) {
      if (!valid.has(key)) problems.push({ role: role.slug, key });
    }
  }
  return problems;
}
