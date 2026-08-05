"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { dashboardLayouts } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { visibleWidgets } from "@/lib/navigation";
import {
  revalidate,
  runAction,
  success,
  type ActionResult,
} from "@/lib/actions";

/**
 * A user's chosen dashboard widgets.
 *
 * Stored as an ordered list of registry widget keys. The saved list is only
 * ever a filter over what the user is already allowed to see, so a layout
 * cannot outlive a revoked permission or a disabled module.
 */
export async function saveDashboardLayout(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("dashboard.customize", {
      feature: "dashboard.custom_layout",
    });

    const permitted = visibleWidgets(ctx);
    const sizeByKey = new Map(permitted.map((w) => [w.key, w.size as string]));

    /* Order is taken from the submitted sequence, which is the registry's own
       priority order, so a saved layout keeps the intended reading order. */
    const chosen = form
      .getAll("widgets")
      .map(String)
      .filter((key) => sizeByKey.has(key))
      .map((key, index) => ({
        widget: key,
        size: sizeByKey.get(key)!,
        order: index,
      }));

    const [existing] = await db
      .select({ id: dashboardLayouts.id })
      .from(dashboardLayouts)
      .where(
        and(
          eq(dashboardLayouts.tenant_id, ctx.business.id),
          eq(dashboardLayouts.user_id, ctx.user.id),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(dashboardLayouts)
        .set({ widgets: chosen, updated_at: new Date() })
        .where(eq(dashboardLayouts.id, existing.id));
    } else {
      await db.insert(dashboardLayouts).values({
        tenant_id: ctx.business.id,
        user_id: ctx.user.id,
        widgets: chosen,
      });
    }

    revalidate("/dashboard");
    return success(
      undefined,
      chosen.length === 0
        ? "Layout reset — every widget you can see is shown again."
        : `Showing ${chosen.length} widget(s).`,
    );
  });
}

/** Clears the saved layout so the registry default applies again. */
export async function resetDashboardLayout(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("dashboard.customize", {
      feature: "dashboard.custom_layout",
    });

    await db
      .delete(dashboardLayouts)
      .where(
        and(
          eq(dashboardLayouts.tenant_id, ctx.business.id),
          eq(dashboardLayouts.user_id, ctx.user.id),
        ),
      );

    revalidate("/dashboard");
    return success(undefined, "Layout reset to the default.");
  });
}
