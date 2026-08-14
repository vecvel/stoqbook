import type { Metadata } from "next";
import Link from "next/link";

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
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatNumber } from "@/lib/format";
import { backupSummary } from "@/lib/services/backup";

export const metadata: Metadata = { title: "Backup" };

export default async function BackupPage() {
  const ctx = await requirePermission("settings.backup", {
    feature: "settings.backup",
  });

  const summary = await backupSummary(ctx);
  const populated = summary.filter((s) => s.rows > 0);
  const totalRows = summary.reduce((n, s) => n + s.rows, 0);
  const canRestore = hasPermission(ctx, "settings.restore");

  return (
    <div className="page">
      <PageHeader
        title="Backup"
        description="Take a copy of everything this business owns."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Backup" },
        ]}
        actions={
          <Button asChild variant="accent" size="sm">
            <Link href="/api/backup">Download backup</Link>
          </Button>
        }
      />

      <StatGrid>
        <StatTile
          label="Tables"
          value={String(populated.length)}
          sublabel={`of ${summary.length} with data`}
          icon="Blocks"
        />
        <StatTile
          label="Rows"
          value={formatNumber(totalRows)}
          tone="accent"
          icon="ScrollText"
        />
        <StatTile
          label="Business"
          value={ctx.business.slug}
          sublabel={ctx.business.name}
          icon="Store"
        />
      </StatGrid>

      <Notice tone="info" title="What the download contains">
        A JSON file with every row belonging to this business, written in
        foreign-key order. It carries no indexes, sequences or enum definitions,
        so it is a data export rather than a replacement for{" "}
        <code>pg_dump</code>. Take a real database dump as well if this is your
        only copy.
      </Notice>

      {canRestore ? (
        <Notice tone="warning" title="Restoring is a database operation">
          Restore is deliberately not offered here. Replaying rows one table at a
          time could leave <code>inventory_levels</code> and{" "}
          <code>customers.outstanding_balance</code> disagreeing with the ledgers
          that back them, which is the one guarantee this system will not risk.
          Restore into an empty database instead:
          <span className="mt-2 block font-mono text-[11px] leading-relaxed">
            npm run db:reset # recreates the schema
            <br />
            psql $DATABASE_URL -f your-dump.sql # or pg_restore for a custom dump
          </span>
        </Notice>
      ) : null}

      <section>
        <h2 className="section-title mb-2">Contents</h2>
        <TableShell>
          <Table>
            <THead>
              <TH>Table</TH>
              <TH align="right">Rows</TH>
            </THead>
            <TBody>
              {populated.length === 0 ? (
                <EmptyRow colSpan={2}>
                  Nothing to back up yet — this business has no data.
                </EmptyRow>
              ) : (
                populated.map((row) => (
                  <TR key={row.table}>
                    <TD mono>{row.table}</TD>
                    <TD align="right" className="tabular">
                      {formatNumber(row.rows)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableShell>
        <p className="mt-2 text-xs text-muted-foreground">
          Empty tables are omitted from this list but still appear in the file.
        </p>
      </section>
    </div>
  );
}
