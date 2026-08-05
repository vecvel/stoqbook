import type { DbClient } from "@/db";
import type { jobs } from "@/db/schema";

/**
 * Job contracts (28-job-queue.md).
 *
 * Kept apart from the queue implementation so a handler module can import the
 * types without pulling in the runner, which would create a cycle: the runner
 * imports every handler in order to register it.
 */

export type JobRow = typeof jobs.$inferSelect;
export type JobStatus = JobRow["status"];

/**
 * Every job kind the installation knows about.
 *
 * A kind belongs here only once something registers a handler for it: an
 * enqueueable kind with no handler fails on first claim, which is a worse
 * outcome than not being able to enqueue it. Webhook delivery is not listed
 * because it is not its own kind — a webhook is one of the channels
 * `notification.deliver` sends through.
 */
export type JobKind =
  | "notification.deliver"
  | "notification.release_quiet"
  | "report.run_scheduled"
  | "integrity.check";

export interface JobContext {
  businessId: string;
  jobId: string;
  /** 1 on the first run. Handlers may behave differently on a retry. */
  attempt: number;
  /** Use this rather than `db` so a handler can be tested in a transaction. */
  client: DbClient;
}

export type JobHandler<TPayload = Record<string, unknown>> = (
  payload: TPayload,
  ctx: JobContext,
) => Promise<void>;

/**
 * Thrown by a handler to say "this will never succeed, stop retrying".
 *
 * The default for an unrecognised error is to retry, because most failures are
 * transient. A 404 from a webhook endpoint is not, and retrying it for two
 * hours is pure waste.
 */
export class PermanentJobFailure extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = "PermanentJobFailure";
  }
}

export function isPermanent(error: unknown): boolean {
  return error instanceof PermanentJobFailure;
}
