import "server-only";

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { notifications, tenants, users } from "@/db/schema";
import { senderFor } from "@/lib/notifications/channels";
import { loadSettings } from "@/lib/services/settings";

import { registerJob } from "../runner";
import { PermanentJobFailure } from "../types";

/**
 * Notification delivery (16-notifications.md, 28-job-queue.md).
 *
 * This is what turns the delivery page's "queued" into "sent". In-app messages
 * are already delivered synchronously by `emit()`; everything else waits here.
 */

interface DeliverPayload {
  notificationId: string;
}

registerJob<DeliverPayload>("notification.deliver", async (payload, ctx) => {
  const [row] = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.id, payload.notificationId),
        eq(notifications.tenant_id, ctx.businessId),
      ),
    )
    .limit(1);

  // The notification may have been pruned between enqueue and run. Nothing to
  // do, and retrying will not bring it back.
  if (!row) {
    throw new PermanentJobFailure("Notification no longer exists.");
  }

  /* Idempotency: a job can run twice — the worker may die between sending and
     marking complete. Anything already past `queued` is left alone. */
  if (row.status !== "queued" && row.status !== "processing") return;

  const sender = senderFor(row.channel);
  if (!sender) {
    await fail(row.id, `No sender implemented for the ${row.channel} channel.`);
    throw new PermanentJobFailure(`Channel ${row.channel} is not supported.`);
  }

  const [business] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, ctx.businessId))
    .limit(1);

  const settings = await loadSettings({ businessId: ctx.businessId });
  const config = { settings, businessName: business?.name ?? "StoqBook" };

  if (!sender.configured(config)) {
    // Retrying against a channel the business never set up would burn attempts
    // and fill the failed list with noise. Fail once, plainly.
    await fail(
      row.id,
      `The ${row.channel} channel is not configured for this business.`,
    );
    throw new PermanentJobFailure(`${row.channel} is not configured.`);
  }

  const to = await resolveAddress(row.user_id, row.channel);
  if (!to) {
    await fail(
      row.id,
      `The recipient has no ${row.channel === "email" ? "email address" : "phone number"} on record.`,
    );
    throw new PermanentJobFailure("Recipient has no address for this channel.");
  }

  await db
    .update(notifications)
    .set({ status: "processing", attempts: ctx.attempt, updated_at: new Date() })
    .where(eq(notifications.id, row.id));

  await sender.send(
    {
      to,
      subject: row.title,
      title: row.title,
      body: row.body,
      actionUrl: row.action_url,
      event: row.event,
      priority: row.priority,
    },
    config,
  );

  await db
    .update(notifications)
    .set({
      status: "sent",
      sent_at: new Date(),
      last_error: null,
      updated_at: new Date(),
    })
    .where(eq(notifications.id, row.id));
});

async function fail(notificationId: string, message: string): Promise<void> {
  await db
    .update(notifications)
    .set({ status: "failed", last_error: message, updated_at: new Date() })
    .where(eq(notifications.id, notificationId));
}

/** Email needs an address; SMS and WhatsApp need a phone. Webhook needs neither. */
async function resolveAddress(
  userId: string | null,
  channel: string,
): Promise<string | null> {
  if (channel === "webhook") return "endpoint";
  if (!userId) return null;

  const [user] = await db
    .select({ email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  if (channel === "email") return user.email ?? null;
  return user.phone ?? null;
}

/* -------------------------------------------------------------------------- */
/* Quiet-hour release                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Delivers in-app messages that were held by quiet hours.
 *
 * `emit()` queues rather than drops them, precisely so they arrive once the
 * window closes. Without this sweep they would sit queued forever — which is
 * the state the delivery page has been honestly reporting until now.
 */
registerJob("notification.release_quiet", async (_payload, ctx) => {
  const { isQuietHourFor } = await import("@/lib/services/notifications");

  // Still inside the window: leave everything queued and come back later.
  if (await isQuietHourFor(ctx.businessId)) return;

  const held = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenant_id, ctx.businessId),
        eq(notifications.channel, "in_app"),
        eq(notifications.status, "queued"),
        isNull(notifications.sent_at),
        or(
          isNull(notifications.scheduled_for),
          lte(notifications.scheduled_for, new Date()),
        ),
      ),
    )
    .limit(500);

  if (held.length === 0) return;

  await db
    .update(notifications)
    .set({ status: "delivered", sent_at: new Date(), updated_at: new Date() })
    .where(
      inArray(
        notifications.id,
        held.map((h) => h.id),
      ),
    );
});

/* -------------------------------------------------------------------------- */

/** Notifications on non-in-app channels that are waiting for a delivery job. */
export async function pendingDeliveryCount(businessId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenant_id, businessId),
        eq(notifications.status, "queued"),
        sql`${notifications.channel} <> 'in_app'`,
      ),
    );
  return row?.n ?? 0;
}
