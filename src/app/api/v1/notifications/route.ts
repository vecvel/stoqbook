import { type NextRequest } from "next/server";
import { eq } from "drizzle-orm";

import { notifications } from "@/db/schema";
import { handleList } from "@/lib/api/resource";
import { requirePermission } from "@/lib/authz/guard";
import { failFrom } from "@/lib/api/response";

/**
 * GET /api/v1/notifications — the caller's own inbox.
 *
 * Scoped to the signed-in user, not the business. `notifications.view` grants
 * seeing *your* notifications; the business-wide delivery log is a separate
 * screen behind `notifications.view_history`, so listing everyone's messages
 * here would quietly widen that permission.
 *
 * `?scope=all` opts into the business-wide view and is checked against
 * `notifications.view_history` separately.
 */
export async function GET(request: NextRequest) {
  try {
    const wantsAll = request.nextUrl.searchParams.get("scope") === "all";

    const ctx = await requirePermission(
      wantsAll ? "notifications.view_history" : "notifications.view",
      { onDenied: "throw" },
    );

    return handleList(request, {
      table: notifications,
      permission: wantsAll ? "notifications.view_history" : "notifications.view",
      tenantColumn: notifications.tenant_id,
      columns: {
        id: notifications.id,
        event: notifications.event,
        module_slug: notifications.module_slug,
        channel: notifications.channel,
        priority: notifications.priority,
        status: notifications.status,
        title: notifications.title,
        body: notifications.body,
        action_url: notifications.action_url,
        user_id: notifications.user_id,
        sent_at: notifications.sent_at,
        read_at: notifications.read_at,
        created_at: notifications.created_at,
      },
      searchColumns: [notifications.title, notifications.body, notifications.event],
      sortable: ["created_at", "priority", "status", "event"],
      defaultSort: { field: "created_at", direction: "desc" },
      filters: {
        channel: notifications.channel,
        status: notifications.status,
        priority: notifications.priority,
        event: notifications.event,
      },
      /* The user scope is expressed as an extra condition rather than a filter,
         so it cannot be widened by a query parameter. */
      extraConditions: wantsAll
        ? []
        : [eq(notifications.user_id, ctx.user.id)],
    });
  } catch (error) {
    return failFrom(error);
  }
}
