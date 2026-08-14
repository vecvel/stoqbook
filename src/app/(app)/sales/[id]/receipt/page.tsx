import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  stores,
  organizations,
  salePayments,
  salesInvoiceItems,
  salesInvoices,
  users,
} from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  humanise,
} from "@/lib/format";
import { loadSettings, readString } from "@/lib/services/settings";

import { PrintTrigger } from "./print-trigger";

export const metadata: Metadata = { title: "Receipt" };

/**
 * Thermal-style receipt. Sized for 80 mm paper via the `.receipt-80` rule in
 * globals.css and printed straight from the browser.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("sales.print");

  const [row] = await db
    .select({
      invoice: salesInvoices,
      storeName: stores.name,
      storePhone: stores.phone,
      storeAddress: stores.address_line1,
      storeCity: stores.city,
      cashierName: users.full_name,
      orgName: organizations.name,
      orgTaxNumber: organizations.tax_number,
    })
    .from(salesInvoices)
    .innerJoin(stores, eq(stores.id, salesInvoices.store_id))
    .leftJoin(users, eq(users.id, salesInvoices.cashier_id))
    .leftJoin(organizations, eq(organizations.tenant_id, salesInvoices.tenant_id))
    .where(
      and(eq(salesInvoices.id, id), eq(salesInvoices.tenant_id, ctx.business.id)),
    )
    .limit(1);

  if (!row) notFound();
  const { invoice } = row;

  const [items, payments, settings] = await Promise.all([
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
    loadSettings({ businessId: ctx.business.id, storeId: invoice.store_id }),
  ]);

  const currency = ctx.business.currency;
  const footer = readString(
    settings,
    "sales.receipt_footer",
    "Thank you for shopping with us.",
  );

  const money = (v: string | number) =>
    formatMoney(v, { currency, showSymbol: false });

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <PrintTrigger />

      <div className="receipt-80 mx-auto bg-white p-4 font-mono text-[11px] leading-snug text-black">
        {/* Header */}
        <div className="text-center">
          <div className="text-[13px] font-bold uppercase tracking-wide">
            {row.orgName ?? ctx.business.name}
          </div>
          <div>{row.storeName}</div>
          {row.storeAddress ? <div>{row.storeAddress}</div> : null}
          {row.storeCity ? <div>{row.storeCity}</div> : null}
          {row.storePhone ? <div>Tel {row.storePhone}</div> : null}
          {row.orgTaxNumber ? <div>GSTIN {row.orgTaxNumber}</div> : null}
        </div>

        <Divider />

        <Row label="Invoice" value={invoice.invoice_number} />
        <Row label="Date" value={formatDateTime(invoice.invoice_date)} />
        <Row label="Cashier" value={row.cashierName ?? "—"} />
        <Row
          label="Customer"
          value={invoice.customer_name ?? "Walk-in customer"}
        />
        {invoice.customer_phone ? (
          <Row label="Phone" value={invoice.customer_phone} />
        ) : null}

        <Divider />

        {/* Items */}
        <table className="w-full">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="text-left font-normal">Item</th>
              <th className="text-right font-normal">Qty</th>
              <th className="text-right font-normal">Rate</th>
              <th className="text-right font-normal">Amt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="py-0.5 pr-1">
                  <div>{item.product_name}</div>
                  <div className="text-[9px] opacity-70">{item.product_sku}</div>
                  {Number(item.discount_amount) > 0 ? (
                    <div className="text-[9px]">
                      Disc −{money(item.discount_amount)}
                    </div>
                  ) : null}
                </td>
                <td className="py-0.5 text-right">
                  {formatQuantity(item.quantity)}
                </td>
                <td className="py-0.5 text-right">{money(item.unit_price)}</td>
                <td className="py-0.5 text-right">{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Divider />

        <Row label="Subtotal" value={money(invoice.subtotal)} />
        {Number(invoice.discount_amount) > 0 ? (
          <Row label="Discount" value={`−${money(invoice.discount_amount)}`} />
        ) : null}
        {Number(invoice.tax_amount) > 0 ? (
          <Row label="Tax" value={money(invoice.tax_amount)} />
        ) : null}
        {Number(invoice.round_off) !== 0 ? (
          <Row label="Round off" value={money(invoice.round_off)} />
        ) : null}

        <div className="my-1 flex justify-between border-y border-black py-1 text-[13px] font-bold">
          <span>TOTAL</span>
          <span>
            {formatMoney(invoice.grand_total, { currency, showSymbol: true })}
          </span>
        </div>

        {payments.map((payment) => (
          <Row
            key={payment.id}
            label={
              payment.is_refund
                ? `Refund (${humanise(payment.method)})`
                : humanise(payment.method)
            }
            value={money(payment.amount)}
          />
        ))}

        {payments.some((p) => Number(p.tendered_amount ?? 0) > 0) ? (
          <>
            <Row
              label="Cash tendered"
              value={money(
                payments.reduce(
                  (acc, p) => acc + Number(p.tendered_amount ?? 0),
                  0,
                ),
              )}
            />
            <Row
              label="Change"
              value={money(
                payments.reduce((acc, p) => acc + Number(p.change_amount ?? 0), 0),
              )}
            />
          </>
        ) : null}

        {Number(invoice.balance_amount) > 0 ? (
          <Row
            label="Balance due"
            value={money(invoice.balance_amount)}
            bold
          />
        ) : null}

        {Number(invoice.loyalty_points_earned) > 0 ? (
          <>
            <Divider />
            <Row
              label="Points earned"
              value={String(Number(invoice.loyalty_points_earned))}
            />
          </>
        ) : null}

        {invoice.status === "cancelled" ? (
          <div className="mt-2 border border-black py-1 text-center text-[12px] font-bold">
            *** CANCELLED ***
          </div>
        ) : null}

        <Divider />

        <div className="whitespace-pre-line text-center">{footer}</div>
        <div className="mt-1 text-center text-[9px] opacity-70">
          Powered by StoqBook
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-dashed border-black" />;
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
