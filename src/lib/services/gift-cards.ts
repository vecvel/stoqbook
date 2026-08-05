import "server-only";

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { customers, giftCardTransactions, giftCards } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/authz/errors";
import { add, cmp, isPositive, negate } from "@/lib/money";

import { auditEvent } from "./audit";

/**
 * Gift cards (10-sales-pos.md § Gift Cards).
 *
 * The card's `balance` is a synchronised total, and `gift_card_transactions` is
 * the authoritative append-only ledger behind it — the same arrangement
 * inventory and customer credit use. Both move inside one transaction so they
 * can never disagree. Redemption lives in the sales service, because it has to
 * happen inside the sale's own transaction.
 */

/** Human-readable and unambiguous: no O/0 or I/1 to mistype. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  return [
    chars.slice(0, 4).join(""),
    chars.slice(4, 8).join(""),
    chars.slice(8, 12).join(""),
  ].join("-");
}

export interface IssueGiftCardInput {
  amount: string;
  /** Optional owner; an unassigned card is a bearer card. */
  customerId?: string | null;
  expiresAt?: Date | null;
  /** Supply to use a pre-printed code instead of generating one. */
  code?: string;
}

export interface IssueGiftCardResult {
  giftCardId: string;
  code: string;
  balance: string;
}

export async function issueGiftCard(
  ctx: BusinessContext,
  input: IssueGiftCardInput,
): Promise<IssueGiftCardResult> {
  if (!isPositive(input.amount)) {
    throw ValidationError("A gift card must be issued with a positive value.");
  }

  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!customer) throw ValidationError("Customer not found.");
  }

  const code = (input.code?.trim() || generateCode()).toUpperCase();

  const [clash] = await db
    .select({ id: giftCards.id })
    .from(giftCards)
    .where(
      and(eq(giftCards.tenant_id, ctx.business.id), eq(giftCards.code, code)),
    )
    .limit(1);
  if (clash) throw ConflictError("That gift card code is already in use.");

  return db.transaction(async (tx) => {
    const [card] = await tx
      .insert(giftCards)
      .values({
        tenant_id: ctx.business.id,
        code,
        initial_balance: input.amount,
        balance: input.amount,
        customer_id: input.customerId ?? null,
        expires_at: input.expiresAt ?? null,
        is_active: true,
      })
      .returning();

    await tx.insert(giftCardTransactions).values({
      tenant_id: ctx.business.id,
      gift_card_id: card.id,
      amount: input.amount,
      balance_after: input.amount,
      kind: "issue",
      created_by: ctx.user.id,
    });

    await auditEvent(
      ctx,
      {
        event: "GiftCardIssued",
        moduleSlug: "sales",
        entityType: "gift_card",
        entityId: card.id,
        summary: `Gift card ${code} issued for ${input.amount}`,
        payload: { customer_id: input.customerId ?? null },
      },
      tx,
    );

    return { giftCardId: card.id, code, balance: input.amount };
  });
}

/** Adds value to a live card. */
export async function topUpGiftCard(
  ctx: BusinessContext,
  input: { giftCardId: string; amount: string },
): Promise<{ balance: string }> {
  if (!isPositive(input.amount)) {
    throw ValidationError("Enter an amount greater than zero.");
  }

  return db.transaction(async (tx) => {
    // Locked so two concurrent top-ups cannot both read the same balance.
    const [card] = await tx
      .select()
      .from(giftCards)
      .where(
        and(
          eq(giftCards.id, input.giftCardId),
          eq(giftCards.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!card) throw NotFoundError("Gift card not found.");
    if (!card.is_active) {
      throw ConflictError("This card is deactivated and cannot be topped up.");
    }
    if (card.expires_at && card.expires_at < new Date()) {
      throw ConflictError("This card has expired.");
    }

    const balance = add(card.balance, input.amount);

    await tx
      .update(giftCards)
      .set({ balance, updated_at: new Date() })
      .where(eq(giftCards.id, card.id));

    await tx.insert(giftCardTransactions).values({
      tenant_id: ctx.business.id,
      gift_card_id: card.id,
      amount: input.amount,
      balance_after: balance,
      kind: "topup",
      created_by: ctx.user.id,
    });

    await auditEvent(
      ctx,
      {
        event: "GiftCardToppedUp",
        moduleSlug: "sales",
        entityType: "gift_card",
        entityId: card.id,
        summary: `${card.code} topped up by ${input.amount}`,
      },
      tx,
    );

    return { balance };
  });
}

/**
 * Deactivates a card, writing off any remaining balance.
 *
 * The write-off is a ledger entry rather than a silent reset, so the money that
 * left the card is always traceable.
 */
export async function deactivateGiftCard(
  ctx: BusinessContext,
  giftCardId: string,
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [card] = await tx
      .select()
      .from(giftCards)
      .where(
        and(
          eq(giftCards.id, giftCardId),
          eq(giftCards.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!card) throw NotFoundError("Gift card not found.");
    if (!card.is_active) throw ConflictError("This card is already inactive.");

    if (isPositive(card.balance)) {
      await tx.insert(giftCardTransactions).values({
        tenant_id: ctx.business.id,
        gift_card_id: card.id,
        amount: negate(card.balance),
        balance_after: "0",
        kind: "adjustment",
        created_by: ctx.user.id,
      });
    }

    await tx
      .update(giftCards)
      .set({ balance: "0", is_active: false, updated_at: new Date() })
      .where(eq(giftCards.id, card.id));

    await auditEvent(
      ctx,
      {
        event: "GiftCardDeactivated",
        moduleSlug: "sales",
        entityType: "gift_card",
        entityId: card.id,
        summary: `${card.code} deactivated with ${card.balance} written off`,
        payload: { reason: reason ?? null },
      },
      tx,
    );
  });
}

/** Reverses a redemption, e.g. when the sale it paid for is returned. */
export async function refundToGiftCard(
  ctx: BusinessContext,
  input: {
    giftCardId: string;
    amount: string;
    referenceType?: string;
    referenceId?: string;
  },
): Promise<{ balance: string }> {
  if (!isPositive(input.amount)) {
    throw ValidationError("Enter an amount greater than zero.");
  }

  return db.transaction(async (tx) => {
    const [card] = await tx
      .select()
      .from(giftCards)
      .where(
        and(
          eq(giftCards.id, input.giftCardId),
          eq(giftCards.tenant_id, ctx.business.id),
        ),
      )
      .limit(1)
      .for("update");

    if (!card) throw NotFoundError("Gift card not found.");

    const balance = add(card.balance, input.amount);

    await tx
      .update(giftCards)
      // A refund revives a card that was spent down and closed.
      .set({ balance, is_active: true, updated_at: new Date() })
      .where(eq(giftCards.id, card.id));

    await tx.insert(giftCardTransactions).values({
      tenant_id: ctx.business.id,
      gift_card_id: card.id,
      amount: input.amount,
      balance_after: balance,
      kind: "refund",
      reference_type: input.referenceType ?? null,
      reference_id: input.referenceId ?? null,
      created_by: ctx.user.id,
    });

    return { balance };
  });
}

/** Cards whose ledger disagrees with their stored balance. Should be empty. */
export async function giftCardDrift(
  ctx: BusinessContext,
): Promise<{ code: string; balance: string; ledger: string }[]> {
  const rows = await db
    .select({
      code: giftCards.code,
      balance: giftCards.balance,
      ledger: giftCardTransactions.amount,
    })
    .from(giftCards)
    .leftJoin(
      giftCardTransactions,
      eq(giftCardTransactions.gift_card_id, giftCards.id),
    )
    .where(eq(giftCards.tenant_id, ctx.business.id));

  const totals = new Map<string, { balance: string; ledger: string }>();
  for (const row of rows) {
    const entry = totals.get(row.code) ?? { balance: row.balance, ledger: "0" };
    entry.ledger = add(entry.ledger, row.ledger ?? "0");
    totals.set(row.code, entry);
  }

  return [...totals.entries()]
    .filter(([, v]) => cmp(v.balance, v.ledger) !== 0)
    .map(([code, v]) => ({ code, ...v }));
}
