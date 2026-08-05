"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { humanise } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";

import { saveNumberSequence } from "../actions";

export interface SequenceRow {
  id: string;
  documentType: string;
  label: string;
  prefix: string;
  suffix: string;
  includePeriod: boolean;
  padding: number;
  nextNumber: number;
  resetRule: string;
  currentPeriod: string | null;
  preview: string;
}

export function NumberingTable({ rows }: { rows: SequenceRow[] }) {
  const [editing, setEditing] = useState<SequenceRow | null>(null);
  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveNumberSequence(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setEditing(null);
      }
      return result;
    },
    { ok: true },
  );

  return (
    <div className="flex flex-col gap-3">
      {editing ? (
        <section className="rounded-xs border-2 border-accent/40 bg-card">
          <header className="flex items-center justify-between gap-2 border-b border-border bg-accent/5 px-4 py-3">
            <h2 className="text-sm font-semibold">{editing.label}</h2>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              <X className="size-3.5" />
              Cancel
            </Button>
          </header>

          <form
            action={action}
            key={editing.id}
            className="flex flex-col gap-3 px-4 py-4"
          >
            <input type="hidden" name="id" value={editing.id} />
            {!state.ok ? <FormError message={state.message} /> : null}

            <FieldRow cols={3}>
              <Field label="Prefix" htmlFor="prefix">
                <Input
                  id="prefix"
                  name="prefix"
                  defaultValue={editing.prefix}
                  className="font-mono uppercase"
                  maxLength={10}
                  autoFocus
                />
              </Field>
              <Field label="Suffix" htmlFor="suffix">
                <Input
                  id="suffix"
                  name="suffix"
                  defaultValue={editing.suffix}
                  className="font-mono uppercase"
                  maxLength={10}
                  placeholder="Optional"
                />
              </Field>
              <Field
                label="Padding"
                htmlFor="padding"
                hint="Digits in the counter, e.g. 6 → 000001."
              >
                <Input
                  id="padding"
                  name="padding"
                  type="number"
                  min="1"
                  max="12"
                  defaultValue={editing.padding}
                  className="text-right"
                />
              </Field>
            </FieldRow>

            <FieldRow cols={3}>
              <Field
                label="Next number"
                htmlFor="next_number"
                error={state.errors?.next_number}
                hint="Can be raised, never lowered."
              >
                <Input
                  id="next_number"
                  name="next_number"
                  type="number"
                  min={editing.nextNumber}
                  defaultValue={editing.nextNumber}
                  className="text-right"
                />
              </Field>
              <Field label="Reset" htmlFor="reset_rule">
                <select
                  id="reset_rule"
                  name="reset_rule"
                  defaultValue={editing.resetRule}
                  className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
                >
                  <option value="never">Never</option>
                  <option value="yearly">Yearly</option>
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily</option>
                </select>
              </Field>
              <label className="flex items-center justify-between gap-3 self-end rounded-xs border border-border px-3 py-2">
                <span className="text-sm font-medium">Include period</span>
                <Switch
                  name="include_period"
                  defaultChecked={editing.includePeriod}
                />
              </label>
            </FieldRow>

            <div>
              <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
                Save numbering
              </SubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      <div className="overflow-hidden rounded-xs border border-border bg-card">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <Th>Document</Th>
                <Th>Next number</Th>
                <Th align="right">Counter</Th>
                <Th align="right">Padding</Th>
                <Th>Reset</Th>
                <Th>Period</Th>
                <th className="w-14" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">{row.label}</td>
                  <td className="px-3 py-2">
                    <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {row.preview}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">
                    {row.nextNumber}
                  </td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">
                    {row.padding}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {humanise(row.resetRule)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {row.currentPeriod ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setEditing(row)}
                      aria-label={`Edit ${row.label} numbering`}
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
