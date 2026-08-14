import type { Metadata } from "next";
import { and, count, desc, eq, isNull } from "drizzle-orm";

import { EmptyState } from "@/components/shared/empty-state";
import {
  FilterBar,
  ResetFilters,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { requirePermission } from "@/lib/authz/guard";
import { formatRelative, humanise } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MarkAllRead, NotificationRow } from "./notification-actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("notifications.view");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 30 });

  const filters = [
    eq(notifications.tenant_id, ctx.business.id),
    eq(notifications.user_id, ctx.user.id),
    eq(notifications.channel, "in_app"),
    isNull(notifications.archived_at),
  ];

  if (query.filters.state === "unread") {
    filters.push(isNull(notifications.read_at));
  }
  if (query.filters.priority) {
    filters.push(
      eq(
        notifications.priority,
        query.filters.priority as typeof notifications.$inferSelect.priority,
      ),
    );
  }
  if (query.filters.module) {
    filters.push(eq(notifications.module_slug, query.filters.module));
  }

  const where = and(...filters);

  const [rows, totalRow, unreadRow] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.created_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(notifications).where(where),

    db
      .select({ value: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenant_id, ctx.business.id),
          eq(notifications.user_id, ctx.user.id),
          eq(notifications.channel, "in_app"),
          isNull(notifications.read_at),
          isNull(notifications.archived_at),
        ),
      ),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const unread = Number(unreadRow[0]?.value ?? 0);

  const baseParams = {
    state: query.filters.state,
    priority: query.filters.priority,
    module: query.filters.module,
  };

  return (
    <div className="page">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} unread of ${total}`
            : `${total} notification${total === 1 ? "" : "s"}`
        }
        actions={unread > 0 ? <MarkAllRead /> : null}
      />

      <FilterBar>
        <SelectFilter
          paramName="state"
          label="Show"
          allLabel="All"
          options={[{ value: "unread", label: "Unread only" }]}
        />
        <SelectFilter
          paramName="priority"
          label="Priority"
          options={[
            { value: "critical", label: "Critical" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <SelectFilter
          paramName="module"
          label="Module"
          options={[
            { value: "inventory", label: "Inventory" },
            { value: "sales", label: "Sales" },
            { value: "purchases", label: "Purchases" },
            { value: "customers", label: "Customers" },
            { value: "employees", label: "Employees" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon="Bell"
          title={
            query.filters.state === "unread"
              ? "Nothing unread"
              : "No notifications"
          }
          description="Alerts appear here automatically — low stock, approvals awaiting you, and other business events."
        />
      ) : (
        <div className="overflow-hidden rounded-xs border border-border bg-card">
          <ul className="divide-y divide-border">
            {rows.map((notification) => (
              <li
                key={notification.id}
                className={cn(
                  "transition-colors",
                  !notification.read_at && "bg-accent/5",
                )}
              >
                <NotificationRow
                  id={notification.id}
                  isRead={Boolean(notification.read_at)}
                  actionUrl={notification.action_url}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        notification.priority === "critical"
                          ? "bg-destructive"
                          : notification.priority === "high"
                            ? "bg-warning"
                            : notification.read_at
                              ? "bg-border"
                              : "bg-accent",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            notification.read_at ? "font-medium" : "font-semibold",
                          )}
                        >
                          {notification.title}
                        </span>
                        {notification.priority === "critical" ||
                        notification.priority === "high" ? (
                          <StatusBadge status={notification.priority} />
                        ) : null}
                        {notification.module_slug ? (
                          <Badge variant="soft-neutral">
                            {humanise(notification.module_slug)}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatRelative(notification.created_at)}
                        {notification.event ? ` · ${notification.event}` : ""}
                      </p>
                    </div>
                  </div>
                </NotificationRow>
              </li>
            ))}
          </ul>
          <Pagination
            page={query.page}
            limit={query.limit}
            total={total}
            baseParams={baseParams}
          />
        </div>
      )}
    </div>
  );
}
