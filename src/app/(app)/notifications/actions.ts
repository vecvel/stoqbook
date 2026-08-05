"use server";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { markRead } from "@/lib/services/notifications";
import { revalidate, runAction, success, type ActionResult } from "@/lib/actions";

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.view");
    await markRead(ctx.business.id, ctx.user.id, notificationId);
    revalidate("/notifications");
    return success();
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.view");
    await markRead(ctx.business.id, ctx.user.id);
    revalidate("/notifications");
    return success(undefined, "All notifications marked as read.");
  });
}

/** Archives a notification. It remains in the audit history. */
export async function archiveNotification(
  notificationId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("notifications.view");
    await db
      .update(notifications)
      .set({ archived_at: new Date(), read_at: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.tenant_id, ctx.business.id),
          eq(notifications.user_id, ctx.user.id),
          isNull(notifications.archived_at),
        ),
      );
    revalidate("/notifications");
    return success(undefined, "Notification archived.");
  });
}
