"use server";

import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { customerGroups, customers, salesInvoices } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/authz/errors";
import { auditEvent, diff } from "@/lib/services/audit";
import { nextNumber } from "@/lib/services/numbering";
import { loadSettings, readBoolean } from "@/lib/services/settings";
import { assertWithinLimit } from "@/lib/services/business";
import { mergeCustomers } from "@/lib/services/merge";
import {
  bool,
  dateOrNull,
  decimalStr,
  failure,
  num,
  optionalStr,
  revalidate,
  runAction,
  str,
  success,
  uuid,
  type ActionResult,
} from "@/lib/actions";

export async function saveCustomer(
  _prev: ActionResult<{ id: string }>,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = uuid(form, "id");
    const ctx = await requirePermission(
      id ? "customers.update" : "customers.create",
    );

    const name = str(form, "name");
    if (!name) return failure("Customer name is required.", { name: ["Required."] });

    const phone = optionalStr(form, "phone");
    const settings = await loadSettings({ businessId: ctx.business.id });

    // Phone uniqueness is a tenant-level policy, not a hard rule.
    if (phone && readBoolean(settings, "customers.phone_unique")) {
      const clash = await db
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.tenant_id, ctx.business.id),
            eq(customers.phone, phone),
            id ? ne(customers.id, id) : undefined,
          ),
        )
        .limit(1);
      if (clash.length > 0) {
        return failure("That phone number already belongs to another customer.", {
          phone: ["Already used."],
        });
      }
    }

    const values = {
      name,
      company_name: optionalStr(form, "company_name"),
      type: (str(form, "type") || "retail") as
        | "walk_in"
        | "retail"
        | "wholesale"
        | "corporate"
        | "distributor"
        | "employee",
      group_id: uuid(form, "group_id"),
      phone,
      email: optionalStr(form, "email"),
      tax_number: optionalStr(form, "tax_number"),
      date_of_birth: dateOrNull(form, "date_of_birth"),
      credit_limit: decimalStr(form, "credit_limit"),
      payment_terms_days: num(form, "payment_terms_days"),
      status: (str(form, "status") || "active") as
        | "pending"
        | "active"
        | "inactive"
        | "blocked"
        | "archived",
      note: optionalStr(form, "note"),
    };

    if (id) {
      const [before] = await db
        .select()
        .from(customers)
        .where(
          and(eq(customers.id, id), eq(customers.tenant_id, ctx.business.id)),
        )
        .limit(1);
      if (!before) throw NotFoundError("Customer not found.");

      // The auto-provisioned walk-in customer must keep its identity.
      if (before.is_walk_in) {
        values.type = "walk_in";
        values.status = "active";
      }

      const [after] = await db
        .update(customers)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(eq(customers.id, id))
        .returning();

      const changes = diff(before, after);
      await auditEvent(ctx, {
        event: changes.credit_limit
          ? "CustomerCreditLimitChanged"
          : "CustomerUpdated",
        moduleSlug: "customers",
        entityType: "customer",
        entityId: id,
        summary: `Updated ${after.name}`,
        payload: { changes },
      });

      revalidate("/customers", `/customers/${id}`);
      return success({ id }, "Customer saved.");
    }

    await assertWithinLimit(ctx.business.id, "customers", ctx.entitlements);

    const code = str(form, "code") || (await nextNumber(ctx.business.id, "customer"));

    const [created] = await db
      .insert(customers)
      .values({
        tenant_id: ctx.business.id,
        code,
        ...values,
        created_by: ctx.user.id,
      })
      .returning();

    await auditEvent(ctx, {
      event: "CustomerCreated",
      moduleSlug: "customers",
      entityType: "customer",
      entityId: created.id,
      summary: `Created ${created.name} (${created.code})`,
    });

    revalidate("/customers", "/dashboard");
    redirect(`/customers/${created.id}`);
  });
}

export async function deleteCustomer(
  customerId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.delete");

    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, customerId),
          eq(customers.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!customer) throw NotFoundError("Customer not found.");

    if (customer.is_walk_in) {
      throw BusinessRuleError(
        "The walk-in customer is required for point-of-sale billing and cannot be deleted.",
        "WALK_IN_PROTECTED",
      );
    }

    // Deletion is prohibited once transactions exist (11-customers.md).
    const [used] = await db
      .select({ value: count() })
      .from(salesInvoices)
      .where(eq(salesInvoices.customer_id, customerId));

    if (Number(used?.value ?? 0) > 0) {
      throw BusinessRuleError(
        `${customer.name} has ${used.value} invoice(s) and cannot be deleted. Set the status to archived instead.`,
        "CUSTOMER_REFERENCED",
      );
    }

    await db
      .update(customers)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        status: "archived",
      })
      .where(eq(customers.id, customerId));

    await auditEvent(ctx, {
      event: "CustomerUpdated",
      moduleSlug: "customers",
      entityType: "customer",
      entityId: customerId,
      summary: `Deleted ${customer.name}`,
    });

    revalidate("/customers");
    redirect("/customers");
  });
}

/* -------------------------------------------------------------------------- */
/* Groups                                                                     */
/* -------------------------------------------------------------------------- */

export async function saveCustomerGroup(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.update", {
      feature: "customers.groups",
    });

    const id = uuid(form, "id");
    const name = str(form, "name");
    if (!name) return failure("Group name is required.");

    const values = {
      name,
      description: optionalStr(form, "description"),
      discount_percent: decimalStr(form, "discount_percent"),
      use_wholesale_price: bool(form, "use_wholesale_price"),
    };

    if (id) {
      await db
        .update(customerGroups)
        .set({ ...values, updated_at: new Date() })
        .where(
          and(
            eq(customerGroups.id, id),
            eq(customerGroups.tenant_id, ctx.business.id),
          ),
        );
    } else {
      await db
        .insert(customerGroups)
        .values({ tenant_id: ctx.business.id, ...values });
    }

    revalidate("/customers/groups", "/customers");
    return success(undefined, "Customer group saved.");
  });
}

export async function deleteCustomerGroup(
  groupId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.update", {
      feature: "customers.groups",
    });

    const [inUse] = await db
      .select({ value: count() })
      .from(customers)
      .where(
        and(
          eq(customers.group_id, groupId),
          eq(customers.tenant_id, ctx.business.id),
        ),
      );
    if (Number(inUse?.value ?? 0) > 0) {
      throw ConflictError(
        "Customers are assigned to this group. Reassign them before deleting.",
      );
    }

    await db
      .delete(customerGroups)
      .where(
        and(
          eq(customerGroups.id, groupId),
          eq(customerGroups.tenant_id, ctx.business.id),
        ),
      );

    revalidate("/customers/groups");
    return success(undefined, "Group deleted.");
  });
}

/* -------------------------------------------------------------------------- */
/* Credit and loyalty adjustments                                             */
/* -------------------------------------------------------------------------- */

export async function recordCustomerReceipt(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.credit", {
      feature: "customers.credit",
    });

    const customerId = uuid(form, "customer_id");
    if (!customerId) return failure("Customer not found.");

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) return failure("Enter an amount greater than zero.");

    const { postCustomerLedger } = await import("@/lib/services/partners");
    const { mul } = await import("@/lib/money");

    await db.transaction(async (tx) => {
      await postCustomerLedger(
        tx,
        { businessId: ctx.business.id, userId: ctx.user.id },
        {
          customerId,
          storeId: ctx.activeStore?.id ?? null,
          // A receipt reduces what the customer owes.
          amount: mul(amount, "-1"),
          kind: "payment",
          note: str(form, "note") || "Receipt against account",
        },
      );
    });

    await auditEvent(ctx, {
      event: "PaymentReceived",
      moduleSlug: "customers",
      entityType: "customer",
      entityId: customerId,
      summary: `Receipt of ${Number(amount).toFixed(2)} against account`,
    });

    revalidate("/customers", `/customers/${customerId}`, "/dashboard");
    return success(undefined, "Receipt recorded against the account.");
  });
}

export async function adjustLoyaltyPoints(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.loyalty", {
      feature: "customers.loyalty",
    });

    const customerId = uuid(form, "customer_id");
    if (!customerId) return failure("Customer not found.");

    const points = decimalStr(form, "points");
    if (Number(points) === 0) return failure("Enter a non-zero number of points.");

    const { postLoyalty } = await import("@/lib/services/partners");

    await db.transaction(async (tx) => {
      await postLoyalty(
        tx,
        { businessId: ctx.business.id, userId: ctx.user.id },
        {
          customerId,
          points,
          kind: "manual",
          note: str(form, "note") || "Manual adjustment",
        },
      );
    });

    revalidate(`/customers/${customerId}`);
    return success(undefined, "Loyalty balance adjusted.");
  });
}

/**
 * Merges a duplicate customer into another, moving all of its history.
 * Archiving the duplicate rather than deleting keeps every invoice reachable.
 */
export async function mergeDuplicateCustomers(
  survivorId: string,
  duplicateId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers.merge", {
      feature: "customers.merge",
    });

    const result = await mergeCustomers(ctx, { survivorId, duplicateId });

    revalidate("/customers", `/customers/${survivorId}`, "/sales", "/dashboard");
    return success(
      undefined,
      `${result.duplicateName} merged into ${result.survivorName}. ${result.movedRows} record(s) moved.`,
    );
  });
}
