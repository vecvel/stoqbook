"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

import { archiveProduct, deleteProduct, restoreProduct } from "../actions";

export function ProductActions({
  productId,
  status,
  canArchive,
  canDelete,
  canUpdate,
}: {
  productId: string;
  status: string;
  canArchive: boolean;
  canDelete: boolean;
  canUpdate: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(result.message ?? "Done.");
      else toast.error(result.message ?? "Action failed.");
    });
  };

  if (!canArchive && !canDelete && !canUpdate) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" disabled={pending} aria-label="Product actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {canUpdate ? (
          <DropdownMenuItem asChild>
            <Link href={`/products/${productId}?tab=edit`} className="gap-2">
              <Pencil className="size-3.5" />
              Edit details
            </Link>
          </DropdownMenuItem>
        ) : null}

        {canArchive ? (
          status === "archived" ? (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => run(() => restoreProduct(productId))}
            >
              <RotateCcw className="size-3.5" />
              Restore product
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="gap-2"
              onSelect={() => run(() => archiveProduct(productId))}
            >
              <Archive className="size-3.5" />
              Archive product
            </DropdownMenuItem>
          )
        ) : null}

        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  className="gap-2 text-destructive focus:text-destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="size-3.5" />
                  Delete product
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this product?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Deletion is blocked if the product appears on any sale, so
                    historical invoices always resolve. Archive it instead if you
                    only want it hidden from lists.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => run(() => deleteProduct(productId))}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
