import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { suppliers } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { ValidationError } from "@/lib/authz/errors";
import { nextNumber } from "@/lib/services/numbering";

import type { SheetSpec } from "../types";

/**
 * Suppliers import/export.
 *
 * As with customers, `outstanding_balance` is not importable — it is the sum of
 * the supplier ledger, and a spreadsheet-set figure would contradict the rows
 * that are meant to justify it.
 */
export const suppliersSpec: SheetSpec = {
  slug: "suppliers",
  name: "Suppliers",
  description:
    "Load or update suppliers in bulk. Rows are matched on Code; a blank code creates a new supplier with a generated one.",
  importPermission: "suppliers.import",
  exportPermission: "suppliers.export",
  importFeature: "suppliers.import",
  exportFeature: "suppliers.export",

  notes: [
    "Outstanding payable cannot be imported — it is derived from the supplier ledger. Record opening payables from the supplier's page.",
    "Credit days drives the due date on purchase invoices.",
  ],

  columns: [
    {
      header: "Code",
      key: "code",
      type: "text",
      width: 16,
      help: "Blank generates one.",
      example: "SUP-000042",
    },
    {
      header: "Company name",
      key: "company_name",
      type: "text",
      required: true,
      width: 32,
      example: "Cipla Distributors Pvt Ltd",
    },
    {
      header: "Contact person",
      key: "contact_person",
      type: "text",
      width: 24,
      example: "Rakesh Menon",
    },
    {
      header: "Type",
      key: "type",
      type: "enum",
      options: [
        "manufacturer",
        "distributor",
        "wholesaler",
        "importer",
        "local_vendor",
        "service_provider",
      ],
      width: 16,
      example: "distributor",
    },
    { header: "Phone", key: "phone", type: "text", width: 16, example: "2266778899" },
    {
      header: "Email",
      key: "email",
      type: "text",
      width: 28,
      example: "orders@ciplad.test",
    },
    {
      header: "Tax number",
      key: "tax_number",
      type: "text",
      width: 20,
      example: "27AAACC1234M1Z8",
    },
    {
      header: "Credit days",
      key: "credit_days",
      type: "integer",
      width: 13,
      help: "Sets the due date on purchase invoices.",
      example: 45,
    },
    {
      header: "Status",
      key: "status",
      type: "enum",
      options: ["active", "inactive", "blocked"],
      width: 12,
      example: "active",
    },
  ],

  async importRow(row, { ctx, client }) {
    const companyName = String(row.company_name ?? "").trim();
    if (!companyName) throw ValidationError("Company name is required.");

    const email = String(row.email ?? "").trim() || null;
    if (email && !email.includes("@")) {
      throw ValidationError(`"${companyName}": "${email}" is not a valid email.`);
    }

    const code =
      String(row.code ?? "").trim() ||
      (await nextNumber(ctx.business.id, "supplier", { client }));

    const values = {
      company_name: companyName,
      contact_person: String(row.contact_person ?? "").trim() || null,
      type:
        (row.type as
          | "manufacturer"
          | "distributor"
          | "wholesaler"
          | "importer"
          | "local_vendor"
          | "service_provider") ?? "distributor",
      phone: String(row.phone ?? "").trim() || null,
      email,
      tax_number: String(row.tax_number ?? "").trim() || null,
      credit_days: Number(row.credit_days ?? 0),
      status: (row.status as "active" | "inactive" | "blocked") ?? "active",
      updated_by: ctx.user.id,
    };

    const [existing] = await client
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenant_id, ctx.business.id),
          eq(suppliers.code, code),
          isNull(suppliers.deleted_at),
        ),
      )
      .limit(1);

    if (existing) {
      await client
        .update(suppliers)
        .set({ ...values, updated_at: new Date() })
        .where(eq(suppliers.id, existing.id));
      return { label: `${code} — ${companyName}`, action: "updated" };
    }

    await client.insert(suppliers).values({
      ...values,
      tenant_id: ctx.business.id,
      code,
      created_by: ctx.user.id,
    });

    return { label: `${code} — ${companyName}`, action: "created" };
  },

  async exportRows(ctx: BusinessContext) {
    return db
      .select({
        code: suppliers.code,
        company_name: suppliers.company_name,
        contact_person: suppliers.contact_person,
        type: suppliers.type,
        phone: suppliers.phone,
        email: suppliers.email,
        tax_number: suppliers.tax_number,
        credit_days: suppliers.credit_days,
        status: suppliers.status,
      })
      .from(suppliers)
      .where(
        and(eq(suppliers.tenant_id, ctx.business.id), isNull(suppliers.deleted_at)),
      )
      .orderBy(suppliers.company_name);
  },
};
