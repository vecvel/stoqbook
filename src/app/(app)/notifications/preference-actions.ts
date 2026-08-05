"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  bool,
  revalidate,
  runAction,
  str,
  success,
  type ActionResult,
} from "@/lib/actions";

const VALID_CHANNELS = ["in_app", "email", "sms", "whatsapp", "push", "webhook"];

/**
 * Saves the signed-in user's own notification preferences.
 *
 * Stored against an empty `event`, which the notification service treats as the
 * user's global default; an event-specific row would override it.
 */
export async function saveMyNotificationPreferences(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    // Anyone who can see notifications may configure their own delivery.
    const ctx = await requirePermission("notifications.view");

    const channels = form
      .getAll("channels")
      .map(String)
      .filter((c) => VALID_CHANNELS.includes(c));

    const values = {
      channels,
      quiet_from: str(form, "quiet_from") || null,
      quiet_to: str(form, "quiet_to") || null,
      enabled: bool(form, "enabled"),
    };

    const [existing] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenant_id, ctx.business.id),
          eq(notificationPreferences.user_id, ctx.user.id),
          eq(notificationPreferences.event, ""),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(notificationPreferences)
        .set({ ...values, updated_at: new Date() })
        .where(eq(notificationPreferences.id, existing.id));
    } else {
      await db.insert(notificationPreferences).values({
        ...values,
        tenant_id: ctx.business.id,
        user_id: ctx.user.id,
        event: "",
      });
    }

    revalidate("/notifications/preferences");
    return success(
      undefined,
      values.enabled
        ? "Preferences saved."
        : "Preferences saved — only critical notifications will reach you.",
    );
  });
}
