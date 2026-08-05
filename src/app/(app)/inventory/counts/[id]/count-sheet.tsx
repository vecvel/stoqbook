"use client";

import { useActionState, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { FormError, SubmitButton } from "@/components/shared/form";
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
import { Input } from "@/components/ui/input";
import { formatQuantity } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

import { finaliseStockCount, saveCountedQuantities } from "../../actions";

export interface CountLine {
  id: string;
  productId: string;
  name: string;
  sku: string;
  unit: string;
  expected: string;
  counted: string;
  variance: string | null;
  note: string | null;
}

export function CountSheet({
  countId,
  items,
  readOnly,
  canApprove,
}: {
  countId: string;
  items: CountLine[];
  readOnly: boolean;
  canApprove: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    saveCountedQuantities,
    { ok: true },
  );
  const [counted, setCounted] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.counted])),
  );
  const [pending, startTransition] = useTransition();

  // Live variance preview so discrepancies are visible while counting.
  const varianceFor = (line: CountLine) => {
    const value = counted[line.id];
    if (value === undefined || value === "") return null;
    return Number(value) - Number(line.expected);
  };

  const previewVariances = items.filter((l) => {
    const v = varianceFor(l);
    return v !== null && v !== 0;
  });

  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <input type="hidden" name="count_id" value={countId} />

        {!state.ok ? <FormError message={state.message} /> : null}

        <div className="overflow-hidden rounded-xs border border-border bg-card">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Product
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Expected
                  </th>
                  <th className="w-28 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Counted
                  </th>
                  <th className="px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Variance
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Note
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((line) => {
                  const variance = varianceFor(line);
                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        variance !== null && variance !== 0 && "bg-warning/5",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{line.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {line.sku}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular text-muted-foreground">
                        {formatQuantity(line.expected, { unit: line.unit })}
                      </td>
                      <td className="px-2 py-2">
                        {readOnly ? (
                          <div className="text-right tabular font-medium">
                            {line.counted === ""
                              ? "—"
                              : formatQuantity(line.counted)}
                          </div>
                        ) : (
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            name={`counted[${line.id}]`}
                            value={counted[line.id] ?? ""}
                            onChange={(e) =>
                              setCounted((c) => ({
                                ...c,
                                [line.id]: e.target.value,
                              }))
                            }
                            className="h-8 text-right"
                            placeholder="—"
                            aria-label={`Counted quantity for ${line.name}`}
                          />
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right tabular font-medium",
                          variance === null
                            ? "text-muted-foreground"
                            : variance < 0
                              ? "text-destructive"
                              : variance > 0
                                ? "text-success"
                                : "text-muted-foreground",
                        )}
                      >
                        {variance === null
                          ? "—"
                          : `${variance > 0 ? "+" : ""}${variance.toFixed(3).replace(/\.?0+$/, "")}`}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {line.note ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!readOnly ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Blank lines are treated as not yet counted and are left untouched.
              </p>
              <SubmitButton variant="outline" size="sm" pendingLabel="Saving…">
                Save counted quantities
              </SubmitButton>
            </div>
          ) : null}
        </div>
      </form>

      {canApprove ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xs border-2 border-accent/40 bg-accent/5 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold">Approve and post</span>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {previewVariances.length === 0
                ? "No variance detected — approving will simply close the count."
                : `${previewVariances.length} line(s) differ from recorded stock. Approving posts one adjustment covering all of them.`}
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="accent" size="sm" disabled={pending}>
                <Check className="size-3.5" />
                Approve count
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Approve this stock count?</AlertDialogTitle>
                <AlertDialogDescription>
                  A stock adjustment will be created for every variance line and
                  posted through the ledger. This cannot be undone — corrections
                  require a further adjustment.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    startTransition(async () => {
                      const result = await finaliseStockCount(countId);
                      if (result.ok) toast.success(result.message ?? "Approved.");
                      else
                        toast.error(
                          result.message ?? "Could not approve the count.",
                        );
                    })
                  }
                >
                  Approve and post
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </div>
  );
}
