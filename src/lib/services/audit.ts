import "server-only";

import { headers } from "next/headers";

import { db, type DbClient } from "@/db";
import { auditLogs } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";

/**
 * Audit service. Records are append-only and never updated or deleted
 * (19-business-rules.md § Audit Rules).
 */

export interface AuditInput {
  event: string;
  moduleSlug?: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  payload?: Record<string, unknown>;
  storeId?: string | null;
}

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip:
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null,
      userAgent: h.get("user-agent") ?? null,
    };
  } catch {
    // Outside a request scope (seeds, jobs).
    return { ip: null, userAgent: null };
  }
}

/** Records a business event performed by a signed-in user. */
export async function auditEvent(
  ctx: BusinessContext,
  input: AuditInput,
  client: DbClient = db,
): Promise<void> {
  const meta = await requestMeta();
  await client.insert(auditLogs).values({
    tenant_id: ctx.business.id,
    branch_id: input.storeId ?? ctx.activeStore?.id ?? null,
    actor_id: ctx.user.id,
    actor_name: ctx.user.full_name,
    actor_type: "user",
    event: input.event,
    module_slug: input.moduleSlug ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    summary: input.summary ?? null,
    payload: input.payload ?? {},
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
}

/**
 * Records an administrative event from the business admin panel.
 *
 * Identical to `auditEvent` apart from defaulting the module to `admin`, which
 * is what the audit-log filter groups on.
 */
export async function auditAdmin(
  ctx: BusinessContext,
  input: AuditInput,
  client: DbClient = db,
): Promise<void> {
  return auditEvent(ctx, { ...input, moduleSlug: input.moduleSlug ?? "admin" }, client);
}

/** Records an event with no authenticated actor, e.g. first-run setup. */
export async function auditSystem(
  input: AuditInput & { businessId?: string | null; actorName?: string },
  client: DbClient = db,
): Promise<void> {
  const meta = await requestMeta();
  await client.insert(auditLogs).values({
    tenant_id: input.businessId ?? null,
    actor_name: input.actorName ?? "system",
    actor_type: "system",
    event: input.event,
    module_slug: input.moduleSlug ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    summary: input.summary ?? null,
    payload: input.payload ?? {},
    ip_address: meta.ip,
    user_agent: meta.userAgent,
  });
}

/**
 * Builds a shallow before/after diff so audit payloads stay small and readable
 * instead of storing entire row snapshots.
 */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  ignore: string[] = ["updated_at", "created_at", "updated_by", "created_by"],
): Record<string, { from: unknown; to: unknown }> {
  const result: Record<string, { from: unknown; to: unknown }> = {};
  if (!after) return result;

  const skip = new Set(ignore);
  for (const [key, value] of Object.entries(after)) {
    if (skip.has(key)) continue;
    const previous = before?.[key];
    const changed =
      previous instanceof Date || value instanceof Date
        ? String(previous) !== String(value)
        : JSON.stringify(previous ?? null) !== JSON.stringify(value ?? null);
    if (changed) result[key] = { from: previous ?? null, to: value ?? null };
  }
  return result;
}
