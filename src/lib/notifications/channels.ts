import "server-only";

import { createHmac } from "node:crypto";

import { PermanentJobFailure } from "@/lib/jobs/types";

/**
 * Channel senders (16-notifications.md § Channels).
 *
 * One interface per channel so the queue does not care how a message leaves.
 * Every channel except in-app needs credentials the installation may not have;
 * an unconfigured channel fails **permanently** rather than retrying forever
 * against a provider that was never set up.
 */

export interface OutboundMessage {
  to: string;
  subject: string | null;
  title: string;
  body: string;
  actionUrl: string | null;
  event: string;
  priority: string;
}

export interface SenderConfig {
  /** Business-scoped settings, already loaded. */
  settings: Record<string, unknown>;
  businessName: string;
}

export interface Sender {
  /** Whether the installation has what it needs to send. */
  configured(config: SenderConfig): boolean;
  send(message: OutboundMessage, config: SenderConfig): Promise<void>;
}

function str(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "string" ? value.trim() : "";
}

function bool(settings: Record<string, unknown>, key: string): boolean {
  return settings[key] === true;
}

/* -------------------------------------------------------------------------- */
/* Email                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * SMTP is not bundled: adding a mail library and its transitive dependencies to
 * a self-hosted retail app for a feature most installations leave off is a poor
 * trade. Email goes out through whatever HTTP API the business configures.
 */
const emailSender: Sender = {
  configured(config) {
    return (
      bool(config.settings, "notifications.email_enabled") &&
      str(config.settings, "integrations.email_endpoint") !== ""
    );
  },

  async send(message, config) {
    const endpoint = str(config.settings, "integrations.email_endpoint");
    const apiKey = str(config.settings, "integrations.email_api_key");
    const from = str(config.settings, "integrations.email_from");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        from: from || undefined,
        to: message.to,
        subject: message.subject ?? message.title,
        text: [message.body, message.actionUrl].filter(Boolean).join("\n\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    await assertDelivered(response, "email");
  },
};

/* -------------------------------------------------------------------------- */
/* SMS and WhatsApp                                                           */
/* -------------------------------------------------------------------------- */

function messagingSender(
  channel: "sms" | "whatsapp",
  enabledKey: string,
  endpointKey: string,
  tokenKey: string,
): Sender {
  return {
    configured(config) {
      return (
        bool(config.settings, enabledKey) &&
        str(config.settings, endpointKey) !== ""
      );
    },

    async send(message, config) {
      const endpoint = str(config.settings, endpointKey);
      const token = str(config.settings, tokenKey);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel,
          to: message.to,
          // SMS has no subject and a hard length limit in practice, so the
          // title and body are joined rather than sent as separate fields.
          message: [message.title, message.body].filter(Boolean).join(" — "),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      await assertDelivered(response, channel);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Webhook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Signed POST, per 39-webhooks.md. The timestamp is inside the signed payload
 * so a captured request cannot be replayed later.
 */
const webhookSender: Sender = {
  configured(config) {
    return str(config.settings, "integrations.webhook_url") !== "";
  },

  async send(message, config) {
    const url = str(config.settings, "integrations.webhook_url");
    const secret = str(config.settings, "integrations.webhook_secret");

    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      event: message.event,
      occurredAt: new Date(timestamp * 1000).toISOString(),
      business: config.businessName,
      data: {
        title: message.title,
        body: message.body,
        actionUrl: message.actionUrl,
        priority: message.priority,
      },
    });

    const signature = secret
      ? createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
      : null;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-stoqbook-event": message.event,
        "x-stoqbook-timestamp": String(timestamp),
        ...(signature ? { "x-stoqbook-signature": `sha256=${signature}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    await assertDelivered(response, "webhook");
  },
};

/* -------------------------------------------------------------------------- */

/**
 * Classifies the response.
 *
 * A 4xx other than 408/429 will still be a 4xx in two hours, so it is permanent
 * and must not consume retries. Everything else is treated as transient.
 */
async function assertDelivered(
  response: Response,
  channel: string,
): Promise<void> {
  if (response.ok) return;

  const retryable =
    response.status === 408 || response.status === 429 || response.status >= 500;
  const detail = `${channel} provider returned ${response.status}`;

  if (retryable) throw new Error(detail);
  throw new PermanentJobFailure(detail);
}

const SENDERS: Record<string, Sender> = {
  email: emailSender,
  sms: messagingSender(
    "sms",
    "notifications.sms_enabled",
    "integrations.sms_endpoint",
    "integrations.sms_api_key",
  ),
  whatsapp: messagingSender(
    "whatsapp",
    "notifications.whatsapp_enabled",
    "integrations.whatsapp_endpoint",
    "integrations.whatsapp_api_key",
  ),
  webhook: webhookSender,
};

export function senderFor(channel: string): Sender | null {
  return SENDERS[channel] ?? null;
}
