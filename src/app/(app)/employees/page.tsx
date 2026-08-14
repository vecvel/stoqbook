import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Plus } from "lucide-react";

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
import { EmptyState, Notice } from "@/components/shared/empty-state";
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  stores,
  departments,
  designations,
  roles,
  userRoles,
  users,
} from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, initials } from "@/lib/format";
import { limitFor } from "@/lib/authz/entitlements";
import { loadSettings, readNumber } from "@/lib/services/settings";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("employees.view");
  const params = await searchParams;

  const settings = await loadSettings({ businessId: ctx.business.id });
  const query = parseListQuery(params, {
    defaultLimit: readNumber(settings, "general.page_size", 25),
  });

  const filters = [
    eq(users.tenant_id, ctx.business.id),
    isNull(users.deleted_at),
  ];

  if (query.search) {
    const term = `%${query.search}%`;
    filters.push(
      or(
        ilike(users.full_name, term),
        ilike(users.email, term),
        ilike(users.employee_code, term),
        ilike(users.phone, term),
      )!,
    );
  }
  if (query.filters.status) {
    filters.push(
      eq(users.status, query.filters.status as typeof users.$inferSelect.status),
    );
  } else {
    filters.push(sql`${users.status} <> 'archived'`);
  }
  if (query.filters.store) {
    filters.push(eq(users.store_id, query.filters.store));
  }
  if (query.filters.department) {
    filters.push(eq(users.department_id, query.filters.department));
  }

  const where = and(...filters);

  // The role-name subquery joins two tables, so its aggregate argument is
  // spelled out rather than interpolated — a bare column would be ambiguous.
  const roleName = sql.raw('"roles"."name"');

  const [rows, totalRow, aggregate, departmentOptions] = await Promise.all([
    db
      .select({
        id: users.id,
        code: users.employee_code,
        fullName: users.full_name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        loginEnabled: users.login_enabled,
        employmentType: users.employment_type,
        joiningDate: users.joining_date,
        lastLoginAt: users.last_login_at,
        storeName: stores.name,
        departmentName: departments.name,
        designationName: designations.name,
        roleNames: sql<string>`(${db
          .select({
            v: sql`coalesce(string_agg(${roleName}, ', ' order by ${roleName}), '')`,
          })
          .from(userRoles)
          .innerJoin(roles, eq(roles.id, userRoles.role_id))
          .where(eq(userRoles.user_id, users.id))})`,
      })
      .from(users)
      .leftJoin(stores, eq(stores.id, users.store_id))
      .leftJoin(departments, eq(departments.id, users.department_id))
      .leftJoin(designations, eq(designations.id, users.designation_id))
      .where(where)
      .orderBy(asc(users.full_name))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(users).where(where),

    db
      .select({
        active: sql<number>`count(*) filter (where ${users.status} = 'active')::int`,
        suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')::int`,
        withLogin: sql<number>`count(*) filter (where ${users.login_enabled} = true)::int`,
        all: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(
        and(eq(users.tenant_id, ctx.business.id), isNull(users.deleted_at)),
      ),

    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.tenant_id, ctx.business.id))
      .orderBy(asc(departments.name)),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = aggregate[0];

  const employeeLimit = limitFor(ctx.entitlements, "max_employees");
  const atLimit =
    employeeLimit !== null && (stats?.all ?? 0) >= employeeLimit;

  const baseParams = {
    search: query.search,
    status: query.filters.status,
    store: query.filters.store,
    department: query.filters.department,
  };
  const isFiltered = Object.values(baseParams).some(Boolean);

  return (
    <div className="page">
      <PageHeader
        title="Employees"
        description={`${total} record${total === 1 ? "" : "s"}`}
        actions={
          <>
            {hasPermission(ctx, "employees.manage_roles") ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/employees/roles">Roles &amp; permissions</Link>
              </Button>
            ) : null}
            {hasPermission(ctx, "employees.create") && !atLimit ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/employees/new" className="gap-1.5">
                  <Plus className="size-3.5" />
                  New employee
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {atLimit ? (
        <Notice
          tone="warning"
          title={`Employee limit reached (${employeeLimit})`}
          action={
            <Button asChild size="sm" variant="accent">
              <Link href="/settings/license">Upgrade plan</Link>
            </Button>
          }
        >
          Your {ctx.entitlements.plan?.name} plan allows {employeeLimit} employees.
          Upgrade to add more.
        </Notice>
      ) : null}

      <StatGrid>
        <StatTile label="Total" value={String(stats?.all ?? 0)} icon="IdCard" />
        <StatTile
          label="Active"
          value={String(stats?.active ?? 0)}
          tone="success"
          icon="CheckCircle2"
        />
        <StatTile
          label="Suspended"
          value={String(stats?.suspended ?? 0)}
          tone={(stats?.suspended ?? 0) > 0 ? "danger" : "neutral"}
          icon="AlertTriangle"
        />
        <StatTile
          label="With portal access"
          value={String(stats?.withLogin ?? 0)}
          sublabel={
            employeeLimit === null
              ? "Unlimited seats"
              : `${stats?.all ?? 0} of ${employeeLimit} seats`
          }
          icon="ShieldCheck"
        />
      </StatGrid>

      <FilterBar>
        <SearchFilter placeholder="Search name, code, email or phone…" />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "pending", label: "Pending" },
            { value: "suspended", label: "Suspended" },
            { value: "resigned", label: "Resigned" },
            { value: "archived", label: "Archived" },
          ]}
        />
        {ctx.stores.length > 1 ? (
          <SelectFilter
            paramName="store"
            label="Store"
            options={ctx.stores.map((b) => ({ value: b.id, label: b.name }))}
          />
        ) : null}
        {departmentOptions.length > 0 ? (
          <SelectFilter
            paramName="department"
            label="Department"
            options={departmentOptions.map((d) => ({
              value: d.id,
              label: d.name,
            }))}
          />
        ) : null}
        <ResetFilters />
      </FilterBar>

      {total === 0 && !isFiltered ? (
        <EmptyState
          icon="IdCard"
          title="No employees yet"
          description="Add your team and assign roles. Permissions come entirely from roles — nothing is granted directly to a person."
          action={
            hasPermission(ctx, "employees.create")
              ? { label: "Add an employee", href: "/employees/new" }
              : undefined
          }
        />
      ) : (
        <TableShell>
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH>Code</TH>
              <TH>Roles</TH>
              <TH>Store</TH>
              <TH>Department</TH>
              <TH>Joined</TH>
              <TH>Access</TH>
              <TH align="right">Status</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8}>No employees match these filters.</EmptyRow>
              ) : (
                rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bark text-[10px] font-semibold text-parchment">
                          {initials(row.fullName)}
                        </span>
                        <span className="min-w-0">
                          <Link
                            href={`/employees/${row.id}`}
                            className="block truncate font-medium hover:text-accent hover:underline"
                          >
                            {row.fullName}
                          </Link>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {row.email}
                          </span>
                        </span>
                      </div>
                    </TD>
                    <TD mono>{row.code}</TD>
                    <TD className="max-w-[200px]">
                      {row.roleNames ? (
                        <span className="text-xs">{row.roleNames}</span>
                      ) : (
                        <Badge variant="soft-warning">No role</Badge>
                      )}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.storeName ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.departmentName ?? row.designationName ?? "—"}
                    </TD>
                    <TD className="text-muted-foreground">
                      {row.joiningDate ? formatDate(row.joiningDate) : "—"}
                    </TD>
                    <TD>
                      {row.loginEnabled ? (
                        <span className="text-xs text-muted-foreground">
                          {row.lastLoginAt
                            ? `Last in ${formatDate(row.lastLoginAt)}`
                            : "Never signed in"}
                        </span>
                      ) : (
                        <Badge variant="soft-neutral">No portal</Badge>
                      )}
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
            baseParams={baseParams}
          />
        </TableShell>
      )}
    </div>
  );
}
