import "server-only";

import type { BusinessContext } from "@/lib/authz/context";
import { MODULE_BY_SLUG, PERMISSIONS_BY_MODULE } from "@/lib/registry";

import type { PermissionGroupView } from "./role-form";

/**
 * Builds the permission matrix for the role editor from the registry.
 *
 * Modules and features this installation's licence does not include are shown
 * but disabled, so an administrator can see what an upgrade would unlock rather
 * than wondering where a capability went.
 */
export function buildPermissionGroups(
  ctx: BusinessContext,
): PermissionGroupView[] {
  return PERMISSIONS_BY_MODULE.map((group) => {
    // Not named `module`: that shadows the CommonJS global, which Next flags
    // because it silently breaks bundling in some compilation modes.
    const definition = MODULE_BY_SLUG[group.slug];
    const moduleEnabled =
      Boolean(definition?.isCore) || ctx.entitlements.modules.has(group.slug);

    return {
      slug: group.slug,
      name: group.name,
      icon: group.icon,
      moduleEnabled,
      permissions: group.permissions.map((permission) => ({
        key: permission.key,
        action: permission.action,
        name: permission.name,
        description: permission.description,
        feature: permission.feature,
        available:
          moduleEnabled &&
          (!permission.feature ||
            ctx.entitlements.features.has(permission.feature)),
      })),
    };
  });
}
