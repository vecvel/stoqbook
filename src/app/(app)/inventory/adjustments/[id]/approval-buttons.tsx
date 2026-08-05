"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { decideAdjustment } from "../../actions";

export function ApprovalButtons({ adjustmentId }: { adjustmentId: string }) {
  const [pending, startTransition] = useTransition();

  const decide = (decision: "approved" | "rejected") => {
    startTransition(async () => {
      const result = await decideAdjustment(adjustmentId, decision);
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? "Could not record the decision.");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => decide("rejected")}
      >
        <X className="size-3.5" />
        Reject
      </Button>
      <Button
        variant="success"
        size="sm"
        disabled={pending}
        onClick={() => decide("approved")}
      >
        <Check className="size-3.5" />
        Approve &amp; post
      </Button>
    </div>
  );
}
