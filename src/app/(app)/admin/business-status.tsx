"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";

import { setBusinessStatus } from "./actions";

/**
 * Business lifecycle transitions (02-business-structure.md § Business Status).
 *
 * Suspending and archiving are reversible and never destroy data — there is no
 * delete transition, because deleting the business would mean deleting the
 * installation, which is done by removing the installation itself.
 */
export function BusinessStatusActions({
  businessName,
  status,
}: {
  businessName: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");

  function run(action: "activate" | "suspend" | "archive", withReason?: string) {
    startTransition(async () => {
      const result = await setBusinessStatus(action, withReason);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setSuspendOpen(false);
        setReason("");
      } else {
        toast.error(result.message ?? "Could not change the business status.");
      }
    });
  }

  const isActive = status === "active";

  return (
    <>
      {!isActive ? (
        <Button
          variant="success"
          size="sm"
          disabled={pending}
          onClick={() => run("activate")}
        >
          Reactivate
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Business actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!isActive ? (
            <DropdownMenuItem onSelect={() => run("activate")}>
              Reactivate business
            </DropdownMenuItem>
          ) : null}
          {isActive ? (
            <DropdownMenuItem onSelect={() => setSuspendOpen(true)}>
              Suspend business
            </DropdownMenuItem>
          ) : null}
          {status !== "archived" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => run("archive")}
              >
                Archive business
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suspend {businessName}?</DialogTitle>
            <DialogDescription>
              Sign-in and API access stop immediately for everyone, including
              you. All data is preserved and access resumes the moment the
              business is reactivated. The reason is shown on the blocked screen.
            </DialogDescription>
          </DialogHeader>

          <Field label="Reason" htmlFor="suspend_reason" required>
            <Textarea
              id="suspend_reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Stock-take in progress — no transactions until Monday."
              autoFocus
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSuspendOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!reason.trim() || pending}
              onClick={() => run("suspend", reason.trim())}
            >
              Suspend business
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
