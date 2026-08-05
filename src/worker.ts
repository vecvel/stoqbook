/**
 * Standalone worker (28-job-queue.md § Running the worker, option 1).
 *
 * Run with `npm run worker`. This is the right shape once delivery matters: the
 * queue keeps draining through a web-server restart, and a handler that wedges
 * takes down the worker rather than the till.
 *
 * Independent of `JOB_TICKER` on purpose — running this *and* the in-process
 * ticker is safe (SKIP LOCKED), but pointless, so leave the ticker off here.
 */
import "dotenv/config";

import { runOnce } from "@/lib/jobs/ticker";

const INTERVAL_MS = Math.max(
  5_000,
  Number(process.env.JOB_TICKER_INTERVAL_MS ?? 15_000),
);

let stopping = false;

async function main() {
  console.info(
    `[worker] started, polling every ${Math.round(INTERVAL_MS / 1000)}s. Ctrl-C to stop.`,
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1); // Second signal means "now".
      stopping = true;
      console.info(`[worker] ${signal} received; finishing the current batch.`);
    });
  }

  /* Sequential rather than an interval: this guarantees one pass at a time in
     this process, and lets a shutdown land between passes instead of mid-batch. */
  while (!stopping) {
    await runOnce();
    if (stopping) break;
    await sleep(INTERVAL_MS);
  }

  console.info("[worker] stopped.");
  process.exit(0);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    // A signal arriving mid-sleep should not cost a full interval of delay.
    const check = setInterval(() => {
      if (stopping) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 250);
    check.unref?.();
  });
}

void main();
