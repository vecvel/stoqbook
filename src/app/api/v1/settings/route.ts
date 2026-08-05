import { type NextRequest } from "next/server";

import { canAccess, hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { failFrom, ok } from "@/lib/api/response";
import { ALL_SETTINGS, MODULE_BY_SLUG } from "@/lib/registry";
import { loadSettings } from "@/lib/services/settings";

/**
 * GET /api/v1/settings — the effective configuration for the caller's scope.
 *
 * Not a table dump. Settings resolve through business → store → warehouse →
 * user, and only the resolved value is meaningful; returning raw `settings` rows
 * would make every consumer reimplement the precedence rules and get them
 * wrong (17-settings.md § Settings Hierarchy).
 *
 * Two filters apply on the way out, and both matter:
 *
 *  - a setting belonging to a module this installation is not entitled to is
 *    omitted, because it describes a capability that does not exist here;
 *  - a setting whose declared permission the caller lacks is omitted, so the API
 *    cannot become a way to read configuration the settings screen would hide.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requirePermission("settings.view", { onDenied: "throw" });

    const group = request.nextUrl.searchParams.get("group");
    const scopeParam = request.nextUrl.searchParams.get("scope");

    /* Resolution is done for the caller's own scope: their active store and
       their own user overrides. Reading somebody else's resolved settings is not
       something this endpoint offers. */
    const bag = await loadSettings({
      businessId: ctx.business.id,
      storeId: ctx.activeStore?.id ?? null,
      userId: ctx.user.id,
    });

    const visible = ALL_SETTINGS.filter((setting) => {
      if (group && setting.group !== group) return false;
      if (scopeParam && setting.scope !== scopeParam) return false;

      const owner = MODULE_BY_SLUG[setting.moduleSlug];
      const moduleAvailable =
        Boolean(owner?.isCore) || canAccess(ctx, { module: setting.moduleSlug });
      if (!moduleAvailable) return false;

      return setting.permission ? hasPermission(ctx, setting.permission) : true;
    });

    const data = visible.map((setting) => ({
      key: setting.key,
      label: setting.label,
      description: setting.description ?? null,
      type: setting.type,
      scope: setting.scope,
      group: setting.group,
      module: setting.moduleSlug,
      options: setting.options ?? null,
      default: setting.default,
      value: bag[setting.key] ?? setting.default,
      /* Whether *this* caller may change it. A read-only consumer can render
         the right affordance without a second request. */
      editable: setting.permission
        ? hasPermission(ctx, setting.permission)
        : true,
    }));

    return ok(data, {
      message: `${data.length} setting(s) resolved for this scope.`,
      meta: {
        scope: {
          business: ctx.business.id,
          store: ctx.activeStore?.id ?? null,
          user: ctx.user.id,
        },
        groups: [...new Set(data.map((d) => d.group))].sort(),
      },
    });
  } catch (error) {
    return failFrom(error);
  }
}
