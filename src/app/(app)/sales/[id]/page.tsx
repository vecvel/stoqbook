import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Printer } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import {
  branches,
  customers,
  salePayments,
  salesInvoiceItems,
  salesInvoices,
  salesReturns,
  users,
  warehouses,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  humanise,
} from "@/lib/format";

import { InvoiceActions } from "./invoice-actions";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("sales.view");

  const [row] = await db
    .select({
      invoice: salesInvoices,
      storeName: branches.name,
      warehouseName: warehouses.name,
      cashierName: users.full_name,
      customerCode: customers.code,
      customerOutstanding: customers.outstanding_balance,
    })
    .from(salesInvoices)
    .innerJoin(branches, eq(branches.id, salesInvoices.branch_id))
    .innerJoin(warehouses, eq(warehouses.id, salesInvoices.warehouse_id))
    .leftJoin(users, eq(users.id, salesInvoices.cashier_id))
    .leftJoin(customers, eq(customers.id, salesInvoices.customer_id))
    .where(
      and(eq(salesInvoices.id, id), eq(salesInvoices.tenant_id, ctx.business.id)),
    )
    .limit(1);

  if (!row) notFound();
  const { invoice } = row;

  const [items, payments, returns] = await Promise.all([
    db
      .select()
      .from(salesInvoiceItems)
      .where(eq(salesInvoiceItems.invoice_id, id))
      .orderBy(asc(salesInvoiceItems.created_at)),
    db
      .select()
      .from(salePayments)
      .where(eq(salePayments.invoice_id, id))
      .orderBy(asc(salePayments.paid_at)),
    db
      .select({
        id: salesReturns.id,
        number: salesReturns.return_number,
        date: salesReturns.return_date,
        total: salesReturns.grand_total,
        reason: salesReturns.reason,
      })
      .from(salesReturns)
      .where(eq(salesReturns.invoice_id, id)),
  ]);

  const currency = ctx.business.currency;
  const canViewProfit = hasPermission(ctx, "reports.financial");
  const outstanding = Number(invoice.balance_amount);
  const returnable = items.some(
    (i) => Number(i.quantity) - Number(i.quantity_returned) > 0,
  );

  return (
    <div className="page max-w-5xl">
      <PageHeader
        title={invoice.invoice_number}
        description={`${formatDateTime(invoice.invoice_date)} · ${row.storeName} · ${humanise(invoice.channel)}`}
        breadcrumbs={[
          { label: "Sales", href: "/sales" },
          { label: invoice.invoice_number },
        ]}
        actions={
          <>
            <StatusBadge
              status={
                invoice.status === "cancelled"
                  ? "cancelled"
                  : invoice.status === "returned" ||
                      invoice.status === "partially_returned"
                    ? invoice.status
                    : invoice.payment_status
              }
            />
            {hasPermission(ctx, "sales.print") ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/sales/${id}/receipt`} target="_blank">
                  <Printer className="size-3.5" />
                  Receipt
                </Link>
              </Button>
            ) : null}
            <InvoiceActions
              invoiceId={id}
              outstanding={String(invoice.balance_amount)}
              currency={currency}
              canReturn={
                hasPermission(ctx, "sales.return") &&
                ctx.entitlements.features.has("sales.returns") &&
                returnable &&
                invoice.status !== "cancelled"
              }
              canCancel={
                hasPermission(ctx, "sales.cancel") &&
                invoice.status === "completed" &&
                returns.length === 0
              }
              canTakePayment={
                hasPermission(ctx, "sales.update") && outstanding > 0
              }
              items={items.map((i) => ({
                id: i.id,
                name: i.product_name,
                sku: i.product_sku,
                quantity: String(i.quantity),
                returned: String(i.quantity_returned),
                unitPrice: String(i.unit_price),
              }))}
            />
          </>
        }
      />

      {invoice.status === "cancelled" ? (
        <Notice tone="danger" title="Invoice cancelled">
          {invoice.cancel_reason ?? "This invoice was cancelled."} Stock was
          restored and any receivable released. The record is retained for audit.
        </Notice>
      ) : null}

      {outstanding > 0 ? (
        <Notice tone="warning" title="Outstanding balance">
          {formatMoney(invoice.balance_amount, { currency })} remains unpaid
          {invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ""}.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <TableShell>
            <Table>
              <THead>
                <TH>Item</TH>
                <TH align="right">Qty</TH>
                <TH align="right">Price</TH>
                <TH align="right">Discount</TH>
                <TH align="right">Tax</TH>
                <TH align="right">Total</TH>
              </THead>
              <TBody>
                {items.map((item) => {
                  const returned = Number(item.quantity_returned);
                  return (
                    <TR key={item.id}>
                      <TD>
                        <Link
                          href={`/products/${item.product_id}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {item.product_name}
                        </Link>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {item.product_sku}
                        </div>
                        {returned > 0 ? (
                          <Badge variant="soft-warning" className="mt-1">
                            {formatQuantity(item.quantity_returned)} returned
                          </Badge>
                        ) : null}
                      </TD>
                      <TD align="right">{formatQuantity(item.quantity)}</TD>
                      <TD align="right">
                        {formatMoney(item.unit_price, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {Number(item.discount_amount) > 0
                          ? `− ${formatMoney(item.discount_amount, { currency })}`
                          : "—"}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {Number(item.tax_rate) > 0
                          ? `${Number(item.tax_rate)}% · ${formatMoney(item.tax_amount, { currency })}`
                          : "—"}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(item.line_total, { currency })}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableShell>

          {payments.length > 0 ? (
            <div className="mt-4">
              <h2 className="section-title mb-2">Payments</h2>
              <TableShell>
                <Table>
                  <THead>
                    <TH>When</TH>
                    <TH>Method</TH>
                    <TH>Reference</TH>
                    <TH align="right">Amount</TH>
                  </THead>
                  <TBody>
                    {payments.map((payment) => (
                      <TR key={payment.id}>
                        <TD className="text-muted-foreground">
                          {formatDateTime(payment.paid_at)}
                        </TD>
                        <TD>
                          {humanise(payment.method)}
                          {payment.is_refund ? (
                            <Badge variant="soft-warning" className="ml-2">
                              Refund
                            </Badge>
                          ) : null}
                        </TD>
                        <TD mono className="text-muted-foreground">
                          {payment.reference ?? "—"}
                        </TD>
                        <TD
                          align="right"
                          className={
                            payment.is_refund
                              ? "font-medium text-destructive"
                              : "font-medium"
                          }
                        >
                          {formatMoney(payment.amount, { currency })}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableShell>
            </div>
          ) : null}

          {returns.length > 0 ? (
            <div className="mt-4">
              <h2 className="section-title mb-2">Returns</h2>
              <TableShell>
                <Table>
                  <THead>
                    <TH>Number</TH>
                    <TH>When</TH>
                    <TH>Reason</TH>
                    <TH align="right">Amount</TH>
                  </THead>
                  <TBody>
                    {returns.map((r) => (
                      <TR key={r.id}>
                        <TD mono>{r.number}</TD>
                        <TD className="text-muted-foreground">
                          {formatDateTime(r.date)}
                        </TD>
                        <TD>{humanise(r.reason)}</TD>
                        <TD align="right" className="font-medium">
                          {formatMoney(r.total, { currency })}
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
              <h2 className="text-sm font-semibold">Summary</h2>
            </header>
            <dl className="divide-y divide-border text-sm">
              <Line label="Subtotal" value={formatMoney(invoice.subtotal, { currency })} />
              {Number(invoice.discount_amount) > 0 ? (
                <Line
                  label="Discount"
                  value={`− ${formatMoney(invoice.discount_amount, { currency })}`}
                />
              ) : null}
              <Line label="Tax" value={formatMoney(invoice.tax_amount, { currency })} />
              {Number(invoice.round_off) !== 0 ? (
                <Line
                  label="Round off"
                  value={formatMoney(invoice.round_off, { currency })}
                />
              ) : null}
              <Line
                label="Total"
                value={formatMoney(invoice.grand_total, { currency })}
                strong
              />
              <Line label="Paid" value={formatMoney(invoice.paid_amount, { currency })} />
              {outstanding > 0 ? (
                <Line
                  label="Balance"
                  value={formatMoney(invoice.balance_amount, { currency })}
                  tone="warning"
                  strong
                />
              ) : null}
              {Number(invoice.refunded_amount) > 0 ? (
                <Line
                  label="Refunded"
                  value={formatMoney(invoice.refunded_amount, { currency })}
                  tone="danger"
                />
              ) : null}
              {canViewProfit ? (
                <>
                  <Line
                    label="Cost of goods"
                    value={formatMoney(invoice.total_cost, { currency })}
                  />
                  <Line
                    label="Gross profit"
                    value={formatMoney(invoice.gross_profit, { currency })}
                    tone={Number(invoice.gross_profit) < 0 ? "danger" : "success"}
                    strong
                  />
                </>
              ) : null}
            </dl>
          </div>

          <div className="rounded-xs border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Customer</h2>
            </header>
            <div className="px-4 py-3 text-sm">
              {invoice.customer_id ? (
                <>
                  <Link
                    href={`/customers/${invoice.customer_id}`}
                    className="font-medium hover:text-accent hover:underline"
                  >
                    {invoice.customer_name}
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {row.customerCode}
                  </div>
                  {invoice.customer_phone ? (
                    <div className="text-xs text-muted-foreground">
                      {invoice.customer_phone}
                    </div>
                  ) : null}
                  {row.customerOutstanding &&
                  Number(row.customerOutstanding) > 0 ? (
                    <div className="mt-2 rounded-xs bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
                      Total owed across all invoices:{" "}
                      {formatMoney(row.customerOutstanding, { currency })}
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  {invoice.customer_name ?? "Walk-in customer"}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xs border border-border bg-card">
            <header className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold">Details</h2>
            </header>
            <dl className="divide-y divide-border text-sm">
              <Line label="Store" value={row.storeName} />
              <Line label="Warehouse" value={row.warehouseName} />
              <Line label="Cashier" value={row.cashierName ?? "—"} />
              <Line label="Channel" value={humanise(invoice.channel)} />
              {Number(invoice.loyalty_points_earned) > 0 ? (
                <Line
                  label="Points earned"
                  value={String(Number(invoice.loyalty_points_earned))}
                />
              ) : null}
              {Number(invoice.loyalty_points_redeemed) > 0 ? (
                <Line
                  label="Points redeemed"
                  value={String(Number(invoice.loyalty_points_redeemed))}
                />
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "";

  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`tabular ${strong ? "font-semibold" : ""} ${toneClass}`.trim()}
      >
        {value}
      </dd>
    </div>
  );
}
