import "server-only";

import { canAccess, type RequestContext } from "@/lib/authz/context";
import {
  ALL_REPORTS,
  ALL_WIDGETS,
  APP_NAVIGATION,
  MODULE_BY_SLUG,
  type NavDef,
  type RegisteredReport,
  type RegisteredWidget,
} from "@/lib/registry";

/**
 * Navigation, widget and report visibility.
 *
 * Nothing is hardcoded: the tree is derived from the registry and filtered by
 * licence → module → feature → permission (04-rbac.md § Dynamic Navigation).
 * A parent with no visible children is dropped entirely.
 */

export interface NavNode {
  label: string;
  href: string;
  icon?: string;
  badgeKey?: string;
  children?: NavNode[];
}

function visible(
  ctx: RequestContext,
  item: NavDef,
  moduleSlug?: string,
): boolean {
  return canAccess(ctx, {
    module: moduleSlug,
    feature: item.feature,
    permission: item.permission,
  });
}

export function buildNavigation(ctx: RequestContext): NavNode[] {
  const nodes: NavNode[] = [];

  for (const item of APP_NAVIGATION) {
    const mod = MODULE_BY_SLUG[item.moduleSlug];
    // A disabled module contributes nothing, including its children.
    if (!mod) continue;
    if (!canAccess(ctx, { module: item.moduleSlug })) continue;

    const children = (item.children ?? [])
      .filter((child) => visible(ctx, child, item.moduleSlug))
      .map((child) => ({
        label: child.label,
        href: child.href,
        icon: child.icon,
        badgeKey: child.badgeKey,
      }));

    const parentVisible = visible(ctx, item, item.moduleSlug);

    // Keep a parent whose own permission is missing only if a child survives —
    // otherwise the entry would be a dead link.
    if (!parentVisible && children.length === 0) continue;

    nodes.push({
      label: item.label,
      // Fall back to the first accessible child when the parent page is barred.
      href: parentVisible ? item.href : children[0].href,
      icon: item.icon,
      badgeKey: item.badgeKey,
      children: children.length > 1 ? children : undefined,
    });
  }

  return nodes;
}


/** Widgets this user may see, in registry priority order. */
export function visibleWidgets(ctx: RequestContext): RegisteredWidget[] {
  return ALL_WIDGETS.filter((widget) =>
    canAccess(ctx, {
      module: widget.moduleSlug,
      feature: widget.feature,
      permission: widget.permission,
    }),
  );
}

/** Reports this user may run, grouped for the reports index. */
export function visibleReports(ctx: RequestContext): RegisteredReport[] {
  return ALL_REPORTS.filter((report) =>
    canAccess(ctx, {
      module: report.moduleSlug,
      feature: report.feature,
      permission: report.permission,
    }),
  );
}

export interface QuickAction {
  label: string;
  href: string;
  icon: string;
  permission: string;
  module: string;
  feature?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Sale", href: "/pos", icon: "ScanLine", permission: "pos.use", module: "pos", feature: "pos.billing" },
  { label: "Add Product", href: "/products/new", icon: "Package", permission: "products.create", module: "products" },
  { label: "Receive Purchase", href: "/purchases", icon: "ShoppingBag", permission: "purchases.receive", module: "purchases" },
  { label: "Adjust Stock", href: "/inventory/adjustments/new", icon: "Boxes", permission: "inventory.adjust", module: "inventory" },
  { label: "New Customer", href: "/customers/new", icon: "Users", permission: "customers.create", module: "customers" },
  { label: "New Supplier", href: "/suppliers/new", icon: "Truck", permission: "suppliers.create", module: "suppliers" },
  { label: "Add Employee", href: "/employees/new", icon: "IdCard", permission: "employees.create", module: "employees" },
  { label: "Record Expense", href: "/expenses/new", icon: "Wallet", permission: "expenses.create", module: "expenses" },
];

export function visibleQuickActions(ctx: RequestContext): QuickAction[] {
  return QUICK_ACTIONS.filter((action) =>
    canAccess(ctx, {
      module: action.module,
      feature: action.feature,
      permission: action.permission,
    }),
  );
}

/** Marks the active trail so the sidebar can highlight the current section. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
