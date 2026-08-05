import "server-only";

import { hostname } from "node:os";

import { and, desc, eq, sql } from "drizzle-orm";

import { db, type DbClient } from "@/db";
import { jobs } from "@/db/schema";

import type { JobKind, JobRow, JobStatus } from "./types";

/**
 * The work queue (28-job-queue.md).
 *
 * Postgres-backed on purpose. StoqBook is self-hosted and single-business;
 * requiring a broker to send a few emails a day would make the product worse.
 */

/** Identifies which worker holds a claim, for diagnosing a stuck job. */
const WORKER_ID = `${hostname()}:${process.pid}`;

export interface EnqueueInput<TPayload = Record<string, unknown>> {
  businessId: string;
  kind: JobKind;
  payload?: TPayload;
  /** Lower runs first. Default 100. */
  priority?: number;
  /** Earliest the job may run. Default now. */
  runAfter?: Date;
  maxAttempts?: number;
  /**
   * Collapses duplicates: enqueueing the same key while one is still pending is
   * a no-op. Use it for anything a sweep might raise repeatedly.
   */
  dedupeKey?: string;
}

/**
 * Adds a job. Returns the row, or null when a pending job with the same
 * `dedupeKey` already existed.
 *
 * Pass `client` to enqueue inside the transaction that caused the work, so the
 * job cannot outlive a rollback.
 */
export async function enqueue<TPayload extends Record<string, unknown>>(
  input: EnqueueInput<TPayload>,
  client: DbClient = db,
): Promise<JobRow | null> {
  const [row] = await client
    .insert(jobs)
    .values({
      tenant_id: input.businessId,
      kind: input.kind,
      payload: input.payload ?? {},
      priority: input.priority ?? 100,
      run_after: input.runAfter ?? new Date(),
      max_attempts: input.maxAttempts ?? 5,
      dedupe_key: input.dedupeKey ?? null,
    })
    // The partial unique index only covers pending rows with a non-null key,
    // so this collapses duplicates without blocking a legitimate re-run later.
    .onConflictDoNothing()
    .returning();

  return row ?? null;
}

/**
 * Claims up to `limit` due jobs.
 *
 * `FOR UPDATE SKIP LOCKED` is what makes this safe without advisory locks:
 * several workers can claim at once and will never hand the same row to two of
 * them. Attempts is incremented at claim time, so a worker that dies mid-job
 * does not get infinite free retries.
 */
export async function claim(limit = 5): Promise<JobRow[]> {
  const claimed = await db.execute(sql`
    update ${jobs}
    set    status = 'running',
           locked_at = now(),
           locked_by = ${WORKER_ID},
           attempts = ${jobs.attempts} + 1,
           updated_at = now()
    where  ${jobs.id} in (
      select id from ${jobs}
      where  status = 'pending' and run_after <= now()
      order  by priority, run_after
      limit  ${limit}
      for update skip locked
    )
    returning *
  `);

  // `db.execute` returns raw driver rows: timestamps arrive as strings and
  // integers can arrive as strings too, because it bypasses Drizzle's column
  // mapping. Normalising here keeps `JobRow` honest for every caller.
  //
  // Re-sorted because `UPDATE … RETURNING` gives no ordering guarantee — the
  // inner select picks the right rows by priority, but the rows come back in
  // whatever order the update touched them. Without this, "lower priority runs
  // first" would hold for selection but not for execution.
  return (claimed.rows as unknown as RawJobRow[])
    .map(hydrate)
    .sort(
      (a, b) =>
        a.priority - b.priority || a.run_after.getTime() - b.run_after.getTime(),
    );
}

type RawJobRow = Omit<
  JobRow,
  "run_after" | "locked_at" | "completed_at" | "created_at" | "updated_at"
> & {
  run_after: string | Date;
  locked_at: string | Date | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  attempts: number | string;
  max_attempts: number | string;
  priority: number | string;
};

const asDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));
const asDateOrNull = (v: string | Date | null): Date | null =>
  v === null ? null : asDate(v);

function hydrate(row: RawJobRow): JobRow {
  return {
    ...row,
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    max_attempts: Number(row.max_attempts),
    run_after: asDate(row.run_after),
    locked_at: asDateOrNull(row.locked_at),
    completed_at: asDateOrNull(row.completed_at),
    created_at: asDate(row.created_at),
    updated_at: asDate(row.updated_at),
  };
}

export async function markCompleted(jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "completed",
      completed_at: new Date(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

/**
 * Exponential backoff with jitter, capped at an hour.
 *
 * The jitter matters: without it a burst that fails together retries together
 * forever, and the spike never spreads out.
 */
export function backoffMs(attempts: number): number {
  const base = Math.min(3_600_000, 2 ** attempts * 30_000);
  return base + Math.floor(Math.random() * 30_000);
}

/**
 * Records a failure. Retries while attempts remain and the error is
 * transient; otherwise the job ends as `failed` with its error kept.
 *
 * A failed job is never silently discarded — the admin screen lists it. A queue
 * that loses work quietly is worse than no queue.
 */
export async function markFailed(
  job: JobRow,
  error: unknown,
  options: { permanent?: boolean } = {},
): Promise<{ willRetry: boolean }> {
  const message = error instanceof Error ? error.message : String(error);
  const exhausted = job.attempts >= job.max_attempts;
  const willRetry = !options.permanent && !exhausted;

  await db
    .update(jobs)
    .set({
      status: willRetry ? "pending" : "failed",
      // Only written when retrying. Echoing the existing value back would mean
      // round-tripping a column this update has no reason to touch.
      ...(willRetry
        ? { run_after: new Date(Date.now() + backoffMs(job.attempts)) }
        : {}),
      locked_at: null,
      locked_by: null,
      last_error: message.slice(0, 2000),
      updated_at: new Date(),
    })
    .where(eq(jobs.id, job.id));

  return { willRetry };
}

/** Puts a failed job back in the queue, for the admin retry action. */
export async function retryJob(
  businessId: string,
  jobId: string,
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({
      status: "pending",
      run_after: new Date(),
      attempts: 0,
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.tenant_id, businessId),
        eq(jobs.status, "failed"),
      ),
    )
    .returning({ id: jobs.id });

  return rows.length > 0;
}

export async function cancelJob(
  businessId: string,
  jobId: string,
): Promise<boolean> {
  const rows = await db
    .update(jobs)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.tenant_id, businessId),
        eq(jobs.status, "pending"),
      ),
    )
    .returning({ id: jobs.id });

  return rows.length > 0;
}

/**
 * Returns jobs stuck in `running` past the timeout to the queue.
 *
 * A worker killed mid-job leaves its claim behind; without this the row sits
 * `running` forever. Attempts was already incremented at claim time, so a
 * repeatedly-crashing job still exhausts its retries rather than looping.
 */
export async function reclaimStalled(timeoutMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60_000);

  const rows = await db
    .update(jobs)
    .set({
      status: "pending",
      locked_at: null,
      locked_by: null,
      last_error: `Reclaimed after stalling for ${timeoutMinutes} minutes.`,
      updated_at: new Date(),
    })
    .where(and(eq(jobs.status, "running"), sql`${jobs.locked_at} < ${cutoff}`))
    .returning({ id: jobs.id });

  return rows.length;
}

export interface QueueStats {
  pending: number;
  running: number;
  failed: number;
  completed24h: number;
  /** Seconds the oldest pending job has been waiting. The health signal. */
  oldestPendingSeconds: number;
}

export async function queueStats(businessId: string): Promise<QueueStats> {
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${jobs.status} = 'pending')::int`,
      running: sql<number>`count(*) filter (where ${jobs.status} = 'running')::int`,
      failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')::int`,
      completed24h: sql<number>`count(*) filter (
        where ${jobs.status} = 'completed' and ${jobs.completed_at} > now() - interval '24 hours')::int`,
      oldestPendingSeconds: sql<number>`coalesce(
        extract(epoch from now() - min(${jobs.run_after}) filter (
          where ${jobs.status} = 'pending' and ${jobs.run_after} <= now()))::int, 0)`,
    })
    .from(jobs)
    .where(eq(jobs.tenant_id, businessId));

  return {
    pending: row?.pending ?? 0,
    running: row?.running ?? 0,
    failed: row?.failed ?? 0,
    completed24h: row?.completed24h ?? 0,
    oldestPendingSeconds: row?.oldestPendingSeconds ?? 0,
  };
}

/**
 * Recent jobs for the admin screen, newest first.
 *
 * Failed jobs are listed ahead of everything else regardless of age: a failure
 * that scrolled off the first page is a failure nobody will notice.
 */
export async function listJobs(
  businessId: string,
  options: { status?: JobStatus; limit?: number } = {},
): Promise<JobRow[]> {
  const limit = Math.min(options.limit ?? 50, 200);

  return db
    .select()
    .from(jobs)
    .where(
      options.status
        ? and(eq(jobs.tenant_id, businessId), eq(jobs.status, options.status))
        : eq(jobs.tenant_id, businessId),
    )
    .orderBy(
      sql`case ${jobs.status} when 'failed' then 0 when 'running' then 1 when 'pending' then 2 else 3 end`,
      desc(jobs.created_at),
    )
    .limit(limit);
}

/** Removes old completed rows so the table does not grow without bound. */
export async function pruneCompleted(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const rows = await db
    .delete(jobs)
    .where(and(eq(jobs.status, "completed"), sql`${jobs.completed_at} < ${cutoff}`))
    .returning({ id: jobs.id });
  return rows.length;
}
