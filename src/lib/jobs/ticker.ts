import "server-only";

import { db } from "@/db";
import { tenants } from "@/db/schema";

import { enqueueRecurring } from "./index";
import { drain } from "./runner";

/**
 * In-process ticker (28-job-queue.md § Running the worker, option 2).
 *
 * The pragmatic default for a single-business install on one box: no cron entry,
 * no second process, no supervisor. The trade is that it dies with the web
 * server and does nothing while the server is idle — which for a shop that runs
 * a till all day is not a real cost.
 *
 * Off unless `JOB_TICKER=1`, because it must not start in every build step,
 * every test run and every `next build` worker.
 */

let handle: ReturnType<typeof setInterval> | null = null;
let running = false;

const INTERVAL_MS = Number(process.env.JOB_TICKER_INTERVAL_MS ?? 60_000);

export function startTicker(): void {
  if (process.env.JOB_TICKER !== "1") return;

  // Next.js can evaluate a module more than once per process (dev HMR, route
  // isolation). Two tickers would be harmless — SKIP LOCKED makes double-claim
  // impossible — but they would double the idle query load for nothing.
  if (handle) return;

  handle = setInterval(() => {
    void runOnce();
  }, Math.max(10_000, INTERVAL_MS));

  // Do not hold the process open at shutdown waiting for the next interval.
  handle.unref?.();

  console.info(
    `[jobs] in-process ticker started, every ${Math.round(Math.max(10_000, INTERVAL_MS) / 1000)}s`,
  );
}

export function stopTicker(): void {
  if (!handle) return;
  clearInterval(handle);
  handle = null;
}

/**
 * One pass. Exported so the standalone worker can share it.
 *
 * Never throws: an unhandled rejection inside a timer callback takes the whole
 * server down, and a queue outage must not become an outage.
 */
export async function runOnce(): Promise<void> {
  // Skips rather than queues if the previous pass is still going, so a slow
  // batch cannot pile up behind itself.
  if (running) return;
  running = true;

  try {
    const [business] = await db.select({ id: tenants.id }).from(tenants).limit(1);
    if (!business) return; // Not set up yet.

    await enqueueRecurring(business.id);
    const result = await drain({ batchSize: 5, maxBatches: 20 });

    if (result.failed > 0) {
      console.warn(
        `[jobs] ${result.completed} completed, ${result.retrying} retrying, ${result.failed} failed`,
      );
    }
  } catch (error) {
    console.error("[jobs] ticker pass failed", error);
  } finally {
    running = false;
  }
}
