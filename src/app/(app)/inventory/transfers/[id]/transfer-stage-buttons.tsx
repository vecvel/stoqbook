"use client";

import { useTransition } from "react";
import { Check, PackageCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { advanceTransfer } from "../../actions";

/**
 * Surfaces only the single next lifecycle action, so the operator never has to
 * work out which stage a transfer is at.
 */
export function TransferStageButtons({
  transferId,
  status,
  canApprove,
  canDispatch,
  canReceive,
}: {
  transferId: string;
  status: string;
  canApprove: boolean;
  canDispatch: boolean;
  canReceive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function advance(stage: "approve" | "dispatch" | "receive") {
    startTransition(async () => {
      const result = await advanceTransfer(transferId, stage);
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? "Could not advance the transfer.");
    });
  }

  if (status === "draft" && canApprove) {
    return (
      <Button
        variant="success"
        size="sm"
        disabled={pending}
        onClick={() => advance("approve")}
      >
        <Check className="size-3.5" />
        Approve
      </Button>
    );
  }

  if (status === "approved" && canDispatch) {
    return (
      <Button
        variant="accent"
        size="sm"
        disabled={pending}
        onClick={() => advance("dispatch")}
      >
        <Send className="size-3.5" />
        Dispatch
      </Button>
    );
  }

  if (status === "in_transit" && canReceive) {
    return (
      <Button
        variant="success"
        size="sm"
        disabled={pending}
        onClick={() => advance("receive")}
      >
        <PackageCheck className="size-3.5" />
        Receive
      </Button>
    );
  }

  return null;
}
