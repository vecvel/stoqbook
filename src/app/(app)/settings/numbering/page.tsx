import type { Metadata } from "next";
import { and, asc, eq, isNull } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { numberSequences } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { DOCUMENT_TYPES, previewNumber } from "@/lib/services/numbering";
import { humanise } from "@/lib/format";

import { NumberingTable } from "./numbering-table";

export const metadata: Metadata = { title: "Document numbering" };

export default async function NumberingPage() {
  const ctx = await requirePermission("settings.numbering", {
    feature: "settings.numbering",
  });

  const rows = await db
    .select()
    .from(numberSequences)
    .where(
      and(
        eq(numberSequences.tenant_id, ctx.business.id),
        // Only tenant-wide sequences are edited here.
        isNull(numberSequences.store_id),
      ),
    )
    .orderBy(asc(numberSequences.document_type));

  const labelFor = (type: string) =>
    DOCUMENT_TYPES.find((d) => d.type === type)?.label ?? humanise(type);

  return (
    <div className="page">
      <PageHeader
        title="Document numbering"
        description="Prefixes, padding and reset rules for every document type."
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Numbering" },
        ]}
      />

      <Notice tone="info">
        Numbers are allocated atomically, so concurrent billing cannot produce
        duplicates. An issued number is never reused — the counter can be raised
        but not lowered.
      </Notice>

      <NumberingTable
        rows={rows.map((row) => ({
          id: row.id,
          documentType: row.document_type,
          label: labelFor(row.document_type),
          prefix: row.prefix,
          suffix: row.suffix,
          includePeriod: row.include_period,
          padding: row.padding,
          nextNumber: row.next_number,
          resetRule: row.reset_rule,
          currentPeriod: row.current_period,
          preview: previewNumber(row),
        }))}
      />
    </div>
  );
}
