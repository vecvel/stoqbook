"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationRules, notificationTemplates } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { NotFoundError } from "@/lib/authz/errors";
import { auditEvent } from "@/lib/services/audit";
import {
  broadcast,
  type NotificationChannel,
  type NotificationPriority,
} from "@/lib/services/notifications";
import {
  bool,
  failure,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

const CHANNELS: NotificationChannel[] = [
  "in_app",
  "email",
  "sms",
  "whatsapp",
  "push",
  "webhook",
];

function readChannels(form: FormData): NotificationChannel[] {
  const picked = form.getAll("channels").map(String);
  const valid = picked.filter((c): c is NotificationChannel =>
    CHANNELS.includes(c as NotificationChannel),
  );
  // A rule with no channel would silently deliver nothing.
  return valid.length > 0 ? valid : ["in_app"];
}

/* -------------------------------------------------------------------------- */
/* Rules                                                                      */
/* -------------------------------------------------------------------------- */

export async function saveNotificationRule(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.manage_rules", {
      feature: "notifications.rules",
    });

    const id = uuid(form, "id");
    const event = str(form, "event").trim();
    if (!event) return failure("An event name is required.");

    const roleSlugs = form
      .getAll("recipient_roles")
      .map(String)
      .filter(Boolean);

    const values = {
      event,
      recipient_roles: roleSlugs,
      recipient_user_ids: [] as string[],
      channels: readChannels(form),
      priority: (str(form, "priority") || "medium") as NotificationPriority,
      conditions: {},
      is_active: bool(form, "is_active"),
    };

    if (id) {
      await db
        .update(notificationRules)
        .set({ ...values, updated_at: new Date() })
        .where(
          and(
            eq(notificationRules.id, id),
            eq(notificationRules.tenant_id, ctx.business.id),
          ),
        );
    } else {
      await db
        .insert(notificationRules)
        .values({ ...values, tenant_id: ctx.business.id });
    }

    await auditEvent(ctx, {
      event: "NotificationRuleUpdated",
      moduleSlug: "notifications",
      entityType: "notification_rule",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} rule for ${event}`,
      payload: { channels: values.channels, roles: roleSlugs },
    });

    revalidate("/notifications/rules");
    return success(undefined, "Rule saved.");
  });
}

export async function deleteNotificationRule(
  ruleId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.manage_rules", {
      feature: "notifications.rules",
    });

    await db
      .delete(notificationRules)
      .where(
        and(
          eq(notificationRules.id, ruleId),
          eq(notificationRules.tenant_id, ctx.business.id),
        ),
      );

    await auditEvent(ctx, {
      event: "NotificationRuleUpdated",
      moduleSlug: "notifications",
      entityType: "notification_rule",
      entityId: ruleId,
      summary: "Rule deleted",
    });

    revalidate("/notifications/rules");
    return success(undefined, "Rule deleted. The event falls back to defaults.");
  });
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveNotificationTemplate(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.manage_templates");

    const id = uuid(form, "id");
    const event = str(form, "event").trim();
    const title = str(form, "title");
    const body = str(form, "body");

    if (!event) return failure("An event name is required.");
    if (!title) return failure("A title is required.");
    if (!body) return failure("A body is required.");

    const channel = (str(form, "channel") || "in_app") as NotificationChannel;

    if (id) {
      const [existing] = await db
        .select({ version: notificationTemplates.version })
        .from(notificationTemplates)
        .where(
          and(
            eq(notificationTemplates.id, id),
            eq(notificationTemplates.tenant_id, ctx.business.id),
          ),
        )
        .limit(1);
      if (!existing) throw NotFoundError("Template not found.");

      await db
        .update(notificationTemplates)
        .set({
          event,
          channel,
          locale: str(form, "locale") || "en",
          subject: optionalStr(form, "subject"),
          title,
          body,
          is_active: bool(form, "is_active"),
          // Templates are versioned so an audit entry can be tied to the text
          // that was actually in force (16-notifications.md § Business Rules).
          version: existing.version + 1,
          updated_at: new Date(),
        })
        .where(eq(notificationTemplates.id, id));
    } else {
      await db.insert(notificationTemplates).values({
        tenant_id: ctx.business.id,
        event,
        channel,
        locale: str(form, "locale") || "en",
        subject: optionalStr(form, "subject"),
        title,
        body,
        is_active: bool(form, "is_active"),
      });
    }

    await auditEvent(ctx, {
      event: "NotificationTemplateUpdated",
      moduleSlug: "notifications",
      entityType: "notification_template",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Created"} ${channel} template for ${event}`,
    });

    revalidate("/notifications/rules");
    return success(undefined, "Template saved.");
  });
}

export async function deleteNotificationTemplate(
  templateId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.manage_templates");

    await db
      .delete(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.id, templateId),
          eq(notificationTemplates.tenant_id, ctx.business.id),
        ),
      );

    await auditEvent(ctx, {
      event: "NotificationTemplateUpdated",
      moduleSlug: "notifications",
      entityType: "notification_template",
      entityId: templateId,
      summary: "Template deleted",
    });

    revalidate("/notifications/rules");
    return success(
      undefined,
      "Template deleted. Notifications fall back to their built-in wording.",
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Broadcast                                                                  */
/* -------------------------------------------------------------------------- */

export async function sendBroadcast(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.broadcast", {
      feature: "notifications.broadcast",
    });

    const title = str(form, "title");
    const body = str(form, "body");
    if (!title) return failure("A title is required.");
    if (!body) return failure("A message is required.");

    const count = await broadcast({
      businessId: ctx.business.id,
      event: "Broadcast",
      moduleSlug: "notifications",
      title,
      body,
      priority: (str(form, "priority") || "medium") as NotificationPriority,
      actionUrl: optionalStr(form, "action_url") ?? undefined,
    });

    await auditEvent(ctx, {
      event: "BroadcastSent",
      moduleSlug: "notifications",
      entityType: "notification",
      summary: `Broadcast "${title}" sent to ${count} recipient(s)`,
    });

    revalidate("/notifications", "/notifications/delivery");
    return success(
      undefined,
      count === 0
        ? "No active recipients, so nothing was sent."
        : `Broadcast sent to ${count} recipient(s).`,
    );
  });
}
