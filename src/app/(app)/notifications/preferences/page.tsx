import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";

import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readString } from "@/lib/services/settings";

import { NotificationPreferencesForm } from "./preferences-form";

export const metadata: Metadata = { title: "Notification preferences" };

export default async function NotificationPreferencesPage() {
  const ctx = await requirePermission("notifications.view");

  const [rows, settings] = await Promise.all([
    db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.tenant_id, ctx.business.id),
          eq(notificationPreferences.user_id, ctx.user.id),
          eq(notificationPreferences.event, ""),
        ),
      )
      .limit(1),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  const preference = rows[0];
  const quietFrom = readString(settings, "notifications.quiet_from", "");
  const quietTo = readString(settings, "notifications.quiet_to", "");

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="My notification preferences"
        description="Choose how you are told about business events."
        breadcrumbs={[
          { label: "Notifications", href: "/notifications" },
          { label: "My preferences" },
        ]}
      />

      <NotificationPreferencesForm
        enabled={preference?.enabled ?? true}
        channels={preference?.channels ?? []}
        quietFrom={preference?.quiet_from ?? ""}
        quietTo={preference?.quiet_to ?? ""}
        businessQuiet={
          quietFrom && quietTo ? `between ${quietFrom} and ${quietTo}` : null
        }
      />
    </div>
  );
}
