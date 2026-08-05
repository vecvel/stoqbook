import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, desc, eq, ilike, isNull, sql } from "drizzle-orm";

import {
  EmptyRow,
  Pagination,
  Table,
  TableShell,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/shared/data-table";
import {
  FilterBar,
  ResetFilters,
  SearchFilter,
  SelectFilter,
} from "@/components/shared/filter-bar";
import { Notice } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatGrid, StatTile } from "@/components/shared/stat-tile";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { customers, giftCards } from "@/db/schema";
import { parseListQuery } from "@/lib/api/query";
import { hasPermission } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/guard";
import {
  currencySymbol,
  formatDate,
  formatMoney,
  formatMoneyCompact,
} from "@/lib/format";
import { cn } from "@/lib/utils";

import { GiftCardRowActions, IssueGiftCardForm } from "./gift-card-panel";

export const metadata: Metadata = { title: "Gift cards" };

export default async function GiftCardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requirePermission("sales.view", {
    feature: "sales.gift_cards",
  });
  const params = await searchParams;
  const query = parseListQuery(params, { defaultLimit: 25 });

  const filters = [eq(giftCards.tenant_id, ctx.business.id)];
  if (query.search) {
    filters.push(ilike(giftCards.code, `%${query.search}%`));
  }
  if (query.filters.status === "active") {
    filters.push(eq(giftCards.is_active, true));
  } else if (query.filters.status === "closed") {
    filters.push(eq(giftCards.is_active, false));
  }
  const where = and(...filters);

  const currency = ctx.business.currency;
  const now = new Date();

  const [rows, totalRow, summary, customerOptions] = await Promise.all([
    db
      .select({
        id: giftCards.id,
        code: giftCards.code,
        initialBalance: giftCards.initial_balance,
        balance: giftCards.balance,
        issuedAt: giftCards.issued_at,
        expiresAt: giftCards.expires_at,
        isActive: giftCards.is_active,
        customerId: giftCards.customer_id,
        customerName: customers.name,
      })
      .from(giftCards)
      .leftJoin(customers, eq(customers.id, giftCards.customer_id))
      .where(where)
      .orderBy(desc(giftCards.issued_at))
      .limit(query.limit)
      .offset(query.offset),

    db.select({ value: count() }).from(giftCards).where(where),

    db
      .select({
        live: sql<number>`count(*) filter (where ${giftCards.is_active})::int`,
        outstanding: sql<string>`coalesce(sum(${giftCards.balance}) filter (where ${giftCards.is_active}), 0)`,
        issued: sql<string>`coalesce(sum(${giftCards.initial_balance}), 0)`,
        expiring: sql<number>`count(*) filter (
          where ${giftCards.is_active}
            and ${giftCards.expires_at} is not null
            and ${giftCards.expires_at} <= now() + interval '30 days')::int`,
      })
      .from(giftCards)
      .where(eq(giftCards.tenant_id, ctx.business.id)),

    db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(
        and(
          eq(customers.tenant_id, ctx.business.id),
          isNull(customers.deleted_at),
          eq(customers.is_walk_in, false),
        ),
      )
      .orderBy(asc(customers.name))
      .limit(200),
  ]);

  const total = Number(totalRow[0]?.value ?? 0);
  const stats = summary[0];
  const canIssue = hasPermission(ctx, "sales.create");
  const canClose = hasPermission(ctx, "sales.cancel");

  return (
    <div className="page">
      <PageHeader
        title="Gift cards"
        description="Prepaid value redeemable at the till. A card's balance is backed by an append-only ledger, so every movement is traceable."
        breadcrumbs={[
          { label: "Sales", href: "/sales" },
          { label: "Gift cards" },
        ]}
      />

      <StatGrid>
        <StatTile
          label="Live cards"
          value={String(stats?.live ?? 0)}
          tone="accent"
          icon="CreditCard"
        />
        <StatTile
          label="Outstanding value"
          value={formatMoneyCompact(stats?.outstanding ?? "0", currency)}
          sublabel="Owed to customers"
          tone={Number(stats?.outstanding ?? 0) > 0 ? "warning" : "neutral"}
          icon="Wallet"
        />
        <StatTile
          label="Issued to date"
          value={formatMoneyCompact(stats?.issued ?? "0", currency)}
          icon="Coins"
        />
        <StatTile
          label="Expiring soon"
          value={String(stats?.expiring ?? 0)}
          sublabel="Within 30 days"
          tone={(stats?.expiring ?? 0) > 0 ? "warning" : "neutral"}
          icon="Clock"
        />
      </StatGrid>

      {Number(stats?.outstanding ?? 0) > 0 ? (
        <Notice tone="info" title="Outstanding value is a liability">
          Unspent gift card balances are money owed to customers, not revenue.
          They are recognised when the card is redeemed, not when it is sold.
        </Notice>
      ) : null}

      <FilterBar>
        <SearchFilter placeholder="Search by card code…" />
        <SelectFilter
          paramName="status"
          label="Status"
          options={[
            { value: "active", label: "Live" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <ResetFilters />
      </FilterBar>

      <TableShell>
        <Table>
          <THead>
            <TH>Code</TH>
            <TH>Holder</TH>
            <TH>Issued</TH>
            <TH>Expires</TH>
            <TH align="right">Loaded</TH>
            <TH align="right">Balance</TH>
            <TH align="right">Status</TH>
            <TH align="right" />
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={8}>
                No gift cards match these filters.
              </EmptyRow>
            ) : (
              rows.map((row) => {
                const expired =
                  row.expiresAt !== null && new Date(row.expiresAt) < now;
                const spent = Number(row.balance) === 0;
                return (
                  <TR key={row.id}>
                    <TD mono className="font-medium">
                      {row.code}
                    </TD>
                    <TD>
                      {row.customerId ? (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="hover:text-accent hover:underline"
                        >
                          {row.customerName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Bearer</span>
                      )}
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDate(row.issuedAt)}
                    </TD>
                    <TD
                      className={cn(
                        "text-muted-foreground",
                        expired && row.isActive && "font-medium text-destructive",
                      )}
                    >
                      {row.expiresAt ? formatDate(row.expiresAt) : "Never"}
                    </TD>
                    <TD align="right" className="text-muted-foreground">
                      {formatMoney(row.initialBalance, { currency })}
                    </TD>
                    <TD align="right" className="font-medium">
                      {formatMoney(row.balance, { currency })}
                    </TD>
                    <TD align="right">
                      {!row.isActive ? (
                        <Badge variant="soft-neutral">Closed</Badge>
                      ) : expired ? (
                        <Badge variant="soft-warning">Expired</Badge>
                      ) : spent ? (
                        <Badge variant="soft-neutral">Spent</Badge>
                      ) : (
                        <Badge variant="soft-success">Live</Badge>
                      )}
                    </TD>
                    <TD align="right">
                      <GiftCardRowActions
                        giftCardId={row.id}
                        code={row.code}
                        isActive={row.isActive}
                        canTopUp={canIssue && !expired}
                        canDeactivate={canClose}
                      />
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
        <Pagination
          page={query.page}
          limit={query.limit}
          total={total}
          baseParams={{ search: query.search, status: query.filters.status }}
        />
      </TableShell>

      {canIssue ? (
        <IssueGiftCardForm
          customers={customerOptions}
          currencySymbol={currencySymbol(currency)}
        />
      ) : null}
    </div>
  );
}
