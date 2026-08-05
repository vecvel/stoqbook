import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { and, eq } from "drizzle-orm";

import {
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
import { StatusBadge } from "@/components/shared/status-badge";
import { db } from "@/db";
import {
  products,
  stockTransferItems,
  stockTransfers,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDateTime, formatQuantity } from "@/lib/format";

import { TransferStageButtons } from "./transfer-stage-buttons";

export const metadata: Metadata = { title: "Stock transfer" };

const STAGES = [
  { key: "draft", label: "Draft" },
  { key: "approved", label: "Approved" },
  { key: "in_transit", label: "In transit" },
  { key: "completed", label: "Completed" },
];

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("inventory.transfer", {
    feature: "inventory.transfer",
  });

  const source = alias(warehouses, "source_wh");
  const destination = alias(warehouses, "destination_wh");
  const approver = alias(users, "approver");
  const receiver = alias(users, "receiver");

  const [row] = await db
    .select({
      transfer: stockTransfers,
      sourceName: source.name,
      destinationName: destination.name,
      approverName: approver.full_name,
      receiverName: receiver.full_name,
    })
    .from(stockTransfers)
    .innerJoin(source, eq(source.id, stockTransfers.source_warehouse_id))
    .innerJoin(
      destination,
      eq(destination.id, stockTransfers.destination_warehouse_id),
    )
    .leftJoin(approver, eq(approver.id, stockTransfers.approved_by))
    .leftJoin(receiver, eq(receiver.id, stockTransfers.received_by))
    .where(
      and(
        eq(stockTransfers.id, id),
        eq(stockTransfers.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);

  if (!row) notFound();
  const { transfer } = row;

  const items = await db
    .select({
      id: stockTransferItems.id,
      requested: stockTransferItems.quantity_requested,
      dispatched: stockTransferItems.quantity_dispatched,
      received: stockTransferItems.quantity_received,
      note: stockTransferItems.note,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
      unitShort: units.short_name,
    })
    .from(stockTransferItems)
    .innerJoin(products, eq(products.id, stockTransferItems.product_id))
    .leftJoin(units, eq(units.id, products.unit_id))
    .where(eq(stockTransferItems.transfer_id, id));

  const currentStageIndex = STAGES.findIndex((s) => s.key === transfer.status);

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title={transfer.transfer_number}
        description={`${row.sourceName} → ${row.destinationName}`}
        breadcrumbs={[
          { label: "Inventory", href: "/inventory" },
          { label: "Transfers", href: "/inventory/transfers" },
          { label: transfer.transfer_number },
        ]}
        actions={
          <>
            <StatusBadge status={transfer.status} />
            <TransferStageButtons
              transferId={id}
              status={transfer.status}
              canApprove={hasPermission(ctx, "inventory.approve_transfer")}
              canDispatch={hasPermission(ctx, "inventory.transfer")}
              canReceive={hasPermission(ctx, "inventory.receive_transfer")}
            />
          </>
        }
      />

      {/* Lifecycle progress */}
      <ol className="flex flex-wrap items-center gap-1 rounded-xs border border-border bg-card px-4 py-3">
        {STAGES.map((stage, index) => {
          const done = currentStageIndex >= index && currentStageIndex !== -1;
          const active = currentStageIndex === index;
          return (
            <li key={stage.key} className="flex items-center gap-1">
              {index > 0 ? (
                <span className="mx-1 h-px w-6 bg-border" aria-hidden />
              ) : null}
              <span
                className={
                  active
                    ? "rounded-xs bg-accent px-2 py-1 text-xs font-semibold text-accent-foreground"
                    : done
                      ? "rounded-xs bg-success/15 px-2 py-1 text-xs font-medium text-success"
                      : "rounded-xs px-2 py-1 text-xs text-muted-foreground"
                }
              >
                {stage.label}
              </span>
            </li>
          );
        })}
        {transfer.status === "cancelled" ? (
          <li className="ml-2">
            <StatusBadge status="cancelled" />
          </li>
        ) : null}
      </ol>

      {transfer.status === "in_transit" ? (
        <Notice tone="info" title="Goods are in transit">
          The quantities have left {row.sourceName} and are booked as in-transit
          stock at {row.destinationName}. They become sellable once received.
        </Notice>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-xs border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Detail label="Created" value={formatDateTime(transfer.created_at)} />
        <Detail
          label="Approved"
          value={
            transfer.approved_at
              ? `${formatDateTime(transfer.approved_at)}${row.approverName ? ` · ${row.approverName}` : ""}`
              : "—"
          }
        />
        <Detail
          label="Dispatched"
          value={
            transfer.dispatched_at ? formatDateTime(transfer.dispatched_at) : "—"
          }
        />
        <Detail
          label="Received"
          value={
            transfer.received_at
              ? `${formatDateTime(transfer.received_at)}${row.receiverName ? ` · ${row.receiverName}` : ""}`
              : "—"
          }
        />
      </section>

      {transfer.note ? (
        <div className="rounded-xs border border-border bg-card px-4 py-3">
          <div className="field-label">Note</div>
          <p className="mt-1 text-sm">{transfer.note}</p>
        </div>
      ) : null}

      <TableShell>
        <Table>
          <THead>
            <TH>Product</TH>
            <TH align="right">Requested</TH>
            <TH align="right">Dispatched</TH>
            <TH align="right">Received</TH>
            <TH>Note</TH>
          </THead>
          <TBody>
            {items.map((item) => {
              const shortfall =
                Number(item.dispatched) - Number(item.received);
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
                  <TD align="right">
                    {formatQuantity(item.requested, { unit: item.unitShort })}
                  </TD>
                  <TD align="right" className="text-muted-foreground">
                    {Number(item.dispatched) > 0
                      ? formatQuantity(item.dispatched)
                      : "—"}
                  </TD>
                  <TD align="right" className="font-medium">
                    {Number(item.received) > 0
                      ? formatQuantity(item.received)
                      : "—"}
                  </TD>
                  <TD className="text-muted-foreground">
                    {shortfall > 0 && transfer.status === "completed" ? (
                      <span className="text-warning">
                        {formatQuantity(String(shortfall))} short — held pending
                        inspection
                      </span>
                    ) : (
                      (item.note ?? "—")
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableShell>
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
