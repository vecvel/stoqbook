"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { changeQuotationStatus, convertToInvoice } from "./actions";

export function QuotationRowActions({
  quotationId,
  status,
  expired,
  canConvert,
}: {
  quotationId: string;
  status: string;
  expired: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const settled = status === "converted" || status === "expired";

  function setStatus(
    next: "draft" | "sent" | "accepted" | "rejected" | "expired",
  ) {
    startTransition(async () => {
      const result = await changeQuotationStatus(quotationId, next);
      if (result.ok) toast.success(result.message ?? "Updated.");
      else toast.error(result.message ?? "Could not update the quotation.");
    });
  }

  function convert() {
    startTransition(async () => {
      const result = await convertToInvoice(quotationId);
      if (result.ok) {
        toast.success(result.message ?? "Converted.");
        const invoiceId = (result.data as { invoiceId?: string } | undefined)
          ?.invoiceId;
        if (invoiceId) router.push(`/sales/${invoiceId}`);
      } else {
        toast.error(result.message ?? "Could not convert the quotation.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Quotation actions"
          disabled={pending}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {status === "draft" ? (
          <DropdownMenuItem onSelect={() => setStatus("sent")}>
            Mark as sent
          </DropdownMenuItem>
        ) : null}
        {!settled && status !== "accepted" ? (
          <DropdownMenuItem onSelect={() => setStatus("accepted")}>
            Mark as accepted
          </DropdownMenuItem>
        ) : null}
        {!settled ? (
          <DropdownMenuItem onSelect={() => setStatus("rejected")}>
            Mark as rejected
          </DropdownMenuItem>
        ) : null}

        {canConvert && !settled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={expired} onSelect={convert}>
              {expired ? "Expired — revise first" : "Convert to invoice"}
            </DropdownMenuItem>
          </>
        ) : null}

        {!settled ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setStatus("rejected")}
            >
              Close as rejected
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
