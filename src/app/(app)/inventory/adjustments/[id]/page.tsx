import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";

import {
  Table,
  TableShell,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import {
  products,
  stockAdjustmentItems,
  stockAdjustments,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatMoney, formatQuantity, humanise } from "@/lib/format";
import { add, mul, toNumber } from "@/lib/money";

import { ApprovalButtons } from "./approval-buttons";

export const metadata: Metadata = { title: "Stock adjustment" };

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.adjust", {
    feature: "inventory.adjustment",
  });

  const [row] = await db
    .select({
      adjustment: stockAdjustments,
      warehouseName: warehouses.name,
      createdByName: users.full_name,
    })
    .from(stockAdjustments)
    .innerJoin(warehouses, eq(warehouses.id, stockAdjustments.warehouse_id))
    .leftJoin(users, eq(users.id, stockAdjustments.created_by))
    .where(
      and(
        eq(stockAdjustments.id, id),
        eq(stockAdjustments.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const { adjustment } = row;

  const items = await db
    .select({
      id: stockAdjustmentItems.id,
      quantity: stockAdjustmentItems.quantity,
      quantityBefore: stockAdjustmentItems.quantity_before,
      unitCost: stockAdjustmentItems.unit_cost,
      note: stockAdjustmentItems.note,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      unitShort: units.short_name,
    })
    .from(stockAdjustmentItems)
    .innerJoin(products, eq(products.id, stockAdjustmentItems.product_id))
    .leftJoin(units, eq(units.id, products.unit_id))
    .where(eq(stockAdjustmentItems.adjustment_id, id));

  const currency = ctx.business.currency;
  const canViewCost = hasPermission(ctx, "products.view_cost");
  const isPending = adjustment.approval_status === "pending";
  const isPosted = adjustment.posted_at !== null;

  const netChange = items.reduce((acc, i) => add(acc, String(i.quantity)), "0");
  const valueImpact = items.reduce(
    (acc, i) => add(acc, mul(String(i.quantity), String(i.unitCost))),
    "0",
  );

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title={adjustment.adjustment_number}
        description={`${row.warehouseName} · ${humanise(adjustment.reason)}`}
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: adjustment.adjustment_number },
        ]}
        actions={
          <>
            {isPending ? (
              <StatusBadge status="pending_approval" label="Awaiting approval" />
            ) : isPosted ? (
              <StatusBadge status="completed" label="Posted to ledger" />
            ) : (
              <StatusBadge status={adjustment.approval_status} />
            )}
            {isPending && hasPermission(ctx, "inventory.approve_adjustment") ? (
              <ApprovalButtons adjustmentId={adjustment.id} />
            ) : null}
          </>
        }
      />

      {isPending ? (
        <Notice tone="warning" title="Not yet applied to stock">
          This adjustment exceeded the approval threshold. Stock is unchanged until
          it is approved.
        </Notice>
      ) : null}

      {adjustment.approval_status === "rejected" ? (
        <Notice tone="danger" title="Rejected">
          This adjustment was rejected and never affected stock.
        </Notice>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-xs border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Raised by" value={row.createdByName ?? "—"} />
        <Detail label="Raised" value={formatDateTime(adjustment.created_at)} />
        <Detail
          label="Posted"
          value={adjustment.posted_at ? formatDateTime(adjustment.posted_at) : "—"}
        />
        <Detail
          label="Net change"
          value={`${toNumber(netChange) > 0 ? "+" : ""}${formatQuantity(netChange)}`}
          tone={
            toNumber(netChange) < 0
              ? "danger"
              : toNumber(netChange) > 0
                ? "success"
                : "neutral"
          }
        />
      </section>

      {adjustment.note ? (
        <div className="rounded-xs border border-border bg-card px-4 py-3">
          <div className="field-label">Note</div>
          <p className="mt-1 text-sm">{adjustment.note}</p>
        </div>
      ) : null}

      <TableShell>
        <Table>
          <THead>
            <TH>Product</TH>
            <TH align="right">Before</TH>
            <TH align="right">Change</TH>
            <TH align="right">After</TH>
            {canViewCost ? <TH align="right">Unit cost</TH> : null}
            {canViewCost ? <TH align="right">Value impact</TH> : null}
            <TH>Note</TH>
          </THead>
          <TBody>
            {items.map((item) => {
              const change = toNumber(item.quantity);
              const after = toNumber(item.quantityBefore) + change;
              return (
                <TR key={item.id}>
                  <TD>
                    <Link
                      href={`/products/${item.productId}`}
                      className="font-medium hover:text-accent hover:underline"
                    >
                      {item.productName}
                    </Link>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {item.productSku}
                    </div>
                  </TD>
                  <TD align="right" className="text-muted-foreground">
                    {formatQuantity(item.quantityBefore, { unit: item.unitShort })}
                  </TD>
                  <TD
                    align="right"
                    className={
                      change < 0
                        ? "font-semibold text-destructive"
                        : "font-semibold text-success"
                    }
                  >
                    {change > 0 ? "+" : ""}
                    {formatQuantity(item.quantity)}
                  </TD>
                  <TD align="right" className="font-medium">
                    {formatQuantity(String(after))}
                  </TD>
                  {canViewCost ? (
                    <TD align="right" className="text-muted-foreground">
                      {formatMoney(item.unitCost, { currency })}
                    </TD>
                  ) : null}
                  {canViewCost ? (
                    <TD align="right">
                      {formatMoney(mul(String(item.quantity), String(item.unitCost)), {
                        currency,
                      })}
                    </TD>
                  ) : null}
                  <TD className="text-muted-foreground">{item.note ?? "—"}</TD>
                </TR>
              );
            })}
          </TBody>
          {canViewCost ? (
            <TFoot>
              <TD colSpan={5} align="right">
                Total value impact
              </TD>
              <TD align="right">{formatMoney(valueImpact, { currency })}</TD>
              <TD />
            </TFoot>
          ) : null}
        </Table>
      </TableShell>
    </div>
  );
}

function Detail({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="field-label">{label}</div>
      <div
        className={
          tone === "danger"
            ? "mt-1 text-sm font-semibold text-destructive"
            : tone === "success"
              ? "mt-1 text-sm font-semibold text-success"
              : "mt-1 text-sm"
        }
      >
        {value}
      </div>
    </div>
  );
}
