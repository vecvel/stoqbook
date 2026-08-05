"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { deleteEmployee, inviteEmployee, setEmployeeStatus } from "../actions";

export function EmployeeActions({
  userId,
  userName,
  status,
  isSelf,
  canSuspend,
  canDelete,
  canInvite,
}: {
  userId: string;
  userName: string;
  status: string;
  isSelf: boolean;
  canSuspend: boolean;
  canDelete: boolean;
  canInvite: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [issued, setIssued] = useState<{
    temporaryPassword: string;
    email: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // Guard rails: an administrator cannot lock themselves out.
  if (isSelf || (!canSuspend && !canDelete && !canInvite)) return null;

  const isSuspended = status === "suspended";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Employee actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canInvite ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await inviteEmployee(userId);
                  if (result.ok && result.data) {
                    setIssued(result.data);
                  } else {
                    toast.error(
                      result.message ?? "Could not issue portal access.",
                    );
                  }
                })
              }
            >
              Issue portal access
            </DropdownMenuItem>
          ) : null}
          {canSuspend ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(async () => {
                  const result = await setEmployeeStatus(
                    userId,
                    isSuspended ? "active" : "suspended",
                  );
                  if (result.ok) toast.success(result.message ?? "Done.");
                  else toast.error(result.message ?? "Could not update.");
                })
              }
            >
              {isSuspended ? "Reactivate account" : "Suspend account"}
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Remove employee
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The record is archived rather than erased, so historical sales,
              approvals and audit entries continue to attribute correctly. Active
              sessions are revoked immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteEmployee(userId);
                  if (!result.ok) {
                    toast.error(result.message ?? "Could not remove.");
                  }
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shown once and never stored: there is no way to retrieve it later. */}
      <AlertDialog
        open={issued !== null}
        onOpenChange={(open) => {
          if (!open) setIssued(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Portal access for {userName}</AlertDialogTitle>
            <AlertDialogDescription>
              Give {userName} these details in person or over a channel you
              trust. This password is shown once and cannot be retrieved again —
              issue access afresh if it is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="divide-y divide-border rounded-xs border border-border">
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="field-label">Email</dt>
              <dd className="font-mono text-sm">{issued?.email}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="field-label">Temporary password</dt>
              <dd className="font-mono text-sm font-semibold">
                {issued?.temporaryPassword}
              </dd>
            </div>
          </dl>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIssued(null)}>
              I have shared it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
