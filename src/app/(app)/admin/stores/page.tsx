import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stores, licenses, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/authz/guard";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Store Licenses" };

export default async function AdminStoresPage() {
  const ctx = await requireAdmin("admin.license_manage");

  const rows = await db
    .select({
      id: stores.id,
      name: stores.name,
      city: stores.city,
      state: stores.state,
      isActive: stores.is_active,
      licenseStatus: licenses.status,
      planName: plans.name,
      expiresAt: licenses.expires_at,
    })
    .from(stores)
    .leftJoin(
      licenses,
      and(
        eq(licenses.store_id, stores.id),
        eq(licenses.is_current, true)
      )
    )
    .leftJoin(plans, eq(plans.id, licenses.plan_id))
    .where(
      and(eq(stores.tenant_id, ctx.business.id), isNull(stores.deleted_at)),
    )
    .orderBy(asc(stores.name));

  return (
    <div className="page">
      <PageHeader
        title="Store Licenses"
        description="Manage licenses and plans for all stores in the business."
        breadcrumbs={[
          { label: "Administration", href: "/admin" },
          { label: "Store Licenses" },
        ]}
      />

      <TableShell>
        <Table>
          <THead>
            <TR>
              <TH>Store</TH>
              <TH>Location</TH>
              <TH>Plan</TH>
              <TH>License Status</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5}>No stores found.</EmptyRow>
            ) : null}
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="font-medium">{row.name}</TD>
                <TD className="text-muted-foreground">
                  {[row.city, row.state].filter(Boolean).join(", ") || "—"}
                </TD>
                <TD>{row.planName ?? "Unlicensed"}</TD>
                <TD>
                  {row.licenseStatus ? (
                    <div className="flex flex-col gap-1">
                      <span className="capitalize">{row.licenseStatus}</span>
                      {row.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          Expires {formatDate(row.expiresAt)}
                        </span>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD align="right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/stores/${row.id}/license`}>
                      Manage Plan
                    </Link>
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableShell>
    </div>
  );
}
