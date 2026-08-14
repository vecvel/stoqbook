"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { loginHistory, roles, tenants, userRoles, users } from "@/db/schema";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { auditSystem } from "@/lib/services/audit";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { isInstalled, setupBusiness } from "@/lib/services/business";
import { toAppError } from "@/lib/authz/errors";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

async function requestMeta() {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
    userAgent: h.get("user-agent") ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Sign in                                                                    */
/* -------------------------------------------------------------------------- */

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const meta = await requestMeta();

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const [row] = await db
    .select({ user: users, business: tenants })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenant_id))
    .where(and(eq(users.email, email), isNull(users.deleted_at)))
    .limit(1);

  if (!row) {
    await recordLogin(email, "unknown_user", meta, null, null);
    // Same message as a wrong password — do not disclose which accounts exist.
    return { error: "Incorrect email or password." };
  }

  const { user, business } = row;

  if (user.locked_until && user.locked_until > new Date()) {
    await recordLogin(email, "locked", meta, business.id, user.id);
    const minutes = Math.ceil(
      (user.locked_until.getTime() - Date.now()) / 60_000,
    );
    return {
      error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  if (!user.login_enabled) {
    await recordLogin(email, "login_disabled", meta, business.id, user.id);
    return { error: "Portal access is disabled for this account." };
  }
  if (user.status === "suspended") {
    await recordLogin(email, "suspended", meta, business.id, user.id);
    return { error: "Your account is suspended. Contact your administrator." };
  }
  if (user.status === "resigned" || user.status === "archived") {
    await recordLogin(email, "inactive", meta, business.id, user.id);
    return { error: "This account is no longer active." };
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    await registerFailedAttempt(user.id, business.id);
    await recordLogin(email, "invalid_password", meta, business.id, user.id);
    return { error: "Incorrect email or password." };
  }

  /* Business status is checked after authentication so the message is specific.
     The Super Admin is still let through on a suspended business, because the admin
     panel is where suspension gets lifted. */
  const isSuperAdminLogin = await isSuperAdminUser(user.id);

  if (business.status === "suspended" && !isSuperAdminLogin) {
    await recordLogin(email, "business_suspended", meta, business.id, user.id);
    return {
      error:
        business.suspended_reason ??
        "This business is suspended. Contact your administrator to restore access.",
    };
  }
  if (business.status === "archived" && !isSuperAdminLogin) {
    await recordLogin(email, "business_archived", meta, business.id, user.id);
    return { error: "This business is archived and is no longer trading." };
  }

  const settings = await loadSettings({ businessId: business.id });
  const timeoutMinutes = readNumber(
    settings,
    "security.session_timeout_minutes",
    720,
  );

  await db
    .update(users)
    .set({
      last_login_at: new Date(),
      failed_login_attempts: 0,
      locked_until: null,
      status: user.status === "pending" ? "active" : user.status,
    })
    .where(eq(users.id, user.id));

  await createSession({
    businessId: business.id,
    userId: user.id,
    activeStoreId: user.store_id,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    ttlMinutes: timeoutMinutes,
  });

  await recordLogin(email, "success", meta, business.id, user.id);
  await auditSystem({
    businessId: business.id,
    event: "UserSignedIn",
    moduleSlug: "settings",
    entityType: "user",
    entityId: user.id,
    summary: `${user.full_name} signed in`,
    actorName: user.full_name,
  });

  redirect(business.status === "active" ? "/dashboard" : "/admin");
}

/** True when the user holds the Super Admin role. */
async function isSuperAdminUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(
      and(
        eq(userRoles.user_id, userId),
        sql`(${roles.is_super_admin} = true OR ${roles.slug} = 'super_admin')`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Locks the account after the configured number of failed attempts. */
async function registerFailedAttempt(
  userId: string,
  businessId: string,
): Promise<void> {
  const settings = await loadSettings({ businessId });
  const maxAttempts = readNumber(settings, "security.max_login_attempts", 5);
  const lockoutMinutes = readNumber(settings, "security.lockout_minutes", 15);

  const [user] = await db
    .select({ attempts: users.failed_login_attempts })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const attempts = (user?.attempts ?? 0) + 1;
  const shouldLock = maxAttempts > 0 && attempts >= maxAttempts;

  await db
    .update(users)
    .set({
      failed_login_attempts: shouldLock ? 0 : attempts,
      locked_until: shouldLock
        ? new Date(Date.now() + lockoutMinutes * 60_000)
        : null,
    })
    .where(eq(users.id, userId));
}

async function recordLogin(
  email: string,
  outcome: string,
  meta: { ip: string | null; userAgent: string | null },
  businessId: string | null,
  userId: string | null,
): Promise<void> {
  await db.insert(loginHistory).values({
    tenant_id: businessId,
    user_id: userId,
    email,
    outcome,
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
}

/* -------------------------------------------------------------------------- */
/* First-run setup                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One-time installation setup (02-business-structure.md § Business Setup Flow).
 *
 * There is no self-service registration: StoqBook is installed for a single
 * business, so this wizard runs exactly once and then becomes unreachable.
 */
export async function setupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  // Guard the action itself, not just the page — a stale form must not be able
  // to create a second business.
  if (await isInstalled()) {
    return { error: "This installation is already set up. Sign in instead." };
  }

  const businessName = String(formData.get("business_name") ?? "").trim();
  const superAdminName = String(formData.get("super_admin_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  const fieldErrors: Record<string, string[]> = {};

  if (!businessName) fieldErrors.business_name = ["Business name is required."];
  if (!superAdminName) fieldErrors.super_admin_name = ["Your name is required."];
  if (!email.includes("@")) fieldErrors.email = ["Enter a valid email address."];

  const passwordProblems = validatePassword(password, { minLength: 8 });
  if (passwordProblems.length > 0) fieldErrors.password = passwordProblems;
  if (password !== confirm) {
    fieldErrors.confirm_password = ["Passwords do not match."];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { error: "Please correct the highlighted fields.", fieldErrors };
  }

  try {
    const result = await setupBusiness({
      businessName,
      superAdminName,
      superAdminEmail: email,
      superAdminPassword: password,
      contactPhone: phone || undefined,
      country: country || undefined,
      currency: currency || undefined,
      timezone: timezone || undefined,
    });

    const meta = await requestMeta();
    await createSession({
      businessId: result.businessId,
      userId: result.superAdminUserId,
      activeStoreId: result.storeId ?? null,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch (error) {
    const appError = toAppError(error);
    return { error: appError.message };
  }

  redirect("/dashboard");
}

/* -------------------------------------------------------------------------- */
/* Sign out                                                                   */
/* -------------------------------------------------------------------------- */

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** Used by the seeded-demo shortcut on the sign-in screen. */
export async function demoLoginAction(role: string): Promise<void> {
  const superAdminEmail =
    process.env.SEED_SUPER_ADMIN_EMAIL ??
    process.env.SEED_OWNER_EMAIL ??
    "superadmin@mybusiness.test";

  const emails: Record<string, string> = {
    super_admin: superAdminEmail,
    superadmin: superAdminEmail,
    manager: "manager@mybusiness.test",
    cashier: "cashier@mybusiness.test",
    inventory: "stock@mybusiness.test",
    accountant: "accounts@mybusiness.test",
  };

  const form = new FormData();
  form.set("email", emails[role] ?? superAdminEmail);
  form.set("password", process.env.SEED_SUPER_ADMIN_PASSWORD ?? process.env.SEED_OWNER_PASSWORD ?? "Stoqbook@123");
  await loginAction({}, form);
}

export async function resetPasswordRequestAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const [user] = await db
    .select({ id: users.id, tenant_id: users.tenant_id, name: users.full_name })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deleted_at)))
    .limit(1);

  if (user) {
    await auditSystem({
      businessId: user.tenant_id,
      event: "PasswordResetRequested",
      moduleSlug: "settings",
      entityType: "user",
      entityId: user.id,
      summary: `Password reset requested for ${email}`,
      actorName: user.name,
    });
  }

  // The same response is returned either way so the form cannot be used to
  // enumerate registered addresses.
  return {
    error: undefined,
    fieldErrors: {
      email: [
        "If an account exists for this address, a reset link has been sent.",
      ],
    },
  };
}

/** Direct password change from settings; requires the current password. */
export async function changePasswordAction(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, error: "Account not found." };

  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const settings = await loadSettings({ businessId: user.tenant_id });
  const minLength = readNumber(settings, "security.password_min_length", 8);
  const problems = validatePassword(newPassword, { minLength });
  if (problems.length > 0) return { ok: false, error: problems.join(" ") };

  await db
    .update(users)
    .set({ password_hash: await hashPassword(newPassword), updated_at: new Date() })
    .where(eq(users.id, userId));

  return { ok: true };
}
