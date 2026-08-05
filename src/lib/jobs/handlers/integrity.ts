import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { auditSystem } from "@/lib/services/audit";
import { emit } from "@/lib/services/notifications";

import { registerJob } from "../runner";

/**
 * Ledger integrity check (31-monitoring.md § Integrity monitoring).
 *
 * Four balances in StoqBook are derived from append-only ledgers. Drift between
 * a balance and its ledger means stock or money is wrong, and it is the one
 * condition that should never occur — so it is checked on a schedule rather
 * than waiting for a stock count to surface it months later.
 *
 * A non-zero result raises a critical notification, which bypasses quiet hours
 * and every opt-out.
 */

export interface DriftReport {
  ledger: string;
  drifted: number;
}

export async function checkIntegrity(businessId: string): Promise<DriftReport[]> {
  /* Written as raw SQL rather than the query builder: these are the exact
     queries documented in 31-monitoring.md, and an operator must be able to run
     the same text by hand against a suspect database. */
  const [inventory] = (
    await db.execute(sql`
      select count(*)::int as n from (
        select l.id from inventory_levels l
        left join inventory_movements m
          on m.product_id = l.product_id and m.warehouse_id = l.warehouse_id
        where l.tenant_id = ${businessId}
        group by l.id, l.quantity_available
        having l.quantity_available <> coalesce(sum(m.quantity), 0)
      ) d
    `)
  ).rows as { n: number }[];

  const [customers] = (
    await db.execute(sql`
      select count(*)::int as n from (
        select c.id from customers c
        left join customer_ledger cl on cl.customer_id = c.id
        where c.tenant_id = ${businessId} and c.deleted_at is null
        group by c.id, c.outstanding_balance
        having c.outstanding_balance <> coalesce(sum(cl.amount), 0)
      ) d
    `)
  ).rows as { n: number }[];

  const [suppliers] = (
    await db.execute(sql`
      select count(*)::int as n from (
        select s.id from suppliers s
        left join supplier_ledger sl on sl.supplier_id = s.id
        where s.tenant_id = ${businessId} and s.deleted_at is null
        group by s.id, s.outstanding_balance
        having s.outstanding_balance <> coalesce(sum(sl.amount), 0)
      ) d
    `)
  ).rows as { n: number }[];

  const [giftCards] = (
    await db.execute(sql`
      select count(*)::int as n from (
        select g.id from gift_cards g
        left join gift_card_transactions t on t.gift_card_id = g.id
        where g.tenant_id = ${businessId}
        group by g.id, g.balance
        having g.balance <> coalesce(sum(t.amount), 0)
      ) d
    `)
  ).rows as { n: number }[];

  /* Also worth catching: the NULLS DISTINCT trap that let the same setting key
     exist twice, with arbitrary precedence (23-database-design.md). */
  const [duplicateSettings] = (
    await db.execute(sql`
      select count(*)::int as n from (
        select 1 from settings
        where tenant_id = ${businessId}
        group by scope, tenant_id, branch_id, warehouse_id, user_id, key
        having count(*) > 1
      ) d
    `)
  ).rows as { n: number }[];

  return [
    { ledger: "inventory", drifted: Number(inventory?.n ?? 0) },
    { ledger: "customer_ledger", drifted: Number(customers?.n ?? 0) },
    { ledger: "supplier_ledger", drifted: Number(suppliers?.n ?? 0) },
    { ledger: "gift_cards", drifted: Number(giftCards?.n ?? 0) },
    { ledger: "duplicate_settings", drifted: Number(duplicateSettings?.n ?? 0) },
  ];
}

registerJob("integrity.check", async (_payload, ctx) => {
  const report = await checkIntegrity(ctx.businessId);
  const problems = report.filter((r) => r.drifted > 0);

  await auditSystem({
    businessId: ctx.businessId,
    event: problems.length > 0 ? "IntegrityCheckFailed" : "IntegrityCheckPassed",
    moduleSlug: "admin",
    entityType: "integrity",
    summary:
      problems.length === 0
        ? "All ledgers reconcile."
        : `Drift detected: ${problems.map((p) => `${p.ledger} (${p.drifted})`).join(", ")}`,
    payload: { report },
  });

  if (problems.length === 0) return;

  // This is a stop-work condition, not a warning: something has written a
  // balance without its ledger row.
  await emit({
    businessId: ctx.businessId,
    event: "IntegrityCheckFailed",
    moduleSlug: "admin",
    priority: "critical",
    title: "Ledger drift detected",
    body: `${problems.map((p) => `${p.ledger}: ${p.drifted} record(s)`).join("; ")}. Stop and investigate before trading further.`,
    actionUrl: "/admin/jobs",
    fallbackPermission: "admin.panel",
    variables: {
      summary: problems.map((p) => `${p.ledger} ${p.drifted}`).join(", "),
    },
  });
});
