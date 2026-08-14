import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

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
  stores,
  goodsReceipts,
  products,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
  units,
  users,
  warehouses,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { sub } from "@/lib/money";

import { OrderActions } from "./order-actions";
import { ReceiveGoodsPanel } from "./receive-goods-panel";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("purchases.view");

  const [row] = await db
    .select({
      order: purchaseOrders,
      supplierId: suppliers.id,
      supplierName: suppliers.company_name,
      supplierPhone: suppliers.phone,
      supplierEmail: suppliers.email,
      supplierOutstanding: suppliers.outstanding_balance,
      storeName: stores.name,
      warehouseName: warehouses.name,
      createdByName: users.full_name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplier_id))
    .innerJoin(stores, eq(stores.id, purchaseOrders.store_id))
    .innerJoin(warehouses, eq(warehouses.id, purchaseOrders.warehouse_id))
    .leftJoin(users, eq(users.id, purchaseOrders.created_by))
    .where(
      and(
        eq(purchaseOrders.id, id),
        eq(purchaseOrders.tenant_id, ctx.business.id),
      ),
    )
    .limit(1);

  if (!row) notFound();
  const { order } = row;

  const [items, receipts] = await Promise.all([
    db
      .select({
        id: purchaseOrderItems.id,
        productId: purchaseOrderItems.product_id,
        productName: purchaseOrderItems.product_name,
        productSku: purchaseOrderItems.product_sku,
        quantityOrdered: purchaseOrderItems.quantity_ordered,
        quantityReceived: purchaseOrderItems.quantity_received,
        unitPrice: purchaseOrderItems.unit_price,
        discountAmount: purchaseOrderItems.discount_amount,
        taxRate: purchaseOrderItems.tax_rate,
        taxAmount: purchaseOrderItems.tax_amount,
        lineTotal: purchaseOrderItems.line_total,
        unitShort: units.short_name,
        trackBatches: products.track_batches,
      })
      .from(purchaseOrderItems)
      .leftJoin(products, eq(products.id, purchaseOrderItems.product_id))
      .leftJoin(units, eq(units.id, products.unit_id))
      .where(eq(purchaseOrderItems.order_id, id))
      .orderBy(asc(purchaseOrderItems.created_at)),

    db
      .select({
        id: goodsReceipts.id,
        number: goodsReceipts.receipt_number,
        date: goodsReceipts.receipt_date,
        challan: goodsReceipts.challan_number,
        totalCost: goodsReceipts.total_cost,
        receivedByName: users.full_name,
      })
      .from(goodsReceipts)
      .leftJoin(users, eq(users.id, goodsReceipts.received_by))
      .where(eq(goodsReceipts.order_id, id))
      .orderBy(desc(goodsReceipts.receipt_date)),
  ]);

  const currency = ctx.business.currency;
  const isPendingApproval = order.approval_status === "pending";
  const isCancelled = order.status === "cancelled";
  const isComplete = order.status === "completed";

  const outstandingItems = items.filter(
    (i) => Number(i.quantityOrdered) - Number(i.quantityReceived) > 0,
  );

  const canReceive =
    hasPermission(ctx, "purchases.receive") &&
    ctx.entitlements.features.has("purchases.receipts") &&
    !isPendingApproval &&
    !isCancelled &&
    outstandingItems.length > 0;

  return (
    <div className="page">
      <PageHeader
        title={order.order_number}
        description={`${row.supplierName} · ordered ${formatDate(order.order_date)}`}
        breadcrumbs={[
          { label: "Purchases", href: "/purchases" },
          { label: order.order_number },
        ]}
        actions={
          <>
            <StatusBadge
              status={isPendingApproval ? "pending_approval" : order.status}
            />
            <OrderActions
              orderId={id}
              status={order.status}
              approvalStatus={order.approval_status}
              canApprove={
                hasPermission(ctx, "purchases.approve") &&
                ctx.entitlements.features.has("purchases.approvals")
              }
              canCancel={hasPermission(ctx, "purchases.cancel")}
            />
          </>
        }
      />

      {isPendingApproval ? (
        <Notice tone="warning" title="Awaiting approval">
          Goods cannot be received against this order until it is approved.
        </Notice>
      ) : null}

      {isCancelled ? (
        <Notice tone="danger" title="Order cancelled">
          {order.cancel_reason ?? "This order was cancelled."}
        </Notice>
      ) : null}

      {isComplete ? (
        <Notice tone="success" title="Fully received">
          Every ordered line has been received. Stock and supplier balances are up
          to date.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 lg:col-span-2">
          <TableShell>
            <Table>
              <THead>
                <TH>Product</TH>
                <TH align="right">Ordered</TH>
                <TH align="right">Received</TH>
                <TH align="right">Outstanding</TH>
                <TH align="right">Unit cost</TH>
                <TH align="right">Tax</TH>
                <TH align="right">Total</TH>
              </THead>
              <TBody>
                {items.map((item) => {
                  const outstanding = sub(
                    String(item.quantityOrdered),
                    String(item.quantityReceived),
                  );
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
                        {formatQuantity(item.quantityOrdered, {
                          unit: item.unitShort,
                        })}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatQuantity(item.quantityReceived)}
                      </TD>
                      <TD
                        align="right"
                        className={
                          Number(outstanding) > 0
                            ? "font-semibold text-warning"
                            : "text-muted-foreground"
                        }
                      >
                        {Number(outstanding) > 0
                          ? formatQuantity(outstanding)
                          : "—"}
                      </TD>
                      <TD align="right">
                        {formatMoney(item.unitPrice, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {Number(item.taxRate) > 0
                          ? formatMoney(item.taxAmount, { currency })
                          : "—"}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(item.lineTotal, { currency })}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableShell>

          {canReceive ? (
            <ReceiveGoodsPanel
              orderId={id}
              currency={currency}
              items={outstandingItems.map((i) => ({
                id: i.id,
                name: i.productName,
                sku: i.productSku,
                unit: i.unitShort ?? "",
                ordered: String(i.quantityOrdered),
                received: String(i.quantityReceived),
                unitPrice: String(i.unitPrice),
                trackBatches: Boolean(i.trackBatches),
              }))}
              batchesEnabled={ctx.entitlements.features.has("inventory.batches")}
            />
          ) : null}

          {receipts.length > 0 ? (
            <div>
              <h2 className="section-title mb-2">Goods receipts</h2>
              <TableShell>
                <Table>
                  <THead>
                    <TH>Receipt</TH>
                    <TH>Date</TH>
                    <TH>Challan</TH>
                    <TH>Received by</TH>
                    <TH align="right">Landed cost</TH>
                  </THead>
                  <TBody>
                    {receipts.map((receipt) => (
                      <TR key={receipt.id}>
                        <TD mono className="font-medium">
                          {receipt.number}
                        </TD>
                        <TD className="text-muted-foreground">
                          {formatDate(receipt.date)}
                        </TD>
                        <TD mono className="text-muted-foreground">
                          {receipt.challan ?? "—"}
                        </TD>
                        <TD className="text-muted-foreground">
                          {receipt.receivedByName ?? "—"}
                        </TD>
                        <TD align="right" className="font-medium">
                          {formatMoney(receipt.totalCost, { currency })}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableShell>
            </div>
          ) : null}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xs border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Order total</h2>
            </header>
            <dl className="divide-y divide-border text-sm">
              <Line label="Subtotal" value={formatMoney(order.subtotal, { currency })} />
              {Number(order.discount_amount) > 0 ? (
                <Line
                  label="Discount"
                  value={`− ${formatMoney(order.discount_amount, { currency })}`}
                />
              ) : null}
              <Line label="Tax" value={formatMoney(order.tax_amount, { currency })} />
              {Number(order.shipping_amount) > 0 ? (
                <Line
                  label="Shipping"
                  value={formatMoney(order.shipping_amount, { currency })}
                />
              ) : null}
              {Number(order.other_charges) > 0 ? (
                <Line
                  label="Other charges"
                  value={formatMoney(order.other_charges, { currency })}
                />
              ) : null}
              <Line
                label="Grand total"
                value={formatMoney(order.grand_total, { currency })}
                strong
              />
            </dl>
          </div>

          <div className="rounded-xs border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Supplier</h2>
            </header>
            <div className="px-4 py-3 text-sm">
              <Link
                href={`/suppliers/${row.supplierId}`}
                className="font-medium hover:text-accent hover:underline"
              >
                {row.supplierName}
              </Link>
              {row.supplierPhone ? (
                <div className="text-xs text-muted-foreground">
                  {row.supplierPhone}
                </div>
              ) : null}
              {row.supplierEmail ? (
                <div className="text-xs text-muted-foreground">
                  {row.supplierEmail}
                </div>
              ) : null}
              {Number(row.supplierOutstanding) > 0 ? (
                <div className="mt-2 rounded-xs bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                  Payable {formatMoney(row.supplierOutstanding, { currency })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xs border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Details</h2>
            </header>
            <dl className="divide-y divide-border text-sm">
              <Line label="Store" value={row.storeName} />
              <Line label="Receive into" value={row.warehouseName} />
              <Line
                label="Expected"
                value={order.expected_date ? formatDate(order.expected_date) : "—"}
              />
              <Line label="Terms" value={order.payment_terms ?? "—"} />
              <Line label="Raised by" value={row.createdByName ?? "—"} />
              <Line label="Created" value={formatDateTime(order.created_at)} />
              {order.approved_at ? (
                <Line label="Approved" value={formatDateTime(order.approved_at)} />
              ) : null}
            </dl>
          </div>

          {order.note ? (
            <div className="rounded-xs border border-border bg-card px-4 py-3">
              <div className="field-label">Note</div>
              <p className="mt-1 text-sm">{order.note}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold tabular" : "tabular"}>{value}</dd>
    </div>
  );
}
