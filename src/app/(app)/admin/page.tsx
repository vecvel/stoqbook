import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";

import {
  EmptyRow,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  auditLogs,
  branches,
  products,
  salesInvoices,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDate, formatDateTime, formatMoneyCompact, humanise } from "@/lib/format";
import { queueStats } from "@/lib/jobs";
import { ALL_FEATURES, ALL_PERMISSIONS, ALL_MODULES } from "@/lib/registry";

import { BusinessStatusActions } from "./business-status";

export const metadata: Metadata = { title: "Administration" };

export default async function AdminOverviewPage() {
  const ctx = await requireAdmin("admin.panel");
  const businessId = ctx.business.id;
  const { entitlements } = ctx;

  const [counts, recentEvents, queue] = await Promise.all([
    db
      .select({
        stores: sql<number>`(select count(*)::int from ${branches}
          where ${branches.tenant_id} = ${businessId} and ${branches.deleted_at} is null)`,
        users: sql<number>`(select count(*)::int from ${users}
          where ${users.tenant_id} = ${businessId} and ${users.deleted_at} is null)`,
        products: sql<number>`(select count(*)::int from ${products}
          where ${products.tenant_id} = ${businessId} and ${products.deleted_at} is null)`,
        invoices: sql<number>`(select count(*)::int from ${salesInvoices}
          where ${salesInvoices.tenant_id} = ${businessId})`,
        /* Cutoff computed by Postgres rather than read from the JS clock: one
           clock instead of two, and it keeps the render pure. */
        recentInvoices: sql<number>`(select count(*)::int from ${salesInvoices}
          where ${salesInvoices.tenant_id} = ${businessId}
            and ${salesInvoices.invoice_date} >= now() - interval '30 days')`,
        revenue: sql<string>`(select coalesce(sum(${salesInvoices.grand_total}), 0) from ${salesInvoices}
          where ${salesInvoices.tenant_id} = ${businessId}
            and ${salesInvoices.status} <> 'cancelled')`,
      })
      .from(branches)
      .limit(1),

    db
      .select({
        id: auditLogs.id,
        event: auditLogs.event,
        summary: auditLogs.summary,
        actorName: auditLogs.actor_name,
        actorType: auditLogs.actor_type,
        createdAt: auditLogs.created_at,
        moduleSlug: auditLogs.module_slug,
      })
      .from(auditLogs)
      .where(eq(auditLogs.tenant_id, businessId))
      .orderBy(desc(auditLogs.created_at))
      .limit(12),

    queueStats(businessId),
  ]);

  const totals = counts[0];
  const licence = entitlements.license;
  const plan = entitlements.plan;

  const overrideCount =
    Object.keys(licence?.module_overrides ?? {}).length +
    Object.keys(licence?.feature_overrides ?? {}).length +
    Object.keys(licence?.limit_overrides ?? {}).length;

  return (
    <div className="page">
      <PageHeader
        title="Administration"
        description={`Licence, registry and audit trail for ${ctx.business.name}.`}
        actions={
          <>
            <StatusBadge status={ctx.business.status} />
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/license">Manage licence</Link>
            </Button>
            <BusinessStatusActions
              businessName={ctx.business.name}
              status={ctx.business.status}
            />
          </>
        }
      />

      {ctx.business.status === "suspended" ? (
        <Notice tone="danger" title="This business is suspended">
          {ctx.business.suspended_reason ?? "No reason was recorded."} Everyone
          except this panel is locked out until it is reactivated. All data is
          intact.
        </Notice>
      ) : ctx.business.status === "archived" ? (
        <Notice tone="warning" title="This business is archived">
          The installation is read-only. Reactivate it to resume trading — no
          data has been removed.
        </Notice>
      ) : !entitlements.isValid ? (
        <Notice tone="danger" title="Licence not active">
          {entitlements.invalidReason}{" "}
          <Link href="/admin/license" className="underline">
            Fix the licence
          </Link>{" "}
          to restore access to operational screens.
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile
          label="Plan"
          value={plan?.name ?? "None"}
          sublabel={licence ? humanise(licence.billing_mode) : "No licence"}
          tone="accent"
          icon="KeyRound"
          href="/admin/license"
        />
        <StatTile
          label="Licence"
          value={licence ? humanise(licence.status) : "—"}
          sublabel={
            entitlements.daysRemaining === null
              ? "Never expires"
              : `${entitlements.daysRemaining} days left`
          }
          tone={entitlements.isValid ? "success" : "danger"}
          icon="ShieldCheck"
          href="/admin/license"
        />
        <StatTile
          label="Stores"
          value={String(totals?.stores ?? 0)}
          icon="Store"
          href="/settings/stores"
        />
        <StatTile
          label="Users"
          value={String(totals?.users ?? 0)}
          icon="Users"
          href="/employees"
        />
        <StatTile
          label="Products"
          value={String(totals?.products ?? 0)}
          icon="Package"
          href="/products"
        />
        <StatTile
          label="Invoices"
          value={String(totals?.invoices ?? 0)}
          sublabel={`${totals?.recentInvoices ?? 0} in 30 days`}
          icon="Receipt"
          href="/sales"
        />
        <StatTile
          label="Revenue recorded"
          value={formatMoneyCompact(totals?.revenue ?? "0", ctx.business.currency)}
          sublabel="Excluding cancelled"
          tone="success"
          icon="Coins"
        />
        <StatTile
          label="Registry"
          value={`${ALL_MODULES.length} modules`}
          sublabel={`${ALL_FEATURES.length} features · ${ALL_PERMISSIONS.length} permissions`}
          icon="Blocks"
          href="/admin/registry"
        />
        {/* Queue health belongs on the overview: nothing else on this page tells
            an owner that notifications stopped going out an hour ago. */}
        <StatTile
          label="Job queue"
          value={
            queue.failed > 0
              ? `${queue.failed} failed`
              : queue.pending > 0
                ? `${queue.pending} waiting`
                : "Clear"
          }
          sublabel={
            queue.oldestPendingSeconds > 900
              ? `Oldest waiting ${Math.round(queue.oldestPendingSeconds / 60)}m`
              : `${queue.completed24h} done in 24h`
          }
          tone={
            queue.failed > 0
              ? "danger"
              : queue.oldestPendingSeconds > 900
                ? "warning"
                : "success"
          }
          icon="Activity"
          href="/admin/jobs"
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid gap-px overflow-hidden rounded-xs border border-border bg-border sm:grid-cols-2">
          <Detail label="Business" value={ctx.business.name} />
          <Detail label="Installation id" value={ctx.business.slug} />
          <Detail label="Country" value={ctx.business.country} />
          <Detail label="Currency" value={ctx.business.currency} />
          <Detail label="Time zone" value={ctx.business.timezone} />
          <Detail
            label="Set up on"
            value={
              ctx.business.setup_completed_at
                ? formatDate(ctx.business.setup_completed_at)
                : "Unknown"
            }
          />
          <Detail
            label="Modules enabled"
            value={`${entitlements.modules.size} of ${ALL_MODULES.length}`}
          />
          <Detail
            label="Licence overrides"
            value={overrideCount > 0 ? String(overrideCount) : "None"}
          />
        </section>

        <section className="overflow-hidden rounded-xs border border-border bg-card">
          <header className="border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold">Administration</h2>
          </header>
          <ul className="divide-y divide-border">
            <AdminLink
              href="/admin/jobs"
              label="Background jobs"
              hint="Delivery, schedules and ledger checks"
            />
            <AdminLink
              href="/admin/license"
              label="Licence"
              hint="Plan, expiry, overrides and history"
            />
            <AdminLink
              href="/admin/plans"
              label="Plans"
              hint="Define what a licence may grant"
            />
            <AdminLink
              href="/admin/registry"
              label="Module registry"
              hint="Modules, features and permissions"
            />
            <AdminLink
              href="/admin/flags"
              label="Feature flags"
              hint="Switch capability off without a licence change"
            />
            <AdminLink
              href="/admin/announcements"
              label="Announcements"
              hint="Notices shown to everyone signed in"
            />
            <AdminLink
              href="/admin/audit"
              label="Audit log"
              hint="Every recorded event, with actor and address"
            />
            <AdminLink
              href="/settings/stores"
              label="Stores"
              hint="Create and deactivate stores"
            />
          </ul>
        </section>
      </div>

      <section className="overflow-hidden rounded-xs border border-border bg-card">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Button asChild variant="ghost" size="xs">
            <Link href="/admin/audit">Full audit log</Link>
          </Button>
        </header>
        <TableShell className="rounded-none border-0">
          <Table>
            <THead>
              <TH>When</TH>
              <TH>Event</TH>
              <TH>Module</TH>
              <TH>Actor</TH>
              <TH>Detail</TH>
            </THead>
            <TBody>
              {recentEvents.length === 0 ? (
                <EmptyRow colSpan={5}>No activity recorded.</EmptyRow>
              ) : (
                recentEvents.map((event) => (
                  <TR key={event.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </TD>
                    <TD className="font-medium">{event.event}</TD>
                    <TD className="text-muted-foreground">
                      {event.moduleSlug ? humanise(event.moduleSlug) : "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {event.actorName ?? humanise(event.actorType)}
                    </TD>
                    <TD className="max-w-[320px] truncate text-muted-foreground">
                      {event.summary ?? "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="field-label">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function AdminLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-baseline justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
      >
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </Link>
    </li>
  );
}
