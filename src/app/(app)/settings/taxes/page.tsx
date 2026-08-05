import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { taxGroups } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { currencySymbol, humanise } from "@/lib/format";

import { buildSettingGroups } from "../settings-data";
import { SettingsPanel } from "../settings-panel";

export const metadata: Metadata = { title: "Taxes" };

export default async function TaxSettingsPage() {
  const ctx = await requirePermission("settings.tax");

  const [groups, rows] = await Promise.all([
    buildSettingGroups(ctx, { groups: ["Tax"], scopes: ["business"] }),
    db
      .select()
      .from(taxGroups)
      .where(eq(taxGroups.tenant_id, ctx.business.id))
      .orderBy(asc(taxGroups.rate)),
  ]);

  const defaultGroup = rows.find((r) => r.is_default);

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Taxes"
        description="How tax is registered, calculated and shown. The rates themselves live in the product tax groups."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Taxes" },
        ]}
        actions={
          hasPermission(ctx, "products.manage_taxes") ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/products/taxes">Edit tax groups</Link>
            </Button>
          ) : null
        }
      />

      {!defaultGroup ? (
        <Notice tone="warning" title="No default tax group">
          A product with no tax group falls back to the default. Mark one of the
          groups below as default so tax is never silently skipped.
        </Notice>
      ) : null}

      <SettingsPanel
        groups={groups}
        currencySymbol={currencySymbol(ctx.business.currency)}
      />

      <section>
        <h2 className="section-title mb-2">Tax groups in use</h2>
        <TableShell>
          <Table>
            <THead>
              <TH>Group</TH>
              <TH>Mode</TH>
              <TH>Components</TH>
              <TH align="right">Rate</TH>
            </THead>
            <TBody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={4}>
                  No tax groups configured. Add them under Products → Tax groups.
                </EmptyRow>
              ) : (
                rows.map((group) => (
                  <TR key={group.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{group.name}</span>
                        {group.is_default ? (
                          <Badge variant="soft-neutral">Default</Badge>
                        ) : null}
                      </span>
                    </TD>
                    <TD className="text-muted-foreground">
                      {humanise(group.mode)}
                    </TD>
                    <TD className="text-muted-foreground">
                      {group.components.length === 0
                        ? "Single rate"
                        : group.components
                            .map((c) => `${c.name} ${c.rate}%`)
                            .join(" + ")}
                    </TD>
                    <TD align="right" className="tabular font-medium">
                      {Number(group.rate)}%
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
        <p className="mt-2 text-xs text-muted-foreground">
          Changing a rate affects future documents only. Historical invoices keep
          the rate that applied when they were raised.
        </p>
      </section>
    </div>
  );
}
