import type { Metadata } from "next";
import { and, count, desc, eq, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { FilterBar, SelectFilter } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { notifications, users } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, humanise } from "@/lib/format";

export const metadata: Metadata = { title: "Notification delivery" };

type Channel = "in_app" | "email" | "sms" | "whatsapp" | "push" | "webhook";
type Status =
  | "queued"
  | "processing"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "cancelled";

export default async function NotificationDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("notifications.view_history");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const filters = [eq(notifications.tenant_id, ctx.business.id)];
  if (query.filters.channel) {
    filters.push(eq(notifications.channel, query.filters.channel as Channel));
  }
  if (query.filters.status) {
    filters.push(eq(notifications.status, query.filters.status as Status));
  }
  const where = and(...filters);

  const [rows, totalRow, summary] = await Promise.all([
    db
      .select({
        id: notifications.id,
        event: notifications.event,
        moduleSlug: notifications.module_slug,
        channel: notifications.channel,
        priority: notifications.priority,
        status: notifications.status,
        title: notifications.title,
        lastError: notifications.last_error,
        createdAt: notifications.created_at,
        sentAt: notifications.sent_at,
        readAt: notifications.read_at,
        recipientName: users.full_name,
      })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.user_id))
      .where(where)
      .orderBy(desc(notifications.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(notifications).where(where),

    db
      .select({
        total: sql<number>`count(*)::int`,
        delivered: sql<number>`count(*) filter (where ${notifications.status} in ('delivered','read','sent'))::int`,
        queued: sql<number>`count(*) filter (where ${notifications.status} = 'queued')::int`,
        failed: sql<number>`count(*) filter (where ${notifications.status} = 'failed')::int`,
        read: sql<number>`count(*) filter (where ${notifications.read_at} is not null)::int`,
      })
      .from(notifications)
      .where(eq(notifications.tenant_id, ctx.business.id)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = summary[0];
  const readRate =
    (stats?.delivered ?? 0) > 0
      ? Math.round(((stats?.read ?? 0) / (stats?.delivered ?? 1)) * 100)
      : 0;

  return (
    <div className="page">
      <PageHeader
        title="Delivery"
        description="Every notification raised, its channel and what happened to it. Records are append-only."
        breadcrumbs={[
          { label: "Notifications", href: "/notifications" },
          { label: "Delivery" },
        ]}
      />

      <StatGrid>
        <StatTile
          label="Raised"
          value={String(stats?.total ?? 0)}
          icon="Bell"
        />
        <StatTile
          label="Delivered"
          value={String(stats?.delivered ?? 0)}
          tone="success"
          icon="CircleCheck"
        />
        <StatTile
          label="Queued"
          value={String(stats?.queued ?? 0)}
          sublabel="Waiting on the queue"
          tone={(stats?.queued ?? 0) > 0 ? "warning" : "neutral"}
          icon="Hourglass"
          /* Not linked to /admin/jobs: seeing delivery history does not imply
             admin rights, and a link straight into a permission error is worse
             than no link. */
        />
        <StatTile
          label="Failed"
          value={String(stats?.failed ?? 0)}
          sublabel="Reason shown per row"
          tone={(stats?.failed ?? 0) > 0 ? "danger" : "neutral"}
          icon="CircleX"
        />
        <StatTile
          label="Read rate"
          value={`${readRate}%`}
          sublabel="Of delivered"
          icon="ChartColumn"
        />
      </StatGrid>

      <FilterBar>
        <SelectFilter
          paramName="channel"
          label="Channel"
          options={[
            { value: "in_app", label: "In-app" },
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
            { value: "whatsapp", label: "WhatsApp" },
            { value: "push", label: "Push" },
            { value: "webhook", label: "Webhook" },
          ]}
        />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "queued", label: "Queued" },
            { value: "sent", label: "Sent" },
            { value: "delivered", label: "Delivered" },
            { value: "read", label: "Read" },
            { value: "failed", label: "Failed" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Raised</TH>
            <TH>Event</TH>
            <TH>Recipient</TH>
            <TH>Channel</TH>
            <TH>Priority</TH>
            <TH>Detail</TH>
            <TH align="right">Status</TH>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>Nothing has been raised yet.</EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(row.createdAt)}
                  </TD>
                  <TD>
                    <span className="font-mono text-xs font-medium">
                      {row.event}
                    </span>
                    {row.moduleSlug ? (
                      <div className="text-[11px] text-muted-foreground">
                        {humanise(row.moduleSlug)}
                      </div>
                    ) : null}
                  </TD>
                  <TD className="text-muted-foreground">
                    {row.recipientName ?? "—"}
                  </TD>
                  <TD>
                    <Badge variant="soft-neutral">{humanise(row.channel)}</Badge>
                  </TD>
                  <TD>
                    {row.priority === "critical" ? (
                      <Badge variant="soft-destructive">Critical</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        {humanise(row.priority)}
                      </span>
                    )}
                  </TD>
                  <TD className="max-w-[260px] text-muted-foreground">
                    <div className="truncate">{row.title}</div>
                    {/* A failure without its reason is only half a record. */}
                    {row.lastError ? (
                      <div className="line-clamp-2 text-[11px] text-destructive">
                        {row.lastError}
                      </div>
                    ) : row.readAt ? (
                      <div className="text-[11px]">
                        Read {formatDateTime(row.readAt)}
                      </div>
                    ) : null}
                  </TD>
                  <TD align="right">
                    <StatusBadge status={row.status} />
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        <Pagination
          page={query.page}
          limit={query.limit}
          total={total}
          baseParams={{
            channel: query.filters.channel,
            status: query.filters.status,
          }}
        />
      </TableShell>
    </div>
  );
}
