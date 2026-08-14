import "server-only";

import { forbidden, redirect, unauthorized } from "next/navigation";

import { MODULE_BY_SLUG, PERMISSION_BY_KEY } from "@/lib/registry";

import {
  canAccess,
  getContext,
  hasPermission,
  moduleOfPermission,
  type BusinessContext,
  type RequestContext,
} from "./context";
import {
  AuthenticationError,
  AuthorizationError,
  LicenseError,
  type AppError,
} from "./errors";

/**
 * The authorization pipeline.
 *
 * Every protected operation runs through `authorize`, in the exact order the
 * architecture prescribes (01-platform-architecture.md § Authorization Pipeline):
 *
 *   authenticate → business status → licence → plan/feature → module → permission
 *
 * Business rules are validated afterwards by the service layer.
 */

export interface AuthorizeOptions {
  /** Permission key, e.g. `products.create`. Module is inferred from it. */
  permission?: string;
  /** Explicit module override when it cannot be inferred. */
  module?: string;
  /** Feature entitlement required. Defaults to the permission's declared feature. */
  feature?: string;
  /** Skip licence validity — used by the licence and admin screens themselves. */
  allowInvalidLicense?: boolean;
  /**
   * What a denial should do.
   *
   * `"navigate"` (the default) renders the right page with the right status:
   * 401 for a missing session, 403 for a missing permission, or a redirect to
   * the licence screen. That is what a page or a server action wants.
   *
   * `"throw"` raises the `AppError` instead, for API routes that must answer
   * with a JSON envelope rather than HTML. Getting this wrong is why page
   * denials used to surface as 500 Internal Server Error.
   */
  onDenied?: "navigate" | "throw";
}

export async function authorize(
  options: AuthorizeOptions = {},
): Promise<BusinessContext> {
  const navigate = (options.onDenied ?? "navigate") === "navigate";

  /**
   * Ends the request the way this caller asked for.
   *
   * The navigation helpers throw a Next-internal signal, so this never returns
   * either way. The explicit type annotation is required, not decorative:
   * TypeScript only narrows past a `never`-returning call when the callee's type
   * is declared rather than inferred, and without it every later `ctx` use would
   * still be `BusinessContext | null`.
   */
  const deny: (error: AppError) => never = (error) => {
    if (!navigate) throw error;
    if (error.category === "authentication") unauthorized();
    if (error.redirectTo) redirect(error.redirectTo);
    forbidden();
  };

  const ctx = await getContext();

  /* 1. Authenticated? */
  if (!ctx) deny(AuthenticationError());

  /* 2. Business operable? */
  const inoperable = businessInoperableReason(ctx);
  if (inoperable) deny(inoperable);

  /* 3. Licence valid? */
  if (!options.allowInvalidLicense && !ctx.entitlements.isValid) {
    deny(
      LicenseError(
        ctx.entitlements.invalidReason ?? "Your licence is not active.",
        "LICENSE_INVALID",
      ),
    );
  }

  /* 4 & 5. Module enabled and feature entitled. */
  const permission = options.permission;
  const declared = permission ? PERMISSION_BY_KEY[permission] : undefined;
  const moduleSlug =
    options.module ?? declared?.moduleSlug ??
    (permission ? moduleOfPermission(permission) : undefined);
  const feature = options.feature ?? declared?.feature;

  if (moduleSlug) {
    const mod = MODULE_BY_SLUG[moduleSlug];
    // Core modules bypass the licence module list — they are always available.
    if (mod && !mod.isCore && !ctx.entitlements.modules.has(moduleSlug)) {
      deny(
        LicenseError(
          `The ${mod.name} module is not included in your plan.`,
          "MODULE_NOT_LICENSED",
        ),
      );
    }
  }

  if (feature && !ctx.entitlements.features.has(feature)) {
    deny(
      LicenseError(
        "This feature is not included in your plan.",
        "FEATURE_NOT_LICENSED",
      ),
    );
  }

  /* 6. Permission granted? */
  if (permission && !hasPermission(ctx, permission)) {
    deny(AuthorizationError());
  }

  return ctx;
}

/**
 * 02-business-structure.md § Business Status.
 *
 * Returns the failure rather than throwing it, so the caller decides whether a
 * denial navigates or throws.
 */
function businessInoperableReason(ctx: BusinessContext) {
  switch (ctx.business.status) {
    case "active":
      return null;
    case "suspended":
      return LicenseError(
        ctx.business.suspended_reason ??
          "This business is suspended. Contact your administrator to restore access.",
        "BUSINESS_SUSPENDED",
      );
    case "archived":
      return LicenseError("This business is archived.", "BUSINESS_ARCHIVED");
    case "created":
      return LicenseError(
        "Setup is not finished yet. Complete the setup wizard to start using StoqBook.",
        "BUSINESS_SETUP_INCOMPLETE",
      );
    default:
      return LicenseError("This business is not active.", "BUSINESS_INACTIVE");
  }
}

/** Authenticated user, no permission requirement, licence not checked. */
export async function requireUser(): Promise<BusinessContext> {
  return authorize({ allowInvalidLicense: true });
}

/** Authenticated user with a valid licence. */
export async function requireLicensed(): Promise<BusinessContext> {
  return authorize();
}

export async function requirePermission(
  permission: string,
  options: Omit<AuthorizeOptions, "permission"> = {},
): Promise<BusinessContext> {
  return authorize({ ...options, permission });
}

/**
 * Business admin panel guard.
 *
 * Administrative permissions live in the same RBAC namespace as operational
 * ones (04-rbac.md) — the panel is gated by `admin.*` permissions, which only
 * the Super Admin role holds by default. The licence is not required to be valid,
 * because renewing it is done from inside the panel.
 */
export async function requireAdmin(
  permission = "admin.panel",
): Promise<BusinessContext> {
  return authorize({ permission, allowInvalidLicense: true });
}

/**
 * Non-throwing variant for conditional UI. Prefer `canAccess` when the context
 * is already loaded — this exists for standalone checks.
 */
export async function can(options: {
  module?: string;
  feature?: string;
  permission?: string;
}): Promise<boolean> {
  const ctx = await getContext();
  return canAccess(ctx, options);
}

export type { RequestContext, BusinessContext };
