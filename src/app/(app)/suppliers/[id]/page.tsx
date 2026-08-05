import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

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
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db";
import {
  products,
  purchaseInvoices,
  purchaseOrders,
  supplierLedger,
  supplierContracts,
  supplierProducts,
  suppliers,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  humanise,
} from "@/lib/format";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { SupplierForm } from "../supplier-form";
import { ContractsPanel, type ContractView } from "./contracts-panel";
import { SupplierPanels } from "./supplier-panels";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("suppliers.view");

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenant_id, ctx.business.id)))
    .limit(1);

  if (!supplier) notFound();

  const currency = ctx.business.currency;
  const canEdit = hasPermission(ctx, "suppliers.update");
  const canPay = hasPermission(ctx, "purchases.payment");
  const ratingsEnabled = ctx.entitlements.features.has("suppliers.ratings");

  const [orders, invoices, ledger, mapped, settings, contractRows] = await Promise.all([
    hasPermission(ctx, "purchases.view")
      ? db
          .select({
            id: purchaseOrders.id,
            number: purchaseOrders.order_number,
            date: purchaseOrders.order_date,
            status: purchaseOrders.status,
            approvalStatus: purchaseOrders.approval_status,
            total: purchaseOrders.grand_total,
          })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.supplier_id, id))
          .orderBy(desc(purchaseOrders.order_date))
          .limit(30)
      : [],

    canPay
      ? db
          .select({
            id: purchaseInvoices.id,
            number: purchaseInvoices.invoice_number,
            supplierNumber: purchaseInvoices.supplier_invoice_number,
            date: purchaseInvoices.invoice_date,
            dueDate: purchaseInvoices.due_date,
            total: purchaseInvoices.grand_total,
            balance: purchaseInvoices.balance_amount,
            status: purchaseInvoices.payment_status,
          })
          .from(purchaseInvoices)
          .where(eq(purchaseInvoices.supplier_id, id))
          .orderBy(desc(purchaseInvoices.invoice_date))
          .limit(30)
      : [],

    canPay
      ? db
          .select()
          .from(supplierLedger)
          .where(eq(supplierLedger.supplier_id, id))
          .orderBy(desc(supplierLedger.created_at))
          .limit(40)
      : [],

    db
      .select({
        id: supplierProducts.id,
        productId: products.id,
        productName: products.name,
        productSku: products.sku,
        supplierSku: supplierProducts.supplier_sku,
        purchasePrice: supplierProducts.purchase_price,
        moq: supplierProducts.minimum_order_quantity,
        leadTime: supplierProducts.lead_time_days,
        isPreferred: supplierProducts.is_preferred,
      })
      .from(supplierProducts)
      .innerJoin(products, eq(products.id, supplierProducts.product_id))
      .where(eq(supplierProducts.supplier_id, id))
      .orderBy(desc(supplierProducts.is_preferred)),

    loadSettings({ businessId: ctx.business.id }),

    hasPermission(ctx, "suppliers.contracts")
      ? db
          .select()
          .from(supplierContracts)
          .where(eq(supplierContracts.supplier_id, id))
          .orderBy(desc(supplierContracts.effective_from))
      : Promise.resolve([]),
  ]);

  /* A contract past its end date is shown as expired regardless of its active
     flag, so a stale flag never reads as still in force. */
  const now = new Date();
  const contracts: ContractView[] = contractRows.map((c) => ({
    id: c.id,
    contractNumber: c.contract_number,
    effectiveFrom: c.effective_from
      ? c.effective_from.toISOString().slice(0, 10)
      : "",
    effectiveTo: c.effective_to ? c.effective_to.toISOString().slice(0, 10) : "",
    terms: c.terms ?? "",
    attachmentUrl: c.attachment_url ?? "",
    isActive: c.is_active,
    expired: Boolean(c.effective_to && c.effective_to < now),
  }));

  const averageOrder =
    supplier.purchase_count > 0
      ? Number(supplier.total_purchases) / supplier.purchase_count
      : 0;

  return (
    <div className="page">
      <PageHeader
        title={supplier.company_name}
        description={[
          supplier.code,
          supplier.contact_person,
          supplier.phone,
          humanise(supplier.type),
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Suppliers", href: "/suppliers" },
          { label: supplier.company_name },
        ]}
        actions={
          <>
            <StatusBadge status={supplier.status} />
            <SupplierPanels
              supplierId={id}
              supplierName={supplier.company_name}
              outstanding={String(supplier.outstanding_balance)}
              currency={currency}
              canPay={canPay}
              canDelete={hasPermission(ctx, "suppliers.delete")}
            />
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Total spend"
          value={formatMoney(supplier.total_purchases, { currency })}
          sublabel={`${supplier.purchase_count} receipt${supplier.purchase_count === 1 ? "" : "s"}`}
          tone="accent"
          icon="ShoppingBag"
        />
        <StatTile
          label="Average order"
          value={formatMoney(averageOrder, { currency })}
          icon="FileText"
        />
        {canPay ? (
          <StatTile
            label="Payable"
            value={formatMoney(supplier.outstanding_balance, { currency })}
            sublabel={
              supplier.credit_days > 0 ? `Net ${supplier.credit_days}` : undefined
            }
            tone={Number(supplier.outstanding_balance) > 0 ? "warning" : "neutral"}
            icon="CreditCard"
          />
        ) : null}
        {ratingsEnabled ? (
          <StatTile
            label="Rating"
            value={
              Number(supplier.rating) > 0
                ? `${Number(supplier.rating).toFixed(1)} / 5`
                : "Unrated"
            }
            sublabel={
              supplier.average_lead_time_days
                ? `${supplier.average_lead_time_days} day lead time`
                : undefined
            }
            tone={Number(supplier.rating) >= 4 ? "success" : "neutral"}
            icon="TrendingUp"
          />
        ) : null}
        <StatTile
          label="Last order"
          value={
            supplier.last_purchase_at
              ? formatDate(supplier.last_purchase_at)
              : "Never"
          }
          icon="ClipboardList"
        />
      </StatGrid>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Purchase orders</TabsTrigger>
          {canPay ? <TabsTrigger value="invoices">Invoices</TabsTrigger> : null}
          {canPay ? <TabsTrigger value="ledger">Account</TabsTrigger> : null}
          {mapped.length > 0 ? (
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          ) : null}
          {canEdit ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="orders" className="mt-3">
          <TableShell>
            <Table>
              <THead>
                <TH>Order</TH>
                <TH>Date</TH>
                <TH align="right">Value</TH>
                <TH align="right">Status</TH>
              </THead>
              <TBody>
                {orders.length === 0 ? (
                  <EmptyRow colSpan={4}>No purchase orders yet.</EmptyRow>
                ) : (
                  orders.map((order) => (
                    <TR key={order.id}>
                      <TD>
                        <Link
                          href={`/purchases/${order.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {order.number}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">
                        {formatDate(order.date)}
                      </TD>
                      <TD align="right" className="font-medium">
                        {formatMoney(order.total, { currency })}
                      </TD>
                      <TD align="right">
                        <StatusBadge
                          status={
                            order.approvalStatus === "pending"
                              ? "pending_approval"
                              : order.status
                          }
                        />
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </TableShell>
        </TabsContent>

        {canPay ? (
          <TabsContent value="invoices" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>Our reference</TH>
                  <TH>Their invoice</TH>
                  <TH>Date</TH>
                  <TH>Due</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Balance</TH>
                  <TH align="right">Status</TH>
                </THead>
                <TBody>
                  {invoices.length === 0 ? (
                    <EmptyRow colSpan={7}>No supplier invoices recorded.</EmptyRow>
                  ) : (
                    invoices.map((invoice) => (
                      <TR key={invoice.id}>
                        <TD mono>{invoice.number}</TD>
                        <TD mono className="text-muted-foreground">
                          {invoice.supplierNumber}
                        </TD>
                        <TD className="text-muted-foreground">
                          {formatDate(invoice.date)}
                        </TD>
                        <TD className="text-muted-foreground">
                          {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                        </TD>
                        <TD align="right">
                          {formatMoney(invoice.total, { currency })}
                        </TD>
                        <TD
                          align="right"
                          className={
                            Number(invoice.balance) > 0
                              ? "font-semibold text-warning"
                              : "text-muted-foreground"
                          }
                        >
                          {Number(invoice.balance) > 0
                            ? formatMoney(invoice.balance, { currency })
                            : "—"}
                        </TD>
                        <TD align="right">
                          <StatusBadge status={invoice.status} />
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </TabsContent>
        ) : null}

        {canPay ? (
          <TabsContent value="ledger" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Reference</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Balance</TH>
                </THead>
                <TBody>
                  {ledger.length === 0 ? (
                    <EmptyRow colSpan={5}>No account movements yet.</EmptyRow>
                  ) : (
                    ledger.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </TD>
                        <TD>{humanise(entry.kind)}</TD>
                        <TD mono className="text-muted-foreground">
                          {entry.reference_number ?? "—"}
                        </TD>
                        <TD
                          align="right"
                          className={
                            Number(entry.amount) < 0
                              ? "font-semibold text-success"
                              : "font-semibold text-warning"
                          }
                        >
                          {Number(entry.amount) > 0 ? "+" : ""}
                          {formatMoney(entry.amount, { currency })}
                        </TD>
                        <TD align="right">
                          {formatMoney(entry.balance_after, { currency })}
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
            <p className="mt-2 text-xs text-muted-foreground">
              A positive amount increases the payable; a negative amount is a
              payment or debit note.
            </p>
          </TabsContent>
        ) : null}

        {mapped.length > 0 ? (
          <TabsContent value="catalogue" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>Product</TH>
                  <TH>Their SKU</TH>
                  <TH align="right">Purchase price</TH>
                  <TH align="right">MOQ</TH>
                  <TH align="right">Lead time</TH>
                  <TH align="right">Preferred</TH>
                </THead>
                <TBody>
                  {mapped.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/products/${row.productId}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {row.productName}
                        </Link>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.productSku}
                        </div>
                      </TD>
                      <TD mono className="text-muted-foreground">
                        {row.supplierSku ?? "—"}
                      </TD>
                      <TD align="right">
                        {formatMoney(row.purchasePrice, { currency })}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {Number(row.moq)}
                      </TD>
                      <TD align="right" className="text-muted-foreground">
                        {row.leadTime ? `${row.leadTime} days` : "—"}
                      </TD>
                      <TD align="right">
                        {row.isPreferred ? (
                          <StatusBadge status="active" label="Preferred" />
                        ) : (
                          "—"
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableShell>
          </TabsContent>
        ) : null}

        {canEdit ? (
          <TabsContent value="edit" className="mt-3">
            <SupplierForm
              values={{
                id: supplier.id,
                code: supplier.code,
                companyName: supplier.company_name,
                contactPerson: supplier.contact_person ?? "",
                type: supplier.type,
                phone: supplier.phone ?? "",
                email: supplier.email ?? "",
                website: supplier.website ?? "",
                taxNumber: supplier.tax_number ?? "",
                registrationNumber: supplier.registration_number ?? "",
                paymentTerms: supplier.payment_terms ?? "",
                creditDays: String(supplier.credit_days),
                rating: String(Number(supplier.rating)),
                status: supplier.status,
                note: supplier.note ?? "",
              }}
              ratingsEnabled={ratingsEnabled}
              defaultCreditDays={readNumber(
                settings,
                "purchases.default_credit_days",
                30,
              )}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      {hasPermission(ctx, "suppliers.contracts") ? (
        <ContractsPanel
          supplierId={id}
          contracts={contracts}
          canWrite={hasPermission(ctx, "suppliers.contracts")}
        />
      ) : null}
    </div>
  );
}
