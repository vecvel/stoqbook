import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import {
  products,
  stockAdjustments,
  stockCountItems,
  stockCounts,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime } from "@/lib/format";

import { CountSheet } from "./count-sheet";

export const metadata: Metadata = { title: "Stock count" };

export default async function StockCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.count", {
    feature: "inventory.count",
  });

  const [row] = await db
    .select({
      count: stockCounts,
      warehouseName: warehouses.name,
      createdByName: users.full_name,
      adjustmentNumber: stockAdjustments.adjustment_number,
      adjustmentId: stockAdjustments.id,
    })
    .from(stockCounts)
    .innerJoin(warehouses, eq(warehouses.id, stockCounts.warehouse_id))
    .leftJoin(users, eq(users.id, stockCounts.created_by))
    .leftJoin(stockAdjustments, eq(stockAdjustments.id, stockCounts.adjustment_id))
    .where(
      and(eq(stockCounts.id, id), eq(stockCounts.tenant_id, ctx.business.id)),
    )
    .limit(1);

  if (!row) notFound();
  const { count: stockCount } = row;

  const items = await db
    .select({
      id: stockCountItems.id,
      expected: stockCountItems.expected_quantity,
      counted: stockCountItems.counted_quantity,
      variance: stockCountItems.variance,
      note: stockCountItems.note,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      unitShort: units.short_name,
    })
    .from(stockCountItems)
    .innerJoin(products, eq(products.id, stockCountItems.product_id))
    .leftJoin(units, eq(units.id, products.unit_id))
    .where(eq(stockCountItems.count_id, id))
    .orderBy(asc(products.name));

  const countedLines = items.filter((i) => i.counted !== null).length;
  const varianceLines = items.filter(
    (i) => i.variance !== null && Number(i.variance) !== 0,
  );
  const netVariance = varianceLines.reduce(
    (acc, i) => acc + Number(i.variance),
    0,
  );

  const isClosed =
    stockCount.status === "approved" || stockCount.status === "cancelled";

  return (
    <div className="page">
      <PageHeader
        title={stockCount.count_number}
        description={[
          stockCount.name,
          row.warehouseName,
          row.createdByName ? `by ${row.createdByName}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Stock counts", href: "/inventory/counts" },
          { label: stockCount.count_number },
        ]}
        actions={<StatusBadge status={stockCount.status} />}
      />

      {stockCount.status === "approved" ? (
        <Notice tone="success" title="Count approved">
          {row.adjustmentNumber
            ? `Variance posted as adjustment ${row.adjustmentNumber}. Stock now matches the counted quantities.`
            : "No variance was found — recorded stock already matched the count."}
        </Notice>
      ) : (
        <Notice tone="info" title="Stock is unchanged until approval">
          Entering counted quantities records the variance only. Approving the
          count posts a single adjustment through the ledger.
        </Notice>
      )}

      <StatGrid>
        <StatTile
          label="Lines"
          value={String(items.length)}
          sublabel={`${countedLines} counted`}
          icon="ClipboardList"
        />
        <StatTile
          label="Variance lines"
          value={String(varianceLines.length)}
          tone={varianceLines.length > 0 ? "warning" : "success"}
          icon="AlertTriangle"
        />
        <StatTile
          label="Net variance"
          value={`${netVariance > 0 ? "+" : ""}${netVariance.toFixed(3).replace(/\.?0+$/, "")}`}
          sublabel="Units"
          tone={netVariance < 0 ? "danger" : netVariance > 0 ? "success" : "neutral"}
          icon="ArrowLeftRight"
        />
        <StatTile
          label="Started"
          value={
            stockCount.started_at
              ? formatDateTime(stockCount.started_at)
              : "—"
          }
          sublabel={
            stockCount.approved_at
              ? `Approved ${formatDateTime(stockCount.approved_at)}`
              : undefined
          }
          icon="CheckCircle2"
        />
      </StatGrid>

      <CountSheet
        countId={id}
        readOnly={isClosed}
        items={items.map((i) => ({
          id: i.id,
          productId: i.productId,
          name: i.productName,
          sku: i.productSku,
          unit: i.unitShort ?? "",
          expected: String(i.expected),
          counted: i.counted === null ? "" : String(Number(i.counted)),
          variance: i.variance === null ? null : String(Number(i.variance)),
          note: i.note,
        }))}
        canApprove={!isClosed && countedLines > 0}
      />
    </div>
  );
}
