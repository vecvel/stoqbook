import type { Metadata } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { db } from "@/db";
import { customers, posSessions } from "@/db/schema";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import { loadSettings, readBoolean, readNumber } from "@/lib/services/settings";

import { scopedWarehouses } from "../inventory/warehouse-scope";
import { PosTerminal, type PosCustomer } from "./pos-terminal";
import { SessionPanel } from "./session-panel";

export const metadata: Metadata = { title: "Point of Sale" };

export default async function PosPage() {
  const ctx = await requirePermission("pos.use", { feature: "pos.billing" });

  const [warehouses, settings] = await Promise.all([
    scopedWarehouses(ctx),
    loadSettings({
      businessId: ctx.business.id,
      storeId: ctx.activeStore?.id,
      userId: ctx.user.id,
    }),
  ]);

  if (warehouses.length === 0 || !ctx.activeStore) {
    return (
      <div className="page">
        <PageHeader title="Point of Sale" />
        <EmptyState
          icon="Warehouse"
          title="No warehouse available"
          description="A store and warehouse are required before billing."
          action={
            hasPermission(ctx, "settings.warehouses")
              ? { label: "Manage warehouses", href: "/settings/warehouses" }
              : undefined
          }
        />
      </div>
    );
  }

  const warehouse = warehouses[0];
  const sessionsEnabled = ctx.entitlements.features.has("pos.sessions");
  const requireSession =
    sessionsEnabled && readBoolean(settings, "pos.require_session");

  const [session] = sessionsEnabled
    ? await db
        .select()
        .from(posSessions)
        .where(
          and(
            eq(posSessions.tenant_id, ctx.business.id),
            eq(posSessions.cashier_id, ctx.user.id),
            isNull(posSessions.closed_at),
          ),
        )
        .orderBy(desc(posSessions.opened_at))
        .limit(1)
    : [];

  /* Customers: the walk-in default plus recent accounts. */
  const customerRows = hasPermission(ctx, "customers.view")
    ? await db
        .select({
          id: customers.id,
          name: customers.name,
          phone: customers.phone,
          outstanding: customers.outstanding_balance,
          creditLimit: customers.credit_limit,
          loyaltyPoints: customers.loyalty_points,
          isWalkIn: customers.is_walk_in,
          type: customers.type,
        })
        .from(customers)
        .where(
          and(
            eq(customers.tenant_id, ctx.business.id),
            isNull(customers.deleted_at),
          ),
        )
        .orderBy(desc(customers.is_walk_in), desc(customers.last_purchase_at))
        .limit(12)
    : [];

  const mapped: PosCustomer[] = customerRows.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    outstanding: String(c.outstanding),
    creditLimit: String(c.creditLimit),
    loyaltyPoints: String(c.loyaltyPoints),
    isWalkIn: c.isWalkIn,
    type: c.type,
  }));

  const walkIn = mapped.find((c) => c.isWalkIn) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Point of Sale"
        description={`${ctx.activeStore.name} · ${warehouse.name} · ${ctx.user.full_name}`}
        actions={
          sessionsEnabled ? (
            <SessionPanel
              warehouseId={warehouse.id}
              session={
                session
                  ? {
                      id: session.id,
                      number: session.session_number,
                      openedAt: session.opened_at.toISOString(),
                      openingCash: String(session.opening_cash),
                      expectedCash: String(session.expected_cash),
                      totalSales: String(session.total_sales),
                      totalRefunds: String(session.total_refunds),
                      transactionCount: session.transaction_count,
                    }
                  : null
              }
              currency={ctx.business.currency}
              canOpen={hasPermission(ctx, "pos.open_session")}
              canClose={hasPermission(ctx, "pos.close_session")}
            />
          ) : null
        }
      />

      <PosTerminal
        config={{
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          storeName: ctx.activeStore.name,
          currency: ctx.business.currency,
          sessionId: session?.id ?? null,
          requireSession,
          maxDiscountPercent: readNumber(settings, "sales.max_discount_percent", 100),
          canOverrideDiscount: hasPermission(ctx, "sales.discount_override"),
          canSellOnCredit:
            hasPermission(ctx, "sales.credit") &&
            ctx.entitlements.features.has("sales.credit"),
          canDiscount:
            hasPermission(ctx, "sales.discount") &&
            readBoolean(settings, "sales.allow_discounts"),
          allowNegativeStock: readBoolean(
            settings,
            "inventory.allow_negative_stock",
          ),
          roundOff: readBoolean(settings, "sales.round_off"),
          loyaltyEnabled:
            readBoolean(settings, "sales.loyalty_enabled") &&
            ctx.entitlements.features.has("customers.loyalty"),
          splitPaymentEnabled: ctx.entitlements.features.has("sales.split_payment"),
          cashierName: ctx.user.full_name,
        }}
        walkIn={walkIn}
        recentCustomers={mapped}
      />
    </div>
  );
}
