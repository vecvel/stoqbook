import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import { customerGroups, customers } from "@/db/schema";
import type { BusinessContext } from "@/lib/authz/context";
import { ValidationError } from "@/lib/authz/errors";
import { nextNumber } from "@/lib/services/numbering";

import type { ReferenceMap, SheetSpec } from "../types";

/**
 * Customers import/export.
 *
 * Balances are deliberately absent from the importable columns. Outstanding
 * balance, loyalty points and store credit are all ledger-derived: writing them
 * directly from a spreadsheet would put the balance out of step with the ledger
 * rows that are supposed to explain it, which is the one form of corruption this
 * system is built to prevent. Opening balances are recorded as ledger entries
 * through the customer screen instead.
 */

async function groupMap(
  client: DbClient,
  businessId: string,
): Promise<Record<string, ReferenceMap>> {
  const rows = await client
    .select({ id: customerGroups.id, name: customerGroups.name })
    .from(customerGroups)
    .where(eq(customerGroups.tenant_id, businessId));

  return {
    customerGroup: new Map(rows.map((r) => [r.name.toLowerCase(), r.id])),
  };
}

export const customersSpec: SheetSpec = {
  slug: "customers",
  name: "Customers",
  description:
    "Load or update customers in bulk. Rows are matched on Code; a blank code creates a new customer with a generated one.",
  importPermission: "customers.import",
  exportPermission: "customers.export",
  importFeature: "customers.import",
  exportFeature: "customers.export",

  notes: [
    "Outstanding balance, loyalty points and store credit cannot be imported. They are derived from the customer ledger, and setting them directly would break the ledger's explanation of the balance. Record an opening balance from the customer's page instead.",
    "Credit limit and payment terms are safe to import — they are policy, not money already owed.",
    "A customer group must already exist. Create it under Customers → Groups first.",
  ],

  columns: [
    {
      header: "Code",
      key: "code",
      type: "text",
      width: 16,
      help: "Blank generates one.",
      example: "CUS-000101",
    },
    {
      header: "Name",
      key: "name",
      type: "text",
      required: true,
      width: 28,
      example: "Sunita Deshpande",
    },
    {
      header: "Company name",
      key: "company_name",
      type: "text",
      width: 28,
      example: "Deshpande Clinic",
    },
    {
      header: "Type",
      key: "type",
      type: "enum",
      options: ["retail", "wholesale", "corporate", "walk_in"],
      width: 14,
      example: "corporate",
    },
    {
      header: "Group",
      key: "group_id",
      type: "lookup",
      lookup: { name: "customerGroup" },
      width: 20,
      example: "Clinics",
    },
    { header: "Phone", key: "phone", type: "text", width: 16, example: "9820011223" },
    {
      header: "Email",
      key: "email",
      type: "text",
      width: 26,
      example: "accounts@deshpandeclinic.test",
    },
    {
      header: "Tax number",
      key: "tax_number",
      type: "text",
      width: 20,
      help: "GSTIN or equivalent.",
      example: "27AABCU9603R1ZM",
    },
    {
      header: "Credit limit",
      key: "credit_limit",
      type: "money",
      width: 14,
      help: "0 means cash only — credit sales are refused.",
      example: 50000,
    },
    {
      header: "Payment terms (days)",
      key: "payment_terms_days",
      type: "integer",
      width: 19,
      example: 30,
    },
    {
      header: "Status",
      key: "status",
      type: "enum",
      options: ["active", "inactive", "blocked"],
      width: 12,
      example: "active",
    },
    { header: "Note", key: "note", type: "text", width: 40, example: "Monthly account." },
  ],

  loadReferences: (ctx, client) => groupMap(client, ctx.business.id),

  async importRow(row, { ctx, client }) {
    const name = String(row.name ?? "").trim();
    if (!name) throw ValidationError("Name is required.");

    const email = String(row.email ?? "").trim() || null;
    if (email && !email.includes("@")) {
      throw ValidationError(`"${name}": "${email}" is not a valid email address.`);
    }

    const code =
      String(row.code ?? "").trim() ||
      (await nextNumber(ctx.business.id, "customer", { client }));

    const values = {
      name,
      company_name: String(row.company_name ?? "").trim() || null,
      type:
        (row.type as "retail" | "wholesale" | "corporate" | "walk_in") ?? "retail",
      group_id: (row.group_id as string) ?? null,
      phone: String(row.phone ?? "").trim() || null,
      email,
      tax_number: String(row.tax_number ?? "").trim() || null,
      credit_limit: String(row.credit_limit ?? 0),
      payment_terms_days: Number(row.payment_terms_days ?? 0),
      status: (row.status as "active" | "inactive" | "blocked") ?? "active",
      note: String(row.note ?? "").trim() || null,
      updated_by: ctx.user.id,
    };

    const [existing] = await client
      .select({ id: customers.id, isWalkIn: customers.is_walk_in })
      .from(customers)
      .where(
        and(
          eq(customers.tenant_id, ctx.business.id),
          eq(customers.code, code),
          isNull(customers.deleted_at),
        ),
      )
      .limit(1);

    if (existing) {
      /* The walk-in customer is provisioned by setup and relied on by the till.
         Letting a spreadsheet rename or block it would break every cash sale. */
      if (existing.isWalkIn) {
        return { label: `${code} — ${name}`, action: "skipped" };
      }
      await client
        .update(customers)
        .set({ ...values, updated_at: new Date() })
        .where(eq(customers.id, existing.id));
      return { label: `${code} — ${name}`, action: "updated" };
    }

    await client.insert(customers).values({
      ...values,
      tenant_id: ctx.business.id,
      code,
      created_by: ctx.user.id,
    });

    return { label: `${code} — ${name}`, action: "created" };
  },

  async exportRows(ctx: BusinessContext) {
    return db
      .select({
        code: customers.code,
        name: customers.name,
        company_name: customers.company_name,
        type: customers.type,
        group_id: customerGroups.name,
        phone: customers.phone,
        email: customers.email,
        tax_number: customers.tax_number,
        credit_limit: customers.credit_limit,
        payment_terms_days: customers.payment_terms_days,
        status: customers.status,
        note: customers.note,
      })
      .from(customers)
      .leftJoin(customerGroups, eq(customerGroups.id, customers.group_id))
      .where(
        and(eq(customers.tenant_id, ctx.business.id), isNull(customers.deleted_at)),
      )
      .orderBy(customers.name);
  },
};
