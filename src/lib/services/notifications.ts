import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import {
  notificationPreferences,
  notificationRules,
  notificationTemplates,
  notifications,
  rolePermissions,
  roles,
  tenants,
  userRoles,
  users,
} from "@/db/schema";

/**
 * Notification service (16-notifications.md).
 *
 * Business code emits an event; the title and body may come from a stored
 * template, and recipients, channels and priority are resolved from configured
 * rules. Each recipient's own preferences then narrow the channels and can
 * suppress delivery during quiet hours — except for critical notifications,
 * which always go out. In-app delivery is immediate; other channels are queued
 * for a worker.
 */

export type NotificationPriority =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "silent";

export type NotificationChannel =
  | "in_app"
  | "email"
  | "sms"
  | "whatsapp"
  | "push"
  | "webhook";

export interface EmitInput {
  businessId: string;
  event: string;
  /** Fallback title; a stored template for this event wins. */
  title: string;
  /** Fallback body; a stored template for this event wins. */
  body: string;
  moduleSlug?: string;
  storeId?: string | null;
  actionUrl?: string;
  priority?: NotificationPriority;
  payload?: Record<string, unknown>;
  /** Values substituted into a template's {{placeholders}}. */
  variables?: Record<string, unknown>;
  /** Explicit recipients; when omitted, rules decide. */
  userIds?: string[];
  /** Fallback recipients when no rule exists: users holding this permission. */
  fallbackPermission?: string;
}

/**
 * Renders {{variable}} placeholders. Missing keys are left untouched so a
 * template bug is visible rather than silently producing "undefined".
 */
export function render(
  template: string,
  variables: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export async function emit(
  input: EmitInput,
  client: DbClient = db,
): Promise<number> {
  const recipients = await resolveRecipients(input, client);
  if (recipients.length === 0) return 0;

  const rule = await findRule(input.businessId, input.event, client);
  const priority = input.priority ?? rule?.priority ?? "medium";
  const ruleChannels = (rule?.channels ?? ["in_app"]) as NotificationChannel[];

  /* A stored template wins over the caller's literal text, so wording can be
     changed without touching business code (16-notifications.md § Templates). */
  const templates = await client
    .select()
    .from(notificationTemplates)
    .where(
      and(
        eq(notificationTemplates.tenant_id, input.businessId),
        eq(notificationTemplates.event, input.event),
        eq(notificationTemplates.is_active, true),
      ),
    );

  const variables = input.variables ?? {};
  const preferences = await loadPreferences(
    input.businessId,
    input.event,
    recipients,
    client,
  );
  const quietNow = await isQuietHourFor(input.businessId, client);

  // Critical notifications ignore both quiet hours and opt-outs; that is the
  // whole point of the priority.
  const isCritical = priority === "critical";

  const rows = recipients.flatMap((userId) => {
    const preference = preferences.get(userId);

    if (preference && preference.enabled === false && !isCritical) return [];

    const allowed = preference?.channels?.length
      ? ruleChannels.filter((c) =>
          (preference.channels as string[]).includes(c),
        )
      : ruleChannels;

    const suppressed =
      !isCritical &&
      (quietNow || inQuietWindow(preference?.quiet_from, preference?.quiet_to));

    return allowed.map((channel) => {
      const template =
        templates.find((t) => t.channel === channel) ??
        templates.find((t) => t.channel === "in_app");

      const title = template
        ? render(template.title, variables)
        : render(input.title, variables);
      const body = template
        ? render(template.body, variables)
        : render(input.body, variables);

      /* In-app is delivered synchronously. Anything else is queued for a
         worker, and a quiet-hour message stays queued rather than being
         dropped, so it still arrives once the window closes. */
      const immediate = channel === "in_app" && !suppressed;

      return {
        tenant_id: input.businessId,
        user_id: userId,
        branch_id: input.storeId ?? null,
        event: input.event,
        module_slug: input.moduleSlug ?? null,
        channel,
        priority,
        status: (immediate ? "delivered" : "queued") as "delivered" | "queued",
        title,
        body,
        action_url: input.actionUrl ?? null,
        payload: input.payload ?? {},
        sent_at: immediate ? new Date() : null,
      };
    });
  });

  if (rows.length === 0) return 0;

  const inserted = await client
    .insert(notifications)
    .values(rows)
    .returning({ id: notifications.id, channel: notifications.channel });

  /* Anything not delivered in-app needs a worker. Enqueued on the same client,
     so a job cannot outlive a rolled-back transaction that raised it. */
  const { enqueue } = await import("@/lib/jobs/queue");

  for (const row of inserted) {
    if (row.channel === "in_app") continue;
    await enqueue(
      {
        businessId: input.businessId,
        kind: "notification.deliver",
        payload: { notificationId: row.id },
        // Critical messages jump the queue ahead of routine traffic.
        priority: priority === "critical" ? 10 : 100,
      },
      client,
    );
  }

  return rows.length;
}

type PreferenceRow = typeof notificationPreferences.$inferSelect;

/**
 * A user's preference for an event, falling back to their global preference
 * (stored with an empty event) when no event-specific row exists.
 */
async function loadPreferences(
  businessId: string,
  event: string,
  userIds: string[],
  client: DbClient,
): Promise<Map<string, PreferenceRow>> {
  const rows = await client
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenant_id, businessId),
        inArray(notificationPreferences.user_id, userIds),
        inArray(notificationPreferences.event, [event, ""]),
      ),
    );

  const byUser = new Map<string, PreferenceRow>();
  for (const row of rows) {
    const existing = byUser.get(row.user_id);
    // The event-specific row is more specific and wins over the global one.
    if (!existing || row.event === event) byUser.set(row.user_id, row);
  }
  return byUser;
}

/** Minutes since midnight for an "HH:MM" value, or null when unset. */
function minutesOfDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

/**
 * True when the current local time falls inside the user's do-not-disturb
 * window. A window that wraps past midnight (22:00 → 07:00) is handled.
 */
function inQuietWindow(
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = minutesOfDay(from);
  const end = minutesOfDay(to);
  if (start === null || end === null) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  return start <= end
    ? current >= start && current < end
    : current >= start || current < end;
}

/**
 * Business-wide quiet hours, from the `notifications.quiet_from` /
 * `notifications.quiet_to` settings. Evaluated in the business's own zone so a
 * server in another region does not shift the window.
 */
export async function isQuietHourFor(
  businessId: string,
  client: DbClient = db,
): Promise<boolean> {
  const { loadSettings, readString } = await import("./settings");
  const [business] = await client
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, businessId))
    .limit(1);
  if (!business) return false;

  const settings = await loadSettings({ businessId });
  const from = readString(settings, "notifications.quiet_from", "");
  const to = readString(settings, "notifications.quiet_to", "");
  if (!from || !to) return false;

  // Re-express "now" in the business zone before comparing clock times.
  const local = new Date(
    new Date().toLocaleString("en-US", { timeZone: business.timezone }),
  );

  return inQuietWindow(from, to, local);
}

async function findRule(
  businessId: string,
  event: string,
  client: DbClient,
) {
  const [rule] = await client
    .select()
    .from(notificationRules)
    .where(
      and(
        eq(notificationRules.tenant_id, businessId),
        eq(notificationRules.event, event),
        eq(notificationRules.is_active, true),
      ),
    )
    .limit(1);
  return rule;
}

async function resolveRecipients(
  input: EmitInput,
  client: DbClient,
): Promise<string[]> {
  if (input.userIds?.length) return [...new Set(input.userIds)];

  const rule = await findRule(input.businessId, input.event, client);
  const ids = new Set<string>(rule?.recipient_user_ids ?? []);

  if (rule?.recipient_roles?.length) {
    const rows = await client
      .select({ user_id: userRoles.user_id })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.role_id))
      .where(
        and(
          eq(roles.tenant_id, input.businessId),
          inArray(roles.slug, rule.recipient_roles),
        ),
      );
    rows.forEach((r) => ids.add(r.user_id));
  }

  // No rule configured — fall back to whoever can act on the event.
  if (ids.size === 0 && input.fallbackPermission) {
    const rows = await client
      .select({ user_id: userRoles.user_id })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.role_id))
      .leftJoin(rolePermissions, eq(rolePermissions.role_id, roles.id))
      .where(
        and(
          eq(roles.tenant_id, input.businessId),
          sql`(${roles.is_owner} = true OR ${rolePermissions.permission_key} = ${input.fallbackPermission})`,
        ),
      );
    rows.forEach((r) => ids.add(r.user_id));
  }

  if (ids.size === 0) return [];

  // Only notify users who can actually log in.
  const active = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenant_id, input.businessId),
        eq(users.status, "active"),
        isNull(users.deleted_at),
        inArray(users.id, [...ids]),
      ),
    );

  return active.map((u) => u.id);
}

/** Broadcasts to every active user in a tenant. */
export async function broadcast(
  input: Omit<EmitInput, "userIds" | "fallbackPermission">,
  client: DbClient = db,
): Promise<number> {
  const active = await client
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenant_id, input.businessId),
        eq(users.status, "active"),
        isNull(users.deleted_at),
      ),
    );

  return emit({ ...input, userIds: active.map((u) => u.id) }, client);
}

export async function unreadCount(
  businessId: string,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenant_id, businessId),
        eq(notifications.user_id, userId),
        eq(notifications.channel, "in_app"),
        isNull(notifications.read_at),
        isNull(notifications.archived_at),
      ),
    );
  return row?.count ?? 0;
}

export async function markRead(
  businessId: string,
  userId: string,
  notificationId?: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ read_at: new Date(), status: "read" })
    .where(
      and(
        eq(notifications.tenant_id, businessId),
        eq(notifications.user_id, userId),
        isNull(notifications.read_at),
        notificationId ? eq(notifications.id, notificationId) : sql`true`,
      ),
    );
}
