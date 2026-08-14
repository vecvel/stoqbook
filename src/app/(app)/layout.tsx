import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import type { NavNodeView } from "@/components/layout/sidebar-nav";
import { getContext } from "@/lib/authz/context";
import { buildNavigation } from "@/lib/navigation";
import { unreadCount } from "@/lib/services/notifications";

/**
 * The application shell.
 *
 * The layout resolves the request context once; pages reuse it through the
 * request-scoped cache rather than re-querying.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getContext();

  if (!ctx) redirect("/login");

  if (ctx.business.status !== "active" && !ctx.isSuperAdmin) {
    redirect("/license-required");
  }

  const navigation = buildNavigation(ctx);
  const unread = await unreadCount(ctx.business.id, ctx.user.id);

  const nav: NavNodeView[] = navigation.map((node) => ({
    label: node.label,
    href: node.href,
    icon: node.icon,
    badge:
      node.badgeKey === "notifications.unread" && unread > 0 ? unread : undefined,
    children: node.children?.map((child) => ({
      label: child.label,
      href: child.href,
    })),
  }));

  const roleLabel =
    ctx.roles.length === 0
      ? "No role assigned"
      : ctx.roles.map((r) => r.name).join(", ");

  return (
    <AppShell
      businessName={ctx.business.name}
      navigation={nav}
      user={{
        id: ctx.user.id,
        name: ctx.user.full_name,
        email: ctx.user.email,
        roleLabel,
      }}
      stores={ctx.stores.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
      }))}
      activeStoreId={ctx.activeStore?.id ?? null}
      license={
        ctx.entitlements.plan
          ? {
              planName: ctx.entitlements.plan.name,
              status: ctx.entitlements.license?.status ?? "unknown",
              daysRemaining: ctx.entitlements.daysRemaining,
              billingMode: ctx.entitlements.license?.billing_mode ?? "manual",
            }
          : null
      }
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
