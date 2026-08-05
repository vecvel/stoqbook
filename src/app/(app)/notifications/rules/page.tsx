import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { notificationRules, notificationTemplates, roles } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { ALL_EVENTS } from "@/lib/registry";
import { readString } from "@/lib/services/settings";
import { loadSettings } from "@/lib/services/settings";

import {
  BroadcastForm,
  RulesEditor,
  TemplatesEditor,
  type RuleView,
  type TemplateView,
} from "./rules-panel";

export const metadata: Metadata = { title: "Notification rules" };

export default async function NotificationRulesPage() {
  const ctx = await requirePermission("notifications.manage_rules", {
    feature: "notifications.rules",
  });

  const [ruleRows, templateRows, roleRows, settings] = await Promise.all([
    db
      .select()
      .from(notificationRules)
      .where(eq(notificationRules.tenant_id, ctx.business.id))
      .orderBy(asc(notificationRules.event)),

    db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.tenant_id, ctx.business.id))
      .orderBy(asc(notificationTemplates.event)),

    db
      .select({ slug: roles.slug, name: roles.name })
      .from(roles)
      .where(and(eq(roles.tenant_id, ctx.business.id), eq(roles.archived, false)))
      .orderBy(asc(roles.name)),

    loadSettings({ businessId: ctx.business.id }),
  ]);

  const rules: RuleView[] = ruleRows.map((r) => ({
    id: r.id,
    event: r.event,
    recipientRoles: r.recipient_roles,
    channels: r.channels,
    priority: r.priority,
    isActive: r.is_active,
  }));

  const templates: TemplateView[] = templateRows.map((t) => ({
    id: t.id,
    event: t.event,
    channel: t.channel,
    locale: t.locale,
    subject: t.subject ?? "",
    title: t.title,
    body: t.body,
    version: t.version,
    isActive: t.is_active,
  }));

  // Every event any module publishes, so a rule can be written against a real
  // event name rather than a guess.
  const events = [...new Set(ALL_EVENTS.map((e) => e.event))].sort();

  const quietFrom = readString(settings, "notifications.quiet_from", "");
  const quietTo = readString(settings, "notifications.quiet_to", "");
  const canManageTemplates = hasPermission(ctx, "notifications.manage_templates");
  const canBroadcast = hasPermission(ctx, "notifications.broadcast");

  return (
    <div className="page">
      <PageHeader
        title="Rules & templates"
        description="How business events become notifications, and what they say."
        breadcrumbs={[
          { label: "Notifications", href: "/notifications" },
          { label: "Rules & templates" },
        ]}
      />

      {quietFrom && quietTo ? (
        <Notice tone="info" title={`Quiet hours ${quietFrom} – ${quietTo}`}>
          Notifications raised inside this window are queued rather than
          delivered, except critical ones. Users can also set their own window.
        </Notice>
      ) : (
        <Notice tone="info" title="Quiet hours are off">
          Set <code>notifications.quiet_from</code> and{" "}
          <code>notifications.quiet_to</code> under Settings to hold non-critical
          notifications overnight.
        </Notice>
      )}

      <RulesEditor rules={rules} roles={roleRows} events={events} />

      <TemplatesEditor
        templates={templates}
        events={events}
        canManage={canManageTemplates}
      />

      {canBroadcast ? <BroadcastForm /> : null}
    </div>
  );
}
