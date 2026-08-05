import "server-only";

import { db } from "@/db";

import {
  claim,
  markCompleted,
  markFailed,
  reclaimStalled,
} from "./queue";
import {
  isPermanent,
  type JobHandler,
  type JobKind,
  type JobRow,
} from "./types";

/**
 * Handler registry and the runner loop (28-job-queue.md).
 *
 * Handlers must be idempotent. A job can run twice: a worker may die between
 * doing the work and marking it complete, and the reclaim sweep will then hand
 * it to someone else.
 */

const HANDLERS = new Map<string, JobHandler<never>>();

export function registerJob<TPayload>(
  kind: JobKind,
  handler: JobHandler<TPayload>,
): void {
  if (HANDLERS.has(kind)) {
    // Registering twice means two modules claim the same kind, and which one
    // wins would be import-order dependent. Fail loudly instead.
    throw new Error(`Job handler already registered for "${kind}".`);
  }
  HANDLERS.set(kind, handler as JobHandler<never>);
}

export function registeredKinds(): string[] {
  return [...HANDLERS.keys()].sort();
}

export interface TickResult {
  claimed: number;
  completed: number;
  failed: number;
  retrying: number;
  reclaimed: number;
}

/**
 * Claims and runs one batch.
 *
 * Every outcome is recorded. A handler that throws never propagates out of
 * here — one bad job must not stop the batch or take down the caller.
 */
export async function tick(batchSize = 5): Promise<TickResult> {
  const reclaimed = await reclaimStalled();
  const batch = await claim(batchSize);

  const result: TickResult = {
    claimed: batch.length,
    completed: 0,
    failed: 0,
    retrying: 0,
    reclaimed,
  };

  for (const job of batch) {
    const outcome = await runOne(job);
    if (outcome === "completed") result.completed += 1;
    else if (outcome === "retrying") result.retrying += 1;
    else result.failed += 1;
  }

  return result;
}

async function runOne(job: JobRow): Promise<"completed" | "retrying" | "failed"> {
  const handler = HANDLERS.get(job.kind);

  if (!handler) {
    // An unknown kind will never succeed — most likely a job enqueued by a
    // newer version, or a handler that was removed. Do not burn retries.
    await markFailed(job, new Error(`No handler for "${job.kind}".`), {
      permanent: true,
    });
    return "failed";
  }

  try {
    await handler(job.payload as never, {
      businessId: job.tenant_id,
      jobId: job.id,
      attempt: job.attempts,
      client: db,
    });
    await markCompleted(job.id);
    return "completed";
  } catch (error) {
    const { willRetry } = await markFailed(job, error, {
      permanent: isPermanent(error),
    });
    return willRetry ? "retrying" : "failed";
  }
}

/**
 * Drains the queue until nothing is due, bounded.
 *
 * Used by the tick endpoint so one cron hit clears a backlog rather than five
 * jobs. The bound stops a handler that enqueues its own successor from looping
 * forever inside one request.
 */
export async function drain(
  options: { batchSize?: number; maxBatches?: number } = {},
): Promise<TickResult> {
  const batchSize = options.batchSize ?? 5;
  const maxBatches = options.maxBatches ?? 20;

  const total: TickResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    reclaimed: 0,
  };

  for (let i = 0; i < maxBatches; i++) {
    const batch = await tick(batchSize);
    total.claimed += batch.claimed;
    total.completed += batch.completed;
    total.failed += batch.failed;
    total.retrying += batch.retrying;
    total.reclaimed += batch.reclaimed;

    if (batch.claimed === 0) break;
  }

  return total;
}
