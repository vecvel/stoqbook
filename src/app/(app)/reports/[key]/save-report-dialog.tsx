"use client";

import { useActionState, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
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
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

import { saveScheduledReport } from "../schedule-actions";

export interface RecipientOption {
  id: string;
  name: string;
}

/**
 * Saves the current report view, optionally on a schedule.
 *
 * The active filters are passed through as hidden fields so the saved report
 * reproduces exactly what is on screen.
 */
export function SaveReportDialog({
  reportKey,
  reportName,
  filters,
  recipients,
  canSchedule,
}: {
  reportKey: string;
  reportName: string;
  filters: Record<string, string>;
  recipients: RecipientOption[];
  canSchedule: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState("none");
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveScheduledReport(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    { ok: true },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <BookmarkPlus className="size-3.5" />
          Save
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save “{reportName}”</DialogTitle>
          <DialogDescription>
            The filters currently applied are stored with it.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="report_key" value={reportKey} />
          {Object.entries(filters).map(([key, value]) => (
            <input key={key} type="hidden" name={`filter_${key}`} value={value} />
          ))}

          {!state.ok ? <FormError message={state.message} /> : null}

          <Field label="Name" htmlFor="saved_name" required>
            <Input
              id="saved_name"
              name="name"
              defaultValue={reportName}
              required
              autoFocus
            />
          </Field>

          <FieldRow cols={2}>
            <Field label="Visibility" htmlFor="is_shared">
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox id="is_shared" name="is_shared" value="on" />
                Share with colleagues
              </label>
            </Field>
            <Field label="Favourite" htmlFor="is_favorite">
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox id="is_favorite" name="is_favorite" value="on" />
                Pin to the top
              </label>
            </Field>
          </FieldRow>

          {canSchedule ? (
            <>
              <FieldRow cols={2}>
                <Field label="Run automatically" htmlFor="schedule">
                  <select
                    id="schedule"
                    name="schedule"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
                  >
                    <option value="none">Never — on demand only</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                {schedule !== "none" ? (
                  <Field
                    label="At hour"
                    htmlFor="schedule_hour"
                    hint="Business time, 0–23."
                  >
                    <Input
                      id="schedule_hour"
                      name="schedule_hour"
                      type="number"
                      min="0"
                      max="23"
                      defaultValue="7"
                    />
                  </Field>
                ) : null}
              </FieldRow>

              {schedule !== "none" && recipients.length > 0 ? (
                <div>
                  <span className="field-label">Notify</span>
                  <div className="mt-1.5 flex max-h-32 flex-wrap gap-3 overflow-y-auto">
                    {recipients.map((r) => (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-1.5 text-sm"
                      >
                        <Checkbox name="recipients" value={r.id} />
                        {r.name}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Leave all unchecked to notify whoever holds the report&apos;s
                    permission.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              Save report
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
