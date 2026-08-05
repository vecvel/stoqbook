import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

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
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import {
  auditLogs,
  branches,
  departments,
  designations,
  roles,
  salesInvoices,
  userRoles,
  users,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  humanise,
} from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";
import { sql } from "drizzle-orm";

import { EmployeeForm } from "../employee-form";
import { loadEmployeeFormOptions } from "../form-data";
import { EmployeeActions } from "./employee-actions";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("employees.view");

  const [row] = await db
    .select({
      user: users,
      storeName: branches.name,
      departmentName: departments.name,
      designationName: designations.name,
    })
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branch_id))
    .leftJoin(departments, eq(departments.id, users.department_id))
    .leftJoin(designations, eq(designations.id, users.designation_id))
    .where(and(eq(users.id, id), eq(users.tenant_id, ctx.business.id)))
    .limit(1);

  if (!row) notFound();
  const { user } = row;

  const canEdit = hasPermission(ctx, "employees.update");
  const isSelf = user.id === ctx.user.id;
  const currency = ctx.business.currency;

  const [assignedRoles, salesStats, activity, options, settings] =
    await Promise.all([
      db
        .select({
          id: roles.id,
          name: roles.name,
          description: roles.description,
          isOwner: roles.is_owner,
        })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.role_id))
        .where(eq(userRoles.user_id, id)),

      hasPermission(ctx, "reports.employees")
        ? db
            .select({
              count: sql<number>`count(*)::int`,
              revenue: sql<string>`coalesce(sum(${salesInvoices.grand_total}), 0)`,
            })
            .from(salesInvoices)
            .where(
              and(
                eq(salesInvoices.cashier_id, id),
                sql`${salesInvoices.status} <> 'cancelled'`,
              ),
            )
        : [],

      hasPermission(ctx, "reports.audit")
        ? db
            .select({
              id: auditLogs.id,
              event: auditLogs.event,
              summary: auditLogs.summary,
              module: auditLogs.module_slug,
              createdAt: auditLogs.created_at,
            })
            .from(auditLogs)
            .where(
              and(
                eq(auditLogs.tenant_id, ctx.business.id),
                eq(auditLogs.actor_id, id),
              ),
            )
            .orderBy(desc(auditLogs.created_at))
            .limit(40)
        : [],

      canEdit ? loadEmployeeFormOptions(ctx) : null,
      loadSettings({ businessId: ctx.business.id }),
    ]);

  const stats = salesStats[0];

  return (
    <div className="page">
      <PageHeader
        title={user.full_name}
        description={[
          user.employee_code,
          user.email,
          row.designationName,
          row.storeName,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Employees", href: "/employees" },
          { label: user.full_name },
        ]}
        actions={
          <>
            <StatusBadge status={user.status} />
            {!user.login_enabled ? (
              <Badge variant="soft-neutral">No portal access</Badge>
            ) : null}
            <EmployeeActions
              userId={id}
              userName={user.full_name}
              status={user.status}
              isSelf={isSelf}
              canSuspend={hasPermission(ctx, "employees.suspend")}
              canDelete={hasPermission(ctx, "employees.delete")}
              canInvite={hasPermission(ctx, "employees.invite")}
            />
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Roles"
          value={String(assignedRoles.length)}
          sublabel={
            assignedRoles.length > 0
              ? assignedRoles.map((r) => r.name).join(", ")
              : "None assigned"
          }
          tone={assignedRoles.length === 0 ? "warning" : "neutral"}
          icon="ShieldCheck"
        />
        <StatTile
          label="Joined"
          value={user.joining_date ? formatDate(user.joining_date) : "—"}
          sublabel={humanise(user.employment_type)}
          icon="IdCard"
        />
        <StatTile
          label="Last sign in"
          value={user.last_login_at ? formatDate(user.last_login_at) : "Never"}
          sublabel={user.login_enabled ? "Portal enabled" : "Portal disabled"}
          icon="CheckCircle2"
        />
        {stats ? (
          <StatTile
            label="Sales rung up"
            value={formatMoney(stats.revenue, { currency })}
            sublabel={`${stats.count} invoice${stats.count === 1 ? "" : "s"}`}
            tone="accent"
            icon="Receipt"
          />
        ) : null}
      </StatGrid>

      <Tabs defaultValue={canEdit ? "details" : "activity"}>
        <TabsList>
          {canEdit ? <TabsTrigger value="details">Details</TabsTrigger> : null}
          {activity.length > 0 ? (
            <TabsTrigger value="activity">Activity</TabsTrigger>
          ) : null}
        </TabsList>

        {canEdit && options ? (
          <TabsContent value="details" className="mt-3">
            <EmployeeForm
              values={{
                id: user.id,
                employeeCode: user.employee_code,
                fullName: user.full_name,
                email: user.email,
                phone: user.phone ?? "",
                gender: user.gender ?? "",
                dateOfBirth: user.date_of_birth
                  ? user.date_of_birth.toISOString().slice(0, 10)
                  : "",
                address: user.address ?? "",
                joiningDate: user.joining_date
                  ? user.joining_date.toISOString().slice(0, 10)
                  : "",
                employmentType: user.employment_type,
                departmentId: user.department_id ?? "",
                designationId: user.designation_id ?? "",
                storeId: user.branch_id ?? "",
                loginEnabled: user.login_enabled,
                status: user.status,
                roleIds: assignedRoles.map((r) => r.id),
              }}
              roles={options.roles}
              branches={options.branches}
              departments={options.departments}
              designations={options.designations}
              passwordMinLength={readNumber(
                settings,
                "security.password_min_length",
                8,
              )}
              canManageRoles={hasPermission(ctx, "employees.manage_roles")}
              isSelf={isSelf}
            />
          </TabsContent>
        ) : null}

        {activity.length > 0 ? (
          <TabsContent value="activity" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Event</TH>
                  <TH>Module</TH>
                  <TH>Detail</TH>
                </THead>
                <TBody>
                  {activity.length === 0 ? (
                    <EmptyRow colSpan={4}>No recorded activity.</EmptyRow>
                  ) : (
                    activity.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </TD>
                        <TD className="font-medium">{entry.event}</TD>
                        <TD className="text-muted-foreground">
                          {entry.module ? humanise(entry.module) : "—"}
                        </TD>
                        <TD className="text-muted-foreground">
                          {entry.summary ?? "—"}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
            <p className="mt-2 text-xs text-muted-foreground">
              Activity is drawn from the immutable audit log.
            </p>
          </TabsContent>
        ) : null}
      </Tabs>

      {!canEdit ? (
        <section className="grid gap-px overflow-hidden rounded-xs border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Employee code" value={user.employee_code} />
          <Detail label="Email" value={user.email} />
          <Detail label="Phone" value={user.phone ?? "—"} />
          <Detail label="Store" value={row.storeName ?? "—"} />
          <Detail label="Department" value={row.departmentName ?? "—"} />
          <Detail label="Designation" value={row.designationName ?? "—"} />
          <Detail
            label="Employment"
            value={humanise(user.employment_type)}
          />
          <Detail
            label="Roles"
            value={
              assignedRoles.length > 0
                ? assignedRoles.map((r) => r.name).join(", ")
                : "None"
            }
          />
        </section>
      ) : null}
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
