"use client";

import { useMemo, useState, useTransition } from "react";
import { Merge } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

export interface MergeCandidate {
  id: string;
  label: string;
  detail: string;
}

/**
 * Merging two partners into one.
 *
 * Deliberately blunt about direction: the duplicate is archived and everything
 * it owns moves to the survivor, which is not reversible from the UI.
 */
export function MergeDialog({
  entityLabel,
  candidates,
  action,
}: {
  entityLabel: string;
  candidates: MergeCandidate[];
  action: (survivorId: string, duplicateId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [survivorId, setSurvivorId] = useState("");
  const [duplicateId, setDuplicateId] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return candidates.slice(0, 50);
    return candidates
      .filter(
        (c) =>
          c.label.toLowerCase().includes(term) ||
          c.detail.toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [candidates, filter]);

  const survivor = candidates.find((c) => c.id === survivorId);
  const duplicate = candidates.find((c) => c.id === duplicateId);
  const ready = Boolean(survivorId && duplicateId && survivorId !== duplicateId);

  function run() {
    startTransition(async () => {
      const result = await action(survivorId, duplicateId);
      if (result.ok) {
        toast.success(result.message ?? "Merged.");
        setOpen(false);
        setSurvivorId("");
        setDuplicateId("");
        setFilter("");
      } else {
        toast.error(result.message ?? "Could not merge.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Merge className="size-3.5" />
          Merge duplicates
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge duplicate {entityLabel}s</DialogTitle>
          <DialogDescription>
            Every invoice, ledger line and address moves to the record you keep.
            Balances are added together and the duplicate is archived. This
            cannot be undone here.
          </DialogDescription>
        </DialogHeader>

        <Field label="Find" htmlFor="merge_filter">
          <Input
            id="merge_filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Search ${entityLabel}s by name or code`}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <PickList
            title="Keep this one"
            tone="accent"
            items={visible}
            selectedId={survivorId}
            disabledId={duplicateId}
            onSelect={setSurvivorId}
          />
          <PickList
            title="Merge away"
            tone="destructive"
            items={visible}
            selectedId={duplicateId}
            disabledId={survivorId}
            onSelect={setDuplicateId}
          />
        </div>

        {ready ? (
          <p className="rounded-xs border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <strong>{duplicate?.label}</strong> will be archived and everything
            it owns will belong to <strong>{survivor?.label}</strong>.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!ready || pending}
            onClick={run}
          >
            Merge
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickList({
  title,
  tone,
  items,
  selectedId,
  disabledId,
  onSelect,
}: {
  title: string;
  tone: "accent" | "destructive";
  items: MergeCandidate[];
  selectedId: string;
  disabledId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xs border border-border">
      <header className="border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </header>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto">
        {items.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nothing matches.
          </li>
        ) : (
          items.map((item) => {
            const isSelected = item.id === selectedId;
            const isBlocked = item.id === disabledId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={isBlocked}
                  onClick={() => onSelect(item.id)}
                  className={[
                    "flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    isBlocked
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-muted/50",
                    isSelected
                      ? tone === "accent"
                        ? "bg-accent/10 font-medium"
                        : "bg-destructive/10 font-medium"
                      : "",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {item.detail}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
