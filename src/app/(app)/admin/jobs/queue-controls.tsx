"use client";

import { useTransition } from "react";
import { Play, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";

import {
  cancelPendingJob,
  pruneCompletedJobs,
  retryFailedJob,
  runIntegrityCheck,
  runQueueNow,
} from "./actions";

/** Shared runner so every control reports the same way. */
function useQueueAction() {
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>, fallback: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? fallback);
    });

  return { pending, run };
}

/**
 * Queue-wide controls.
 *
 * "Run due now" is the fallback for an installation with no worker and no cron —
 * the queue still drains, just when somebody looks at it.
 */
export function QueueControls({ completedCount }: { completedCount: number }) {
  const { pending, run } = useQueueAction();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="accent"
        size="sm"
        disabled={pending}
        onClick={() => run(runQueueNow, "Could not run the queue.")}
      >
        <Play className="size-3.5" />
        Run due now
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(runIntegrityCheck, "Could not run the check.")}
      >
        <ShieldCheck className="size-3.5" />
        Check ledgers
      </Button>

      {completedCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(pruneCompletedJobs, "Could not prune.")}
        >
          <Trash2 className="size-3.5" />
          Prune completed
        </Button>
      ) : null}
    </div>
  );
}

/** Per-row control: retry a failure, or cancel something not yet started. */
export function JobRowActions({
  jobId,
  status,
}: {
  jobId: string;
  status: string;
}) {
  const { pending, run } = useQueueAction();

  if (status === "failed") {
    return (
      <Button
        variant="outline"
        size="xs"
        disabled={pending}
        onClick={() => run(() => retryFailedJob(jobId), "Could not retry.")}
      >
        <RotateCcw className="size-3" />
        Retry
      </Button>
    );
  }

  if (status === "pending") {
    return (
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() => run(() => cancelPendingJob(jobId), "Could not cancel.")}
      >
        <X className="size-3" />
        Cancel
      </Button>
    );
  }

  return null;
}
