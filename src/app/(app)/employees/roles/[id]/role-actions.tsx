"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { deleteRole } from "../../actions";

export function RoleActions({
  roleId,
  roleName,
  isOwner,
  memberCount,
}: {
  roleId: string;
  roleName: string;
  isOwner: boolean;
  memberCount: number;
}) {
  const [pending, startTransition] = useTransition();

  // The Owner role is structural and can never be removed.
  if (isOwner) return null;

  if (memberCount > 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title={`${memberCount} employee(s) still hold this role`}
      >
        <Trash2 className="size-3.5 opacity-50" />
        Delete
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the {roleName} role?</AlertDialogTitle>
          <AlertDialogDescription>
            No employees currently hold this role, so removing it is safe.
            Provisioned roles are archived rather than deleted so they can be
            restored later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              startTransition(async () => {
                const result = await deleteRole(roleId);
                if (result.ok) toast.success(result.message ?? "Deleted.");
                else toast.error(result.message ?? "Could not delete the role.");
              })
            }
          >
            Delete role
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
