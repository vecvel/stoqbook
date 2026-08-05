import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/authz/guard";
import { currencySymbol } from "@/lib/format";
import { loadSettings, readBoolean, readString } from "@/lib/services/settings";

import { buildSettingGroups } from "../settings-data";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Integrations" };

/**
 * What this installation can talk to.
 *
 * Readiness is derived, not asserted. A channel delivers when it is switched on
 * *and* an endpoint has been given for it — so this page cannot drift out of
 * step with what the queue will actually do, which is the failure mode that
 * makes an integrations screen worse than none.
 */
const CHANNELS: {
  name: string;
  purpose: string;
  settingKey: string;
  /** Where messages go. Null for a channel that needs no outbound address. */
  endpointKey: string | null;
  featureSlug: string;
}[] = [
  {
    name: "REST API",
    purpose: "Read and write catalogue, sales and inventory data.",
    settingKey: "integrations.api_enabled",
    endpointKey: null,
    featureSlug: "settings.integrations",
  },
  {
    name: "Webhooks",
    purpose: "POST business events to your own endpoint, signed.",
    settingKey: "integrations.webhook_url",
    endpointKey: "integrations.webhook_url",
    featureSlug: "settings.integrations",
  },
  {
    name: "Email",
    purpose: "Send invoices, reports and alerts by email.",
    settingKey: "notifications.email_enabled",
    endpointKey: "integrations.email_endpoint",
    featureSlug: "notifications.email",
  },
  {
    name: "SMS",
    purpose: "Payment reminders and stock alerts by text.",
    settingKey: "notifications.sms_enabled",
    endpointKey: "integrations.sms_endpoint",
    featureSlug: "notifications.sms",
  },
  {
    name: "WhatsApp",
    purpose: "Send invoices and order updates on WhatsApp.",
    settingKey: "notifications.whatsapp_enabled",
    endpointKey: "integrations.whatsapp_endpoint",
    featureSlug: "notifications.whatsapp",
  },
];

export default async function IntegrationsPage() {
  const ctx = await requirePermission("settings.integrations", {
    feature: "settings.integrations",
  });

  const [groups, settings] = await Promise.all([
    buildSettingGroups(ctx, {
      groups: ["Integrations", "Notifications"],
      scopes: ["business"],
    }),
    loadSettings({ businessId: ctx.business.id }),
  ]);

  /* One pass so the badges and the summary notice cannot disagree. */
  const rows = CHANNELS.map((channel) => {
    const endpoint = channel.endpointKey
      ? readString(settings, channel.endpointKey, "").trim()
      : "";
    // The webhook has no separate switch — giving it a URL *is* turning it on.
    const enabled =
      channel.settingKey === "integrations.webhook_url"
        ? endpoint !== ""
        : readBoolean(settings, channel.settingKey);

    return {
      ...channel,
      enabled,
      entitled: ctx.entitlements.features.has(channel.featureSlug),
      /* Delivers when switched on and addressed. The REST API has nowhere to
         post to, so being on is the whole of it. */
      delivers: enabled && (channel.endpointKey === null || endpoint !== ""),
    };
  });

  const readyCount = rows.filter(
    (r) => r.endpointKey !== null && r.delivers,
  ).length;

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Integrations"
        description="Outbound channels and the API. A channel needs both a switch and an endpoint before anything leaves the building."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Integrations" },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/api/v1">API reference</Link>
          </Button>
        }
      />

      <Notice tone="info" title="How a message actually leaves">
        Every outbound message is queued first, so a slow provider never holds up
        a sale. The queue is drained by the worker, by a cron hitting{" "}
        <span className="font-mono text-xs">POST /api/jobs/tick</span>, or by hand
        from <Link href="/admin/jobs" className="underline">Admin → Background Jobs</Link>.
        No mail server is bundled: each channel posts to an HTTP API you supply
        below. Progress per message is under{" "}
        <Link href="/notifications/delivery" className="underline">
          Notifications → Delivery
        </Link>
        .
      </Notice>

      {readyCount === 0 ? (
        <Notice tone="warning">
          No outbound channel has an endpoint yet, so only in-app notifications
          reach anyone. Fill in an endpoint below for each channel you want
          delivered.
        </Notice>
      ) : null}

      <section className="overflow-hidden rounded-xs border border-border bg-card">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">Channels</h2>
        </header>
        <ul className="divide-y divide-border">
          {rows.map((channel) => (
            <li
              key={channel.name}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="text-sm font-medium">{channel.name}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {channel.purpose}
                </span>
              </span>

              {!channel.entitled ? (
                <Badge variant="soft-neutral">Not in your plan</Badge>
              ) : channel.enabled ? (
                <Badge variant="soft-success">On</Badge>
              ) : (
                <Badge variant="soft-neutral">Off</Badge>
              )}

              {channel.delivers ? (
                <Badge variant="soft-accent">Delivers</Badge>
              ) : channel.enabled ? (
                <Badge variant="soft-warning">Needs an endpoint</Badge>
              ) : (
                <Badge variant="soft-neutral">Not sending</Badge>
              )}
            </li>
          ))}
        </ul>
      </section>

      <SettingsPanel
        groups={groups}
        currencySymbol={currencySymbol(ctx.business.currency)}
      />
    </div>
  );
}
