"use server";

import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { ConflictError, NotFoundError } from "@/lib/authz/errors";
import { auditEvent } from "@/lib/services/audit";
import { emit } from "@/lib/services/notifications";
import { nextNumber } from "@/lib/services/numbering";
import { loadSettings, readBoolean, readNumber } from "@/lib/services/settings";
import {
  bool,
  dateOrNull,
  decimalStr,
  failure,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

export async function saveExpense(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const id = uuid(form, "id");
    const ctx = await requirePermission(
      id ? "expenses.update" : "expenses.create",
    );

    if (!ctx.activeStore) return failure("No store selected.");

    const title = str(form, "title");
    if (!title) return failure("Describe the expense.", { title: ["Required."] });

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) {
      return failure("Amount must be greater than zero.", {
        amount: ["Must be greater than zero."],
      });
    }

    const values = {
      category_id: uuid(form, "category_id"),
      title,
      expense_date: dateOrNull(form, "expense_date") ?? new Date(),
      amount,
      tax_amount: decimalStr(form, "tax_amount"),
      method: (str(form, "method") || "cash") as
        | "cash"
        | "card"
        | "upi"
        | "bank_transfer"
        | "cheque"
        | "wallet"
        | "online",
      reference: optionalStr(form, "reference"),
      note: optionalStr(form, "note"),
    };

    /* An expense at or above the threshold needs approving before it counts as
       settled (20-workflows.md § Expense Approval). Below it, nothing queues. */
    const settings = await loadSettings({ businessId: ctx.business.id });
    const approvalRequired =
      ctx.entitlements.features.has("expenses.approvals") &&
      readBoolean(settings, "expenses.approval_required");
    const threshold = readNumber(settings, "expenses.approval_threshold", 0);
    const needsApproval = approvalRequired && Number(amount) >= threshold;

    if (id) {
      const [existing] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.id, id), eq(expenses.tenant_id, ctx.business.id)))
        .limit(1);
      if (!existing) throw NotFoundError("Expense not found.");

      await db
        .update(expenses)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(eq(expenses.id, id));

      await auditEvent(ctx, {
        event: "ExpenseRecorded",
        moduleSlug: "expenses",
        entityType: "expense",
        entityId: id,
        summary: `Updated expense ${title}`,
      });
    } else {
      const expenseNumber = await nextNumber(ctx.business.id, "expense", {
        storeId: ctx.activeStore.id,
      });

      const [created] = await db
        .insert(expenses)
        .values({
          tenant_id: ctx.business.id,
          store_id: ctx.activeStore.id,
          expense_number: expenseNumber,
          ...values,
          approval_status: needsApproval ? "pending" : "not_required",
          created_by: ctx.user.id,
        })
        .returning();

      await auditEvent(ctx, {
        event: "ExpenseRecorded",
        moduleSlug: "expenses",
        entityType: "expense",
        entityId: created.id,
        summary: `Recorded ${title} for ${Number(amount).toFixed(2)}`,
        payload: { approval_status: created.approval_status },
      });

      if (needsApproval) {
        await emit({
          businessId: ctx.business.id,
          event: "ExpenseAwaitingApproval",
          moduleSlug: "expenses",
          priority: "high",
          title: "Expense awaiting approval",
          body: `${title} for ${Number(amount).toFixed(2)} needs approving.`,
          actionUrl: "/expenses?approval=pending",
          fallbackPermission: "expenses.approve",
          variables: {
            title,
            amount: Number(amount).toFixed(2),
            number: expenseNumber,
            employee: ctx.user.full_name,
          },
        });
      }
    }

    revalidate("/expenses", "/dashboard");
    return success(
      undefined,
      needsApproval && !id
        ? "Expense recorded and sent for approval."
        : "Expense saved.",
    );
  });
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses.delete");

    await db
      .delete(expenses)
      .where(
        and(eq(expenses.id, expenseId), eq(expenses.tenant_id, ctx.business.id)),
      );

    await auditEvent(ctx, {
      event: "ExpenseRecorded",
      moduleSlug: "expenses",
      entityType: "expense",
      entityId: expenseId,
      summary: "Expense deleted",
    });

    revalidate("/expenses", "/dashboard");
    return success(undefined, "Expense deleted.");
  });
}

export async function saveExpenseCategory(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses.update", {
      feature: "expenses.categories",
    });

    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Category name is required.");

    if (id) {
      await db
        .update(expenseCategories)
        .set({
          name,
          is_active: bool(form, "is_active"),
          updated_at: new Date(),
        })
        .where(
          and(
            eq(expenseCategories.id, id),
            eq(expenseCategories.tenant_id, ctx.business.id),
          ),
        );
    } else {
      await db
        .insert(expenseCategories)
        .values({ tenant_id: ctx.business.id, name });
    }

    revalidate("/expenses", "/expenses/categories");
    return success(undefined, "Category saved.");
  });
}

export async function deleteExpenseCategory(
  categoryId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses.update", {
      feature: "expenses.categories",
    });

    const [inUse] = await db
      .select({ value: count() })
      .from(expenses)
      .where(
        and(
          eq(expenses.category_id, categoryId),
          eq(expenses.tenant_id, ctx.business.id),
        ),
      );
    if (Number(inUse?.value ?? 0) > 0) {
      throw ConflictError(
        "Expenses are recorded against this category. Reassign them first.",
      );
    }

    await db
      .delete(expenseCategories)
      .where(
        and(
          eq(expenseCategories.id, categoryId),
          eq(expenseCategories.tenant_id, ctx.business.id),
        ),
      );

    revalidate("/expenses/categories");
    return success(undefined, "Category deleted.");
  });
}

/**
 * Approves or rejects a pending expense.
 *
 * An expense the current user recorded cannot be self-approved — that is the
 * only reason the approval step exists.
 */
export async function decideExpense(
  expenseId: string,
  decision: "approved" | "rejected",
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses.approve", {
      feature: "expenses.approvals",
    });

    const [expense] = await db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.id, expenseId), eq(expenses.tenant_id, ctx.business.id)),
      )
      .limit(1);
    if (!expense) throw NotFoundError("Expense not found.");

    if (expense.approval_status !== "pending") {
      return failure(
        expense.approval_status === "not_required"
          ? "This expense does not need approval."
          : `This expense has already been ${expense.approval_status}.`,
      );
    }
    if (expense.created_by === ctx.user.id) {
      return failure("You cannot approve an expense you recorded yourself.");
    }
    if (decision === "rejected" && !reason?.trim()) {
      return failure("Give a reason when rejecting an expense.");
    }

    await db
      .update(expenses)
      .set({
        approval_status: decision,
        approved_by: ctx.user.id,
        approved_at: new Date(),
        rejection_reason: decision === "rejected" ? reason!.trim() : null,
        updated_at: new Date(),
        updated_by: ctx.user.id,
      })
      .where(eq(expenses.id, expenseId));

    await auditEvent(ctx, {
      event: decision === "approved" ? "ExpenseApproved" : "ExpenseRejected",
      moduleSlug: "expenses",
      entityType: "expense",
      entityId: expenseId,
      summary: `${expense.expense_number} ${decision}`,
      payload: { reason: reason?.trim() ?? null },
    });

    revalidate("/expenses", "/dashboard");
    return success(
      undefined,
      decision === "approved"
        ? `${expense.expense_number} approved.`
        : `${expense.expense_number} rejected.`,
    );
  });
}
