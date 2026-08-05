"use server";

import { requirePermission } from "@/lib/authz/guard";
import {
  deactivateGiftCard,
  issueGiftCard,
  topUpGiftCard,
} from "@/lib/services/gift-cards";
import {
  dateOrNull,
  decimalStr,
  failure,
  optionalStr,
  revalidate,
  runAction,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

export async function issueCard(
  _prev: ActionResult<{ code: string }>,
  form: FormData,
): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.create", {
      feature: "sales.gift_cards",
    });

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) {
      return failure("Enter an amount greater than zero.", {
        amount: ["Must be greater than zero."],
      });
    }

    const result = await issueGiftCard(ctx, {
      amount,
      customerId: uuid(form, "customer_id"),
      expiresAt: dateOrNull(form, "expires_at"),
      code: optionalStr(form, "code") ?? undefined,
    });

    revalidate("/sales/gift-cards");
    return success(
      { code: result.code },
      `Gift card ${result.code} issued for ${result.balance}.`,
    );
  });
}

export async function topUpCard(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("sales.create", {
      feature: "sales.gift_cards",
    });

    const giftCardId = uuid(form, "gift_card_id");
    if (!giftCardId) return failure("Gift card not found.");

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) {
      return failure("Enter an amount greater than zero.");
    }

    const result = await topUpGiftCard(ctx, { giftCardId, amount });

    revalidate("/sales/gift-cards");
    return success(undefined, `Topped up. New balance ${result.balance}.`);
  });
}

export async function deactivateCard(
  giftCardId: string,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    // Writing off a balance is a money decision, so it needs the same
    // permission as cancelling a sale rather than merely creating one.
    const ctx = await requirePermission("sales.cancel", {
      feature: "sales.gift_cards",
    });

    await deactivateGiftCard(ctx, giftCardId, reason);

    revalidate("/sales/gift-cards");
    return success(undefined, "Gift card deactivated and its balance written off.");
  });
}
