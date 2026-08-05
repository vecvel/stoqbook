"use server";

import { redirect } from "next/navigation";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { purchaseOrders, supplierContracts, suppliers } from "@/db/schema";
import { requirePermission } from "@/lib/authz/guard";
import { BusinessRuleError, NotFoundError } from "@/lib/authz/errors";
import { auditEvent, diff } from "@/lib/services/audit";
import { nextNumber } from "@/lib/services/numbering";
import { assertWithinLimit } from "@/lib/services/business";
import { mergeSuppliers } from "@/lib/services/merge";
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

export async function saveSupplier(
  _prev: ActionResult<{ id: string }>,
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const id = uuid(form, "id");
    const ctx = await requirePermission(
      id ? "suppliers.update" : "suppliers.create",
    );

    const companyName = str(form, "company_name");
    if (!companyName) {
      return failure("Company name is required.", {
        company_name: ["Required."],
      });
    }

    const values = {
      company_name: companyName,
      contact_person: optionalStr(form, "contact_person"),
      type: (str(form, "type") || "distributor") as
        | "manufacturer"
        | "distributor"
        | "wholesaler"
        | "importer"
        | "local_vendor"
        | "service_provider",
      phone: optionalStr(form, "phone"),
      email: optionalStr(form, "email"),
      website: optionalStr(form, "website"),
      tax_number: optionalStr(form, "tax_number"),
      registration_number: optionalStr(form, "registration_number"),
      payment_terms: optionalStr(form, "payment_terms"),
      credit_days: num(form, "credit_days"),
      status: (str(form, "status") || "active") as
        | "pending"
        | "active"
        | "inactive"
        | "blocked"
        | "archived",
      rating: decimalStr(form, "rating"),
      note: optionalStr(form, "note"),
    };

    if (id) {
      const [before] = await db
        .select()
        .from(suppliers)
        .where(
          and(eq(suppliers.id, id), eq(suppliers.tenant_id, ctx.business.id)),
        )
        .limit(1);
      if (!before) throw NotFoundError("Supplier not found.");

      const [after] = await db
        .update(suppliers)
        .set({ ...values, updated_at: new Date(), updated_by: ctx.user.id })
        .where(eq(suppliers.id, id))
        .returning();

      await auditEvent(ctx, {
        event:
          before.status !== after.status && after.status === "blocked"
            ? "SupplierBlocked"
            : "SupplierUpdated",
        moduleSlug: "suppliers",
        entityType: "supplier",
        entityId: id,
        summary: `Updated ${after.company_name}`,
        payload: { changes: diff(before, after) },
      });

      revalidate("/suppliers", `/suppliers/${id}`);
      return success({ id }, "Supplier saved.");
    }

    await assertWithinLimit(ctx.business.id, "suppliers", ctx.entitlements);

    const code = str(form, "code") || (await nextNumber(ctx.business.id, "supplier"));

    const [created] = await db
      .insert(suppliers)
      .values({
        tenant_id: ctx.business.id,
        code,
        ...values,
        created_by: ctx.user.id,
      })
      .returning();

    await auditEvent(ctx, {
      event: "SupplierCreated",
      moduleSlug: "suppliers",
      entityType: "supplier",
      entityId: created.id,
      summary: `Created ${created.company_name} (${created.code})`,
    });

    revalidate("/suppliers", "/dashboard");
    redirect(`/suppliers/${created.id}`);
  });
}

export async function deleteSupplier(
  supplierId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers.delete");

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, supplierId),
          eq(suppliers.tenant_id, ctx.business.id),
        ),
      )
      .limit(1);
    if (!supplier) throw NotFoundError("Supplier not found.");

    // Suppliers with purchase history are protected (12-suppliers.md).
    const [used] = await db
      .select({ value: count() })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.supplier_id, supplierId));

    if (Number(used?.value ?? 0) > 0) {
      throw BusinessRuleError(
        `${supplier.company_name} has ${used.value} purchase order(s) and cannot be deleted. Set the status to archived instead.`,
        "SUPPLIER_REFERENCED",
      );
    }

    await db
      .update(suppliers)
      .set({
        deleted_at: new Date(),
        deleted_by: ctx.user.id,
        status: "archived",
      })
      .where(eq(suppliers.id, supplierId));

    await auditEvent(ctx, {
      event: "SupplierUpdated",
      moduleSlug: "suppliers",
      entityType: "supplier",
      entityId: supplierId,
      summary: `Deleted ${supplier.company_name}`,
    });

    revalidate("/suppliers");
    redirect("/suppliers");
  });
}

export async function paySupplier(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases.payment", {
      feature: "purchases.payments",
    });

    const supplierId = uuid(form, "supplier_id");
    if (!supplierId) return failure("Supplier not found.");

    const amount = decimalStr(form, "amount");
    if (Number(amount) <= 0) return failure("Enter an amount greater than zero.");

    const { recordSupplierPayment } = await import("@/lib/services/purchases");

    const result = await recordSupplierPayment(ctx, {
      supplierId,
      method: (str(form, "method") || "bank_transfer") as
        | "cash"
        | "card"
        | "upi"
        | "bank_transfer"
        | "cheque"
        | "wallet"
        | "online",
      amount,
      reference: str(form, "reference") || undefined,
      note: str(form, "note") || undefined,
    });

    revalidate("/suppliers", `/suppliers/${supplierId}`, "/dashboard");
    return success(undefined, `Payment ${result.paymentNumber} recorded.`);
  });
}

/**
 * Merges a duplicate supplier into another, moving all of its history.
 * Product links that both suppliers shared are dropped rather than duplicated.
 */
export async function mergeDuplicateSuppliers(
  survivorId: string,
  duplicateId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers.merge", {
      feature: "suppliers.merge",
    });

    const result = await mergeSuppliers(ctx, { survivorId, duplicateId });

    revalidate("/suppliers", `/suppliers/${survivorId}`, "/purchases", "/dashboard");
    return success(
      undefined,
      `${result.duplicateName} merged into ${result.survivorName}. ${result.movedRows} record(s) moved.`,
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Contracts                                                                  */
/* -------------------------------------------------------------------------- */

export async function saveSupplierContract(
  _prev: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers.contracts", {
      feature: "suppliers.contracts",
    });

    const supplierId = uuid(form, "supplier_id");
    if (!supplierId) return failure("Supplier not found.");

    const contractNumber = str(form, "contract_number").trim();
    if (!contractNumber) {
      return failure("A contract number is required.", {
        contract_number: ["Required."],
      });
    }

    const effectiveFrom = dateOrNull(form, "effective_from");
    if (!effectiveFrom) {
      return failure("An effective-from date is required.", {
        effective_from: ["Required."],
      });
    }
    const effectiveTo = dateOrNull(form, "effective_to");
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return failure("The end date cannot be before the start date.", {
        effective_to: ["Must be after the start date."],
      });
    }

    const values = {
      contract_number: contractNumber,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      terms: optionalStr(form, "terms"),
      attachment_url: optionalStr(form, "attachment_url"),
      is_active: bool(form, "is_active"),
    };

    const id = uuid(form, "id");
    if (id) {
      await db
        .update(supplierContracts)
        .set({ ...values, updated_at: new Date() })
        .where(
          and(
            eq(supplierContracts.id, id),
            eq(supplierContracts.tenant_id, ctx.business.id),
          ),
        );
    } else {
      await db.insert(supplierContracts).values({
        ...values,
        tenant_id: ctx.business.id,
        supplier_id: supplierId,
      });
    }

    await auditEvent(ctx, {
      event: "SupplierContractUpdated",
      moduleSlug: "suppliers",
      entityType: "supplier_contract",
      entityId: id ?? undefined,
      summary: `${id ? "Updated" : "Added"} contract ${contractNumber}`,
    });

    revalidate(`/suppliers/${supplierId}`);
    return success(undefined, "Contract saved.");
  });
}

export async function deleteSupplierContract(
  contractId: string,
  supplierId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers.contracts", {
      feature: "suppliers.contracts",
    });

    await db
      .delete(supplierContracts)
      .where(
        and(
          eq(supplierContracts.id, contractId),
          eq(supplierContracts.tenant_id, ctx.business.id),
        ),
      );

    await auditEvent(ctx, {
      event: "SupplierContractUpdated",
      moduleSlug: "suppliers",
      entityType: "supplier_contract",
      entityId: contractId,
      summary: "Contract deleted",
    });

    revalidate(`/suppliers/${supplierId}`);
    return success(undefined, "Contract deleted.");
  });
}
