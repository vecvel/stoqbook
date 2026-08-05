"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
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
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * Inline create/edit/delete panel used by the reference-data screens
 * (categories, brands, units, tax groups, departments, …). One implementation
 * keeps every simple maintenance screen behaving identically.
 */

export type CrudFieldType = "text" | "number" | "select" | "boolean";

export interface CrudField {
  name: string;
  label: string;
  type?: CrudFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  step?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | boolean;
  /** Hidden when editing an existing row. */
  createOnly?: boolean;
}

export interface CrudRow {
  id: string;
  /** Cell contents keyed by column key. */
  cells: Record<string, React.ReactNode>;
  /** Values used to populate the edit form. */
  values: Record<string, string | boolean>;
  /** Blocks deletion with a reason, e.g. "in use by 12 products". */
  deleteBlockedReason?: string;
}

export interface CrudColumn {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
}

export function CrudPanel({
  title,
  description,
  columns,
  rows,
  fields,
  saveAction,
  deleteAction,
  canWrite,
  canDelete,
  addLabel = "Add",
  emptyMessage = "Nothing here yet.",
}: {
  title: string;
  description?: string;
  columns: CrudColumn[];
  rows: CrudRow[];
  fields: CrudField[];
  saveAction: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  deleteAction: (id: string) => Promise<ActionResult>;
  canWrite: boolean;
  canDelete: boolean;
  addLabel?: string;
  emptyMessage?: string;
}) {
  const [editing, setEditing] = useState<CrudRow | null>(null);
  const [creating, setCreating] = useState(false);

  /* Success handling lives inside the action rather than in an effect watching
     `state`. An effect keyed on the result object fires on every identity
     change, which is one render too late and one trigger too many; doing it here
     means "saved" and "form closed" happen in the same transition. */
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveAction(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setEditing(null);
        setCreating(false);
      }
      return result;
    },
    { ok: true },
  );
  const [pending, startTransition] = useTransition();

  const remove = (id: string) => {
    startTransition(async () => {
      const result = await deleteAction(id);
      if (result.ok) toast.success(result.message ?? "Deleted.");
      else toast.error(result.message ?? "Could not delete.");
    });
  };

  const formOpen = creating || editing !== null;
  const activeValues = editing?.values ?? {};

  return (
    <section className="rounded-xs border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {canWrite ? (
          formOpen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              <X className="size-3.5" />
              Cancel
            </Button>
          ) : (
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              <Plus className="size-3.5" />
              {addLabel}
            </Button>
          )
        ) : null}
      </header>

      {formOpen ? (
        <form
          action={action}
          key={editing?.id ?? "new"}
          className="flex flex-col gap-3 border-b border-border bg-muted/40 px-4 py-4"
        >
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
          {!state.ok ? <FormError message={state.message} /> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fields
              .filter((f) => !(editing && f.createOnly))
              .map((field) => (
                <CrudFieldInput
                  key={field.name}
                  field={field}
                  value={activeValues[field.name]}
                  error={state.errors?.[field.name]}
                />
              ))}
          </div>

          <div>
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              {editing ? "Save changes" : addLabel}
            </SubmitButton>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    (!col.align || col.align === "left") && "text-left",
                  )}
                >
                  {col.label}
                </th>
              ))}
              {canWrite || canDelete ? (
                <th className="w-20 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "transition-colors hover:bg-muted/40",
                    editing?.id === row.id && "bg-accent/5",
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "px-3 py-2 align-middle",
                        col.align === "right" && "text-right tabular",
                        col.align === "center" && "text-center",
                      )}
                    >
                      {row.cells[col.key]}
                    </td>
                  ))}
                  {canWrite || canDelete ? (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canWrite ? (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Edit"
                            onClick={() => {
                              setCreating(false);
                              setEditing(row);
                            }}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          row.deleteBlockedReason ? (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled
                              title={row.deleteBlockedReason}
                              aria-label="Cannot delete"
                            >
                              <Trash2 className="opacity-40" />
                            </Button>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  disabled={pending}
                                  className="text-destructive hover:bg-destructive/10"
                                  aria-label="Delete"
                                >
                                  <Trash2 />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Delete this record?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This cannot be undone. Records referenced by
                                    existing transactions are protected and the
                                    deletion will be refused.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => remove(row.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CrudFieldInput({
  field,
  value,
  error,
}: {
  field: CrudField;
  value: string | boolean | undefined;
  error?: string[];
}) {
  const resolved =
    value ?? field.defaultValue ?? (field.type === "boolean" ? true : "");

  if (field.type === "boolean") {
    return (
      <label className="flex items-center justify-between gap-3 self-end rounded-xs border border-border bg-background px-3 py-2">
        <span className="text-sm font-medium">{field.label}</span>
        <Switch name={field.name} defaultChecked={Boolean(resolved)} />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <Field
        label={field.label}
        htmlFor={field.name}
        hint={field.hint}
        error={error}
        required={field.required}
      >
        <select
          id={field.name}
          name={field.name}
          defaultValue={String(resolved)}
          className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
    );
  }

  return (
    <Field
      label={field.label}
      htmlFor={field.name}
      hint={field.hint}
      error={error}
      required={field.required}
    >
      <Input
        id={field.name}
        name={field.name}
        type={field.type === "number" ? "number" : "text"}
        step={field.step}
        min={field.type === "number" ? "0" : undefined}
        placeholder={field.placeholder}
        defaultValue={String(resolved)}
        required={field.required}
      />
    </Field>
  );
}
