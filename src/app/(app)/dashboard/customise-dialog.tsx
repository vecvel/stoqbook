"use client";

import { useActionState, useState, useTransition } from "react";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";

import { FormError, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions";

import { resetDashboardLayout, saveDashboardLayout } from "./actions";

export interface WidgetChoice {
  key: string;
  name: string;
  moduleName: string;
  size: string;
}

export function CustomiseDashboardDialog({
  widgets,
  selected,
}: {
  widgets: WidgetChoice[];
  /** Empty means no saved layout, so everything shows. */
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveDashboardLayout(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    { ok: true },
  );

  const hasSaved = selected.length > 0;
  const isChecked = (key: string) => !hasSaved || selected.includes(key);

  /* Grouping by module mirrors how the registry declares widgets, so the list
     reads the same way the sidebar does. */
  const byModule = widgets.reduce<Record<string, WidgetChoice[]>>((acc, w) => {
    (acc[w.moduleName] ??= []).push(w);
    return acc;
  }, {});

  function reset() {
    startTransition(async () => {
      const result = await resetDashboardLayout();
      if (result.ok) {
        toast.success(result.message ?? "Reset.");
        setOpen(false);
      } else {
        toast.error(result.message ?? "Could not reset the layout.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <LayoutGrid className="size-3.5" />
          Customise
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose your widgets</DialogTitle>
          <DialogDescription>
            Only widgets your role can see are listed. Unchecking everything
            restores the default layout.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          {/* Without this a failed save leaves the dialog open and silent. */}
          {!state.ok ? <FormError message={state.message} /> : null}

          <div className="max-h-[55vh] overflow-y-auto pr-1">
            {Object.entries(byModule).map(([moduleName, items]) => (
              <section key={moduleName} className="mb-3">
                <h3 className="field-label mb-1.5">{moduleName}</h3>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((widget) => (
                    <li key={widget.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xs px-1.5 py-1 text-sm transition-colors hover:bg-muted/50">
                        <Checkbox
                          name="widgets"
                          value={widget.key}
                          defaultChecked={isChecked(widget.key)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {widget.name}
                        </span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {widget.size}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            {hasSaved ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={reset}
              >
                Reset to default
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              Save layout
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
