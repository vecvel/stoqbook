import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

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
  customerGroups,
  customerLedger,
  customers,
  loyaltyTransactions,
  salesInvoices,
} from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  currencySymbol,
  formatDate,
  formatDateTime,
  formatMoney,
  humanise,
} from "@/lib/format";
import { availableCredit } from "@/lib/services/partners";
import { loadSettings, readNumber } from "@/lib/services/settings";

import { CustomerForm } from "../customer-form";
import { CustomerPanels } from "./customer-panels";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("customers.view");

  const [row] = await db
    .select({ customer: customers, groupName: customerGroups.name })
    .from(customers)
    .leftJoin(customerGroups, eq(customerGroups.id, customers.group_id))
    .where(and(eq(customers.id, id), eq(customers.tenant_id, ctx.business.id)))
    .limit(1);

  if (!row) notFound();
  const { customer } = row;

  const creditEnabled = ctx.entitlements.features.has("customers.credit");
  const loyaltyEnabled = ctx.entitlements.features.has("customers.loyalty");
  const canEdit = hasPermission(ctx, "customers.update");
  const currency = ctx.business.currency;

  const [invoices, ledger, loyalty, groups, settings] = await Promise.all([
    hasPermission(ctx, "sales.view")
      ? db
          .select({
            id: salesInvoices.id,
            number: salesInvoices.invoice_number,
            date: salesInvoices.invoice_date,
            total: salesInvoices.grand_total,
            balance: salesInvoices.balance_amount,
            status: salesInvoices.status,
            paymentStatus: salesInvoices.payment_status,
          })
          .from(salesInvoices)
          .where(eq(salesInvoices.customer_id, id))
          .orderBy(desc(salesInvoices.invoice_date))
          .limit(30)
      : [],

    creditEnabled
      ? db
          .select()
          .from(customerLedger)
          .where(eq(customerLedger.customer_id, id))
          .orderBy(desc(customerLedger.created_at))
          .limit(40)
      : [],

    loyaltyEnabled
      ? db
          .select()
          .from(loyaltyTransactions)
          .where(eq(loyaltyTransactions.customer_id, id))
          .orderBy(desc(loyaltyTransactions.created_at))
          .limit(30)
      : [],

    canEdit
      ? db
          .select({ id: customerGroups.id, name: customerGroups.name })
          .from(customerGroups)
          .where(eq(customerGroups.tenant_id, ctx.business.id))
          .orderBy(asc(customerGroups.name))
      : [],

    loadSettings({ businessId: ctx.business.id }),
  ]);

  const available = availableCredit(customer);
  const overLimit =
    Number(customer.credit_limit) > 0 &&
    Number(customer.outstanding_balance) > Number(customer.credit_limit);

  const averageOrder =
    customer.purchase_count > 0
      ? Number(customer.total_purchases) / customer.purchase_count
      : 0;

  return (
    <div className="page">
      <PageHeader
        title={customer.name}
        description={[
          customer.code,
          customer.company_name,
          customer.phone,
          row.groupName,
        ]
          .filter(Boolean)
          .join(" · ")}
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: customer.name },
        ]}
        actions={
          <>
            <StatusBadge status={customer.status} />
            <CustomerPanels
              customerId={id}
              customerName={customer.name}
              outstanding={String(customer.outstanding_balance)}
              loyaltyPoints={String(customer.loyalty_points)}
              currency={currency}
              canRecordReceipt={
                hasPermission(ctx, "customers.credit") && creditEnabled
              }
              canAdjustLoyalty={
                hasPermission(ctx, "customers.loyalty") && loyaltyEnabled
              }
              canDelete={hasPermission(ctx, "customers.delete") && !customer.is_walk_in}
            />
          </>
        }
      />

      <StatGrid>
        <StatTile
          label="Lifetime value"
          value={formatMoney(customer.total_purchases, { currency })}
          sublabel={`${customer.purchase_count} order${customer.purchase_count === 1 ? "" : "s"}`}
          tone="accent"
          icon="Coins"
        />
        <StatTile
          label="Average order"
          value={formatMoney(averageOrder, { currency })}
          icon="Receipt"
        />
        {creditEnabled ? (
          <StatTile
            label="Outstanding"
            value={formatMoney(customer.outstanding_balance, { currency })}
            sublabel={
              Number(customer.credit_limit) > 0
                ? `Limit ${formatMoney(customer.credit_limit, { currency })}`
                : "No credit limit set"
            }
            tone={
              overLimit
                ? "danger"
                : Number(customer.outstanding_balance) > 0
                  ? "warning"
                  : "neutral"
            }
            icon="CreditCard"
          />
        ) : null}
        {creditEnabled ? (
          <StatTile
            label="Available credit"
            value={formatMoney(available, { currency })}
            tone={Number(available) > 0 ? "success" : "neutral"}
            icon="Wallet"
          />
        ) : null}
        {loyaltyEnabled ? (
          <StatTile
            label="Loyalty points"
            value={String(Number(customer.loyalty_points))}
            sublabel={`${Number(customer.loyalty_points_redeemed)} redeemed`}
            icon="TrendingUp"
          />
        ) : null}
        <StatTile
          label="Last purchase"
          value={
            customer.last_purchase_at
              ? formatDate(customer.last_purchase_at)
              : "Never"
          }
          icon="ClipboardList"
        />
      </StatGrid>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">Purchase history</TabsTrigger>
          {creditEnabled ? <TabsTrigger value="ledger">Account</TabsTrigger> : null}
          {loyaltyEnabled ? <TabsTrigger value="loyalty">Loyalty</TabsTrigger> : null}
          {canEdit ? <TabsTrigger value="edit">Edit</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="history" className="mt-3">
          <TableShell>
            <Table>
              <THead>
                <TH>Invoice</TH>
                <TH>Date</TH>
                <TH align="right">Total</TH>
                <TH align="right">Balance</TH>
                <TH align="right">Status</TH>
              </THead>
              <TBody>
                {invoices.length === 0 ? (
                  <EmptyRow colSpan={5}>No purchases recorded yet.</EmptyRow>
                ) : (
                  invoices.map((invoice) => (
                    <TR key={invoice.id}>
                      <TD>
                        <Link
                          href={`/sales/${invoice.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </TD>
                      <TD className="text-muted-foreground">
                        {formatDateTime(invoice.date)}
                      </TD>
                      <TD align="right" className="font-medium">
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
                        <StatusBadge
                          status={
                            invoice.status === "cancelled"
                              ? "cancelled"
                              : invoice.paymentStatus
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

        {creditEnabled ? (
          <TabsContent value="ledger" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Reference</TH>
                  <TH>Note</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">Balance</TH>
                </THead>
                <TBody>
                  {ledger.length === 0 ? (
                    <EmptyRow colSpan={6}>
                      No account movements. Credit sales and receipts appear here.
                    </EmptyRow>
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
                        <TD className="text-muted-foreground">
                          {entry.note ?? "—"}
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
              A positive amount increases what the customer owes; a negative amount
              is a settlement.
            </p>
          </TabsContent>
        ) : null}

        {loyaltyEnabled ? (
          <TabsContent value="loyalty" className="mt-3">
            <TableShell>
              <Table>
                <THead>
                  <TH>When</TH>
                  <TH>Type</TH>
                  <TH>Note</TH>
                  <TH align="right">Points</TH>
                  <TH align="right">Balance</TH>
                </THead>
                <TBody>
                  {loyalty.length === 0 ? (
                    <EmptyRow colSpan={5}>No loyalty activity yet.</EmptyRow>
                  ) : (
                    loyalty.map((entry) => (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </TD>
                        <TD>{humanise(entry.kind)}</TD>
                        <TD className="text-muted-foreground">
                          {entry.note ?? "—"}
                        </TD>
                        <TD
                          align="right"
                          className={
                            Number(entry.points) < 0
                              ? "font-semibold text-destructive"
                              : "font-semibold text-success"
                          }
                        >
                          {Number(entry.points) > 0 ? "+" : ""}
                          {Number(entry.points)}
                        </TD>
                        <TD align="right">{Number(entry.balance_after)}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </TableShell>
          </TabsContent>
        ) : null}

        {canEdit ? (
          <TabsContent value="edit" className="mt-3">
            <CustomerForm
              values={{
                id: customer.id,
                code: customer.code,
                name: customer.name,
                companyName: customer.company_name ?? "",
                type: customer.type,
                groupId: customer.group_id ?? "",
                phone: customer.phone ?? "",
                email: customer.email ?? "",
                taxNumber: customer.tax_number ?? "",
                dateOfBirth: customer.date_of_birth
                  ? customer.date_of_birth.toISOString().slice(0, 10)
                  : "",
                creditLimit: String(Number(customer.credit_limit)),
                paymentTermsDays: String(customer.payment_terms_days),
                status: customer.status,
                note: customer.note ?? "",
                isWalkIn: customer.is_walk_in,
              }}
              groups={groups}
              currencySymbol={currencySymbol(currency)}
              creditEnabled={creditEnabled}
              defaultCreditLimit={readNumber(
                settings,
                "customers.default_credit_limit",
                0,
              )}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
