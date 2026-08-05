"use server";

import { requireAdmin } from "@/lib/authz/guard";
import { auditAdmin } from "@/lib/services/audit";
import {
  cancelJob,
  drain,
  enqueue,
  enqueueRecurring,
  pruneCompleted,
  retryJob,
} from "@/lib/jobs";
import {
  failure,
  revalidate,
  runAction,
  success,
  type ActionResult,
} from "@/lib/actions";

/**
 * Queue controls for the admin panel.
 *
 * Running the queue by hand is a first-class action, not a debug affordance:
 * an installation with no worker process and no cron relies on it.
 */
export async function runQueueNow(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    await enqueueRecurring(ctx.business.id);
    const result = await drain({ batchSize: 5, maxBatches: 20 });

    await auditAdmin(ctx, {
      event: "QueueDrained",
      entityType: "job",
      summary: `Queue run by hand: ${result.completed} completed, ${result.failed} failed`,
      payload: { ...result },
    });

    revalidate("/admin/jobs", "/admin", "/notifications/delivery");
    return success(
      undefined,
      result.claimed === 0
        ? "Nothing was due."
        : `${result.completed} completed, ${result.retrying} retrying, ${result.failed} failed.`,
    );
  });
}

export async function retryFailedJob(jobId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    const ok = await retryJob(ctx.business.id, jobId);
    if (!ok) return failure("That job is no longer in a failed state.");

    await auditAdmin(ctx, {
      event: "JobRetried",
      entityType: "job",
      entityId: jobId,
      summary: "Failed job queued for retry",
    });

    revalidate("/admin/jobs");
    return success(undefined, "Job queued for retry.");
  });
}

export async function cancelPendingJob(jobId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    const ok = await cancelJob(ctx.business.id, jobId);
    if (!ok) return failure("That job has already started or finished.");

    await auditAdmin(ctx, {
      event: "JobCancelled",
      entityType: "job",
      entityId: jobId,
      summary: "Pending job cancelled",
    });

    revalidate("/admin/jobs");
    return success(undefined, "Job cancelled.");
  });
}

/** Runs the ledger reconciliation check now rather than waiting for its sweep. */
export async function runIntegrityCheck(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    await enqueue({
      businessId: ctx.business.id,
      kind: "integrity.check",
      priority: 50,
      dedupeKey: "integrity:manual",
    });
    const result = await drain({ batchSize: 5, maxBatches: 3 });

    revalidate("/admin/jobs", "/admin");
    return success(
      undefined,
      result.failed > 0
        ? "Integrity check ran and reported a problem — see the audit log."
        : "Integrity check ran. All ledgers reconcile.",
    );
  });
}

export async function pruneCompletedJobs(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireAdmin("admin.panel");

    const removed = await pruneCompleted(7);

    await auditAdmin(ctx, {
      event: "QueuePruned",
      entityType: "job",
      summary: `${removed} completed job(s) older than 7 days removed`,
    });

    revalidate("/admin/jobs");
    return success(
      undefined,
      removed === 0
        ? "Nothing old enough to prune."
        : `${removed} completed job(s) removed.`,
    );
  });
}
