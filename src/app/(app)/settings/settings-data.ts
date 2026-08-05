import "server-only";

import { canAccess, hasPermission, type BusinessContext } from "@/lib/authz/context";
import { ALL_SETTINGS, MODULE_BY_SLUG } from "@/lib/registry";
import { loadSettings, readSetting } from "@/lib/services/settings";

import type { SettingFieldView, SettingGroupView } from "./settings-panel";

/**
 * Builds the settings form from the registry.
 *
 * Settings belonging to a module the business does not have are omitted entirely
 * (17-settings.md § Business Rules: disabled modules hide their settings).
 */
export async function buildSettingGroups(
  ctx: BusinessContext,
  options: { groups?: string[]; scopes?: ("business" | "branch" | "user")[] } = {},
): Promise<SettingGroupView[]> {
  const bag = await loadSettings({
    businessId: ctx.business.id,
    storeId: ctx.activeStore?.id ?? null,
    userId: ctx.user.id,
  });

  const allowedScopes = new Set(options.scopes ?? ["business", "branch", "user"]);
  const allowedGroups = options.groups ? new Set(options.groups) : null;

  const byGroup = new Map<string, SettingFieldView[]>();

  for (const setting of ALL_SETTINGS) {
    if (!allowedScopes.has(setting.scope as "business" | "branch" | "user")) continue;
    if (allowedGroups && !allowedGroups.has(setting.group)) continue;

    const owner = MODULE_BY_SLUG[setting.moduleSlug];
    const moduleAvailable =
      Boolean(owner?.isCore) || canAccess(ctx, { module: setting.moduleSlug });
    if (!moduleAvailable) continue;

    const field: SettingFieldView = {
      key: setting.key,
      label: setting.label,
      description: setting.description,
      type: setting.type,
      options: setting.options,
      value: readSetting(bag, setting.key, setting.default),
      moduleName: setting.moduleName,
      // A setting is read-only unless the user holds the permission it declares.
      editable: setting.permission
        ? hasPermission(ctx, setting.permission)
        : true,
    };

    const list = byGroup.get(setting.group) ?? [];
    list.push(field);
    byGroup.set(setting.group, list);
  }

  return [...byGroup.entries()].map(([group, fields]) => ({ group, fields }));
}
