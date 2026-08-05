"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Minus,
  Plus,
  Printer,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ProductSearch, type ProductHit } from "@/components/shared/product-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { currencySymbol, formatMoney, formatQuantity } from "@/lib/format";
import {
  add,
  computeSummary,
  type CartLine,
} from "./cart";
import { cn } from "@/lib/utils";

import { checkout, quickCreateCustomer, searchCustomers } from "./actions";

export interface PosCustomer {
  id: string;
  name: string;
  phone: string | null;
  outstanding: string;
  creditLimit: string;
  loyaltyPoints: string;
  isWalkIn: boolean;
  type: string;
}

export interface PosConfig {
  warehouseId: string;
  warehouseName: string;
  storeName: string;
  currency: string;
  sessionId: string | null;
  requireSession: boolean;
  maxDiscountPercent: number;
  canOverrideDiscount: boolean;
  canSellOnCredit: boolean;
  canDiscount: boolean;
  allowNegativeStock: boolean;
  roundOff: boolean;
  loyaltyEnabled: boolean;
  splitPaymentEnabled: boolean;
  cashierName: string;
}

type PaymentMethod =
  | "cash"
  | "card"
  | "upi"
  | "bank_transfer"
  | "store_credit"
  | "credit";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank" },
];

export function PosTerminal({
  config,
  walkIn,
  recentCustomers,
}: {
  config: PosConfig;
  walkIn: PosCustomer | null;
  recentCustomers: PosCustomer[];
}) {
  const symbol = currencySymbol(config.currency);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<PosCustomer | null>(walkIn);
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<
    "percentage" | "fixed"
  >("percentage");
  const [redeemPoints, setRedeemPoints] = useState("");
  const [pending, startTransition] = useTransition();
  const [lastSale, setLastSale] = useState<{
    invoiceNumber: string;
    grandTotal: string;
    change: string;
    balance: string;
    loyalty: string;
    invoiceId: string;
  } | null>(null);

  const blocked = config.requireSession && !config.sessionId;

  const summary = useMemo(
    () =>
      computeSummary(lines, {
        discountType: invoiceDiscount ? invoiceDiscountType : "none",
        discountValue: invoiceDiscount || "0",
        roundOff: config.roundOff,
      }),
    [lines, invoiceDiscount, invoiceDiscountType, config.roundOff],
  );

  /* ---- Cart operations -------------------------------------------------- */

  function addProduct(product: ProductHit) {
    setLines((current) => {
      const existing = current.find((l) => l.productId === product.id);
      if (existing) {
        return current.map((l) =>
          l.productId === product.id
            ? { ...l, quantity: add(l.quantity, "1") }
            : l,
        );
      }

      // Wholesale customers get the wholesale price where one is set.
      const useWholesale = customer?.type === "wholesale";
      const price =
        useWholesale && product.wholesalePrice && Number(product.wholesalePrice) > 0
          ? product.wholesalePrice
          : product.sellingPrice;

      return [
        ...current,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          sku: product.sku,
          unit: product.unitShort,
          allowDecimal: product.allowDecimal ?? false,
          quantity: "1",
          unitPrice: price,
          listPrice: product.sellingPrice,
          taxRate: product.taxRate,
          taxMode: product.taxMode ?? "exclusive",
          discountType: "none",
          discountValue: "0",
          available: product.available,
          trackInventory: product.trackInventory,
        },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function changeQuantity(key: string, delta: number) {
    setLines((current) =>
      current.flatMap((l) => {
        if (l.key !== key) return [l];
        const next = Number(l.quantity) + delta;
        if (next <= 0) return [];
        return [{ ...l, quantity: String(next) }];
      }),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  function clearCart() {
    setLines([]);
    setInvoiceDiscount("");
    setRedeemPoints("");
    setCustomer(walkIn);
  }

  /* ---- Stock and discount guards --------------------------------------- */

  const stockProblems = lines.filter(
    (l) =>
      l.trackInventory &&
      l.available !== null &&
      Number(l.quantity) > Number(l.available) &&
      !config.allowNegativeStock,
  );

  const discountPercent = summary.maxDiscountPercent;
  const discountBlocked =
    discountPercent > config.maxDiscountPercent && !config.canOverrideDiscount;

  const canCheckout =
    lines.length > 0 && !blocked && stockProblems.length === 0 && !discountBlocked;

  /* ---- Checkout -------------------------------------------------------- */

  function completeSale(payments: {
    method: PaymentMethod;
    amount: string;
    reference?: string;
    tenderedAmount?: string;
  }[]) {
    startTransition(async () => {
      const result = await checkout({
        warehouseId: config.warehouseId,
        customerId: customer && !customer.isWalkIn ? customer.id : null,
        posSessionId: config.sessionId,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountType: l.discountType,
          discountValue: l.discountValue,
        })),
        payments,
        invoiceDiscountType: invoiceDiscount ? invoiceDiscountType : "none",
        invoiceDiscountValue: invoiceDiscount || "0",
        redeemLoyaltyPoints: redeemPoints || "0",
      });

      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Could not complete the sale.");
        return;
      }

      toast.success(result.message ?? "Sale completed.");
      setLastSale({
        invoiceId: result.data.invoiceId,
        invoiceNumber: result.data.invoiceNumber,
        grandTotal: result.data.grandTotal,
        change: result.data.changeAmount,
        balance: result.data.balanceAmount,
        loyalty: result.data.loyaltyEarned,
      });
      clearCart();
    });
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3 lg:flex-row">
      {/* Left: catalogue and cart */}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ProductSearch
            warehouseId={config.warehouseId}
            onSelect={addProduct}
            sellableOnly
            currency={config.currency}
            autoFocus
            className="min-w-[260px] flex-1"
          />
          {/* Sized to the search input (h-10) rather than left as default
              pills, so the whole till header sits on one line. */}
          <Badge variant="soft-neutral" className="h-10 px-3 text-xs">
            {config.warehouseName}
          </Badge>
          {config.sessionId ? (
            <Badge variant="soft-success" className="h-10 px-3 text-xs">
              Session open
            </Badge>
          ) : config.requireSession ? (
            <Badge variant="soft-destructive" className="h-10 px-3 text-xs">
              No session
            </Badge>
          ) : null}
        </div>

        {blocked ? (
          <div className="rounded-xs border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm">
            A cash session must be open before billing. Open one from the panel on
            the right.
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xs border border-border bg-card scrollbar-thin">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-6 py-16 text-center">
              <p className="text-sm font-medium">Cart is empty</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Scan a barcode or search for a product to begin. Pressing Enter on
                an exact barcode match adds it straight away.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-muted/80 backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Item
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Price
                  </th>
                  <th className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Qty
                  </th>
                  {config.canDiscount ? (
                    <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Disc %
                    </th>
                  ) : null}
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Tax
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Total
                  </th>
                  <th className="w-9" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => {
                  const totals = summary.lines.find((l) => l.key === line.key)!;
                  const short =
                    line.trackInventory &&
                    line.available !== null &&
                    Number(line.quantity) > Number(line.available);

                  return (
                    <tr key={line.key} className={cn(short && "bg-destructive/5")}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{line.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {line.sku}
                          {line.available !== null ? (
                            <span className={short ? "ml-2 text-destructive" : "ml-2"}>
                              {formatQuantity(line.available, { unit: line.unit })} on
                              hand
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value })
                          }
                          className="h-8 w-24 text-right"
                          aria-label={`Price for ${line.name}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            onClick={() => changeQuantity(line.key, -1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus />
                          </Button>
                          <Input
                            type="number"
                            step={line.allowDecimal ? "0.001" : "1"}
                            min="0"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, { quantity: e.target.value })
                            }
                            className="h-8 w-16 text-center"
                            aria-label={`Quantity for ${line.name}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            onClick={() => changeQuantity(line.key, 1)}
                            aria-label="Increase quantity"
                          >
                            <Plus />
                          </Button>
                        </div>
                      </td>
                      {config.canDiscount ? (
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={
                              line.discountType === "percentage"
                                ? line.discountValue === "0"
                                  ? ""
                                  : line.discountValue
                                : ""
                            }
                            onChange={(e) =>
                              updateLine(line.key, {
                                discountType: e.target.value
                                  ? "percentage"
                                  : "none",
                                discountValue: e.target.value || "0",
                              })
                            }
                            placeholder="0"
                            className="h-8 w-16 text-right"
                            aria-label={`Discount for ${line.name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {Number(line.taxRate) > 0 ? `${Number(line.taxRate)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular">
                        {formatMoney(totals.total, { currency: config.currency })}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeLine(line.key)}
                          className="text-destructive hover:bg-destructive/10"
                          aria-label={`Remove ${line.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right: customer, totals, payment */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[360px]">
        <CustomerPanel
          customer={customer}
          onChange={setCustomer}
          recent={recentCustomers}
          walkIn={walkIn}
          currency={config.currency}
          loyaltyEnabled={config.loyaltyEnabled}
        />

        <div className="flex flex-col gap-2 rounded-xs border border-border bg-card px-3.5 py-3">
          <Row label="Subtotal" value={formatMoney(summary.subtotal, { currency: config.currency })} />
          {Number(summary.lineDiscount) > 0 ? (
            <Row
              label="Line discounts"
              value={`− ${formatMoney(summary.lineDiscount, { currency: config.currency })}`}
              tone="warning"
            />
          ) : null}

          {config.canDiscount ? (
            <div className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-xs text-muted-foreground">Bill discount</span>
              <div className="flex items-center gap-1">
                <select
                  value={invoiceDiscountType}
                  onChange={(e) =>
                    setInvoiceDiscountType(e.target.value as "percentage" | "fixed")
                  }
                  className="h-7 rounded-xs border border-input bg-background px-1 text-xs outline-none focus:border-ring"
                  aria-label="Bill discount type"
                >
                  <option value="percentage">%</option>
                  <option value="fixed">{symbol}</option>
                </select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceDiscount}
                  onChange={(e) => setInvoiceDiscount(e.target.value)}
                  placeholder="0"
                  className="h-7 w-20 text-right text-xs"
                  aria-label="Bill discount value"
                />
              </div>
            </div>
          ) : null}

          {Number(summary.documentDiscount) > 0 ? (
            <Row
              label="Bill discount"
              value={`− ${formatMoney(summary.documentDiscount, { currency: config.currency })}`}
              tone="warning"
            />
          ) : null}

          <Row label="Tax" value={formatMoney(summary.taxAmount, { currency: config.currency })} />

          {Number(summary.roundOff) !== 0 ? (
            <Row
              label="Round off"
              value={formatMoney(summary.roundOff, { currency: config.currency })}
            />
          ) : null}

          <div className="mt-1 flex items-baseline justify-between border-t border-border pt-2">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-2xl font-semibold tabular text-copper-deep">
              {formatMoney(summary.grandTotal, { currency: config.currency })}
            </span>
          </div>

          {config.loyaltyEnabled &&
          customer &&
          !customer.isWalkIn &&
          Number(customer.loyaltyPoints) > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">
                Redeem points ({Number(customer.loyaltyPoints)} available)
              </span>
              <Input
                type="number"
                min="0"
                max={Number(customer.loyaltyPoints)}
                value={redeemPoints}
                onChange={(e) => setRedeemPoints(e.target.value)}
                placeholder="0"
                className="h-7 w-20 text-right text-xs"
                aria-label="Loyalty points to redeem"
              />
            </div>
          ) : null}
        </div>

        {stockProblems.length > 0 ? (
          <div className="rounded-xs border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            Not enough stock for{" "}
            {stockProblems.map((l) => l.name).join(", ")}. Negative stock is
            disabled for this business.
          </div>
        ) : null}

        {discountBlocked ? (
          <div className="rounded-xs border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
            A {discountPercent.toFixed(1)}% discount exceeds the{" "}
            {config.maxDiscountPercent}% limit. Manager approval is required.
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={clearCart}
            disabled={lines.length === 0 || pending}
            className="flex-1"
          >
            <X className="size-3.5" />
            Clear
          </Button>
          <PaymentDialog
            disabled={!canCheckout || pending}
            total={summary.grandTotal}
            currency={config.currency}
            allowCredit={config.canSellOnCredit && Boolean(customer && !customer.isWalkIn)}
            allowSplit={config.splitPaymentEnabled}
            storeCredit={customer && !customer.isWalkIn ? customer.outstanding : null}
            onConfirm={completeSale}
            pending={pending}
          />
        </div>

        {lastSale ? (
          <div className="rounded-xs border border-success/40 bg-success/10 px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-success">
                Sale complete
              </span>
              <button
                type="button"
                onClick={() => setLastSale(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="mt-1.5 font-mono text-sm font-semibold">
              {lastSale.invoiceNumber}
            </div>
            <dl className="mt-1.5 space-y-0.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="tabular">
                  {formatMoney(lastSale.grandTotal, { currency: config.currency })}
                </dd>
              </div>
              {Number(lastSale.change) > 0 ? (
                <div className="flex justify-between font-semibold">
                  <dt>Change due</dt>
                  <dd className="tabular">
                    {formatMoney(lastSale.change, { currency: config.currency })}
                  </dd>
                </div>
              ) : null}
              {Number(lastSale.balance) > 0 ? (
                <div className="flex justify-between text-warning">
                  <dt>On credit</dt>
                  <dd className="tabular">
                    {formatMoney(lastSale.balance, { currency: config.currency })}
                  </dd>
                </div>
              ) : null}
              {Number(lastSale.loyalty) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Points earned</dt>
                  <dd className="tabular">{Number(lastSale.loyalty)}</dd>
                </div>
              ) : null}
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-2.5 w-full">
              <Link href={`/sales/${lastSale.invoiceId}/receipt`} target="_blank">
                <Printer className="size-3.5" />
                Print receipt
              </Link>
            </Button>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm tabular",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Customer panel                                                             */
/* -------------------------------------------------------------------------- */

function CustomerPanel({
  customer,
  onChange,
  recent,
  walkIn,
  currency,
  loyaltyEnabled,
}: {
  customer: PosCustomer | null;
  onChange: (c: PosCustomer | null) => void;
  recent: PosCustomer[];
  walkIn: PosCustomer | null;
  currency: string;
  loyaltyEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosCustomer[]>(recent);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [pending, startTransition] = useTransition();

  function runSearch(value: string) {
    setTerm(value);
    startTransition(async () => {
      const rows = await searchCustomers(value);
      setResults(rows);
    });
  }

  function create() {
    startTransition(async () => {
      const result = await quickCreateCustomer(newName, newPhone);
      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Could not create the customer.");
        return;
      }
      onChange({
        id: result.data.id,
        name: result.data.name,
        phone: result.data.phone,
        outstanding: "0",
        creditLimit: "0",
        loyaltyPoints: "0",
        isWalkIn: false,
        type: "retail",
      });
      setNewName("");
      setNewPhone("");
      setOpen(false);
      toast.success("Customer added.");
    });
  }

  return (
    <div className="rounded-xs border border-border bg-card px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <UserRound className="size-3.5 text-muted-foreground" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {customer?.name ?? "No customer"}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {customer?.isWalkIn
                ? "Walk-in — no account"
                : (customer?.phone ?? "No phone on file")}
            </div>
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="xs">
              Change
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Select customer</DialogTitle>
              <DialogDescription>
                Search an existing customer or add a new one without leaving the
                till.
              </DialogDescription>
            </DialogHeader>

            <Input
              value={term}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search by name, phone or code…"
              autoFocus
            />

            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xs border border-border scrollbar-thin">
              {walkIn ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(walkIn);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">Walk-in customer</span>
                    <Badge variant="soft-neutral">Default</Badge>
                  </button>
                </li>
              ) : null}
              {results
                .filter((r) => !r.isWalkIn)
                .map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(row);
                        setOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {row.phone ?? "No phone"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px]">
                        {Number(row.outstanding) > 0 ? (
                          <span className="block text-warning">
                            Owes {formatMoney(row.outstanding, { currency })}
                          </span>
                        ) : null}
                        {loyaltyEnabled && Number(row.loyaltyPoints) > 0 ? (
                          <span className="block text-muted-foreground">
                            {Number(row.loyaltyPoints)} pts
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              {results.filter((r) => !r.isWalkIn).length === 0 ? (
                <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No matching customers.
                </li>
              ) : null}
            </ul>

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Add new
              </p>
              <div className="flex gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                />
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="accent"
                size="sm"
                onClick={create}
                disabled={!newName.trim() || pending}
              >
                Add customer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {customer && !customer.isWalkIn && Number(customer.outstanding) > 0 ? (
        <div className="mt-2 rounded-xs bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
          Outstanding balance {formatMoney(customer.outstanding, { currency })} of a{" "}
          {formatMoney(customer.creditLimit, { currency })} limit.
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                    */
/* -------------------------------------------------------------------------- */

function PaymentDialog({
  disabled,
  total,
  currency,
  allowCredit,
  allowSplit,
  onConfirm,
  pending,
}: {
  disabled: boolean;
  total: string;
  currency: string;
  allowCredit: boolean;
  allowSplit: boolean;
  storeCredit: string | null;
  onConfirm: (
    payments: {
      method: PaymentMethod;
      amount: string;
      reference?: string;
      tenderedAmount?: string;
    }[],
  ) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [secondMethod, setSecondMethod] = useState<PaymentMethod>("upi");
  const [secondAmount, setSecondAmount] = useState("");
  const [split, setSplit] = useState(false);
  const [onCredit, setOnCredit] = useState(false);

  const totalNumber = Number(total);
  const secondNumber = Number(secondAmount) || 0;
  const primaryDue = split
    ? Math.max(0, totalNumber - secondNumber)
    : onCredit
      ? 0
      : totalNumber;

  const tenderedNumber = Number(tendered) || 0;
  const change =
    method === "cash" && tenderedNumber > primaryDue
      ? tenderedNumber - primaryDue
      : 0;

  // Quick-tender presets rounded up from the amount due.
  const presets = useMemo(() => {
    const base = Math.ceil(primaryDue);
    return [base, Math.ceil(base / 50) * 50, Math.ceil(base / 100) * 100, Math.ceil(base / 500) * 500]
      .filter((v, i, arr) => v > 0 && arr.indexOf(v) === i)
      .slice(0, 4);
  }, [primaryDue]);

  function submit() {
    const payments: {
      method: PaymentMethod;
      amount: string;
      reference?: string;
      tenderedAmount?: string;
    }[] = [];

    if (primaryDue > 0) {
      payments.push({
        method,
        amount: primaryDue.toFixed(2),
        reference: reference || undefined,
        tenderedAmount:
          method === "cash" && tenderedNumber > 0
            ? tenderedNumber.toFixed(2)
            : undefined,
      });
    }
    if (split && secondNumber > 0) {
      payments.push({
        method: secondMethod,
        amount: Math.min(secondNumber, totalNumber).toFixed(2),
      });
    }

    onConfirm(payments);
    setOpen(false);
    setTendered("");
    setReference("");
    setSecondAmount("");
    setSplit(false);
    setOnCredit(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="sm" disabled={disabled} className="flex-[2]">
          Take payment · {formatMoney(total, { currency })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Take payment</DialogTitle>
          <DialogDescription>
            Amount due {formatMoney(total, { currency })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMethod(m.value);
                  setOnCredit(false);
                }}
                className={cn(
                  "rounded-xs border px-2 py-2 text-xs font-medium transition-colors",
                  method === m.value && !onCredit
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {allowCredit ? (
            <label className="flex items-center justify-between gap-2 rounded-xs border border-border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">Put on account</span>
                <span className="block text-[11px] text-muted-foreground">
                  Records the full amount as a receivable.
                </span>
              </span>
              <input
                type="checkbox"
                checked={onCredit}
                onChange={(e) => {
                  setOnCredit(e.target.checked);
                  if (e.target.checked) setSplit(false);
                }}
                className="size-4 accent-[hsl(var(--accent))]"
              />
            </label>
          ) : null}

          {!onCredit && method === "cash" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTendered(String(preset))}
                    className="flex-1 rounded-xs border border-border bg-card px-2 py-1.5 text-xs font-medium hover:bg-muted"
                  >
                    {formatMoney(preset, { currency, decimals: 0 })}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={tendered}
                onChange={(e) => setTendered(e.target.value)}
                placeholder="Cash received"
                className="text-right text-lg"
                autoFocus
              />
              {change > 0 ? (
                <div className="flex items-baseline justify-between rounded-xs bg-success/10 px-3 py-2">
                  <span className="text-sm font-medium text-success">Change due</span>
                  <span className="text-lg font-semibold tabular text-success">
                    {formatMoney(change, { currency })}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {!onCredit && method !== "cash" ? (
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Transaction reference (optional)"
            />
          ) : null}

          {allowSplit && !onCredit ? (
            <div className="rounded-xs border border-border px-3 py-2">
              <label className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">Split payment</span>
                <input
                  type="checkbox"
                  checked={split}
                  onChange={(e) => setSplit(e.target.checked)}
                  className="size-4 accent-[hsl(var(--accent))]"
                />
              </label>
              {split ? (
                <div className="mt-2 flex gap-2">
                  <select
                    value={secondMethod}
                    onChange={(e) =>
                      setSecondMethod(e.target.value as PaymentMethod)
                    }
                    className="h-9 rounded-xs border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                  >
                    {METHODS.filter((m) => m.value !== method).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={totalNumber}
                    value={secondAmount}
                    onChange={(e) => setSecondAmount(e.target.value)}
                    placeholder="Amount"
                    className="text-right"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <dl className="rounded-xs bg-muted/60 px-3 py-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                {METHODS.find((m) => m.value === method)?.label ?? "Payment"}
              </dt>
              <dd className="tabular">{formatMoney(primaryDue, { currency })}</dd>
            </div>
            {split && secondNumber > 0 ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {METHODS.find((m) => m.value === secondMethod)?.label}
                </dt>
                <dd className="tabular">{formatMoney(secondNumber, { currency })}</dd>
              </div>
            ) : null}
            {onCredit ? (
              <div className="flex justify-between text-warning">
                <dt>On account</dt>
                <dd className="tabular">{formatMoney(total, { currency })}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={submit}
            disabled={pending || (!onCredit && method === "cash" && tenderedNumber < primaryDue)}
          >
            Complete sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
