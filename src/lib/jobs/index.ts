import "server-only";

/**
 * Job system entry point (28-job-queue.md).
 *
 * Importing this module registers every handler as a side effect. Anything that
 * runs jobs must import from here rather than from `runner` directly, or the
 * registry will be empty and every job will fail as "no handler".
 */

// Side-effect imports: each file calls registerJob() at module scope.
import "./handlers/notifications";
import "./handlers/reports";
import "./handlers/integrity";

export {
  cancelJob,
  enqueue,
  listJobs,
  pruneCompleted,
  queueStats,
  retryJob,
  type QueueStats,
} from "./queue";

export { drain, registeredKinds, tick, type TickResult } from "./runner";

export { PermanentJobFailure, type JobKind, type JobRow } from "./types";

export { checkIntegrity, type DriftReport } from "./handlers/integrity";
export { sweepDueReports } from "./handlers/reports";

/**
 * Enqueues the recurring sweeps.
 *
 * Each carries a dedupe key so a tick that fires while the previous sweep is
 * still pending does not stack them up. This is what a cron hit or the
 * in-process ticker calls before draining.
 */
export async function enqueueRecurring(businessId: string): Promise<void> {
  const { enqueue: add } = await import("./queue");
  const { sweepDueReports: sweep } = await import("./handlers/reports");

  // Report schedules are swept inline rather than as a job: the sweep is a
  // cheap claim-and-dispatch, and making it a job would need a job to enqueue
  // the job.
  await sweep(businessId);

  await add({
    businessId,
    kind: "notification.release_quiet",
    dedupeKey: "notification:release_quiet",
    priority: 120,
  });

  /* Ledger integrity, once per business-local day.
     The date-stamped key is checked against jobs in *any* status, not left to
     the dedupe index — that index only covers pending rows, so once the day's
     check completed every later tick would enqueue another one. Lowest priority
     of anything here: it scans four ledgers, and delivery must never wait
     behind it. */
  const { db } = await import("@/db");
  const { tenants, jobs } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const { tzDateKey, safeTimeZone } = await import("@/lib/timezone");

  const [business] = await db
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, businessId))
    .limit(1);
  if (!business) return;

  const dedupeKey = `integrity:${tzDateKey(new Date(), safeTimeZone(business.timezone))}`;

  const [alreadyToday] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.tenant_id, businessId), eq(jobs.dedupe_key, dedupeKey)))
    .limit(1);
  if (alreadyToday) return;

  await add({ businessId, kind: "integrity.check", dedupeKey, priority: 200 });
}
