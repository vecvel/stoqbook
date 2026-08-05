"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { SubmitButton, FormError } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import { saveSettings } from "./actions";

export interface SettingFieldView {
  key: string;
  label: string;
  description?: string;
  type: "text" | "textarea" | "number" | "boolean" | "select" | "money";
  options?: { value: string; label: string }[];
  value: unknown;
  /** Which module registered it, shown as provenance. */
  moduleName: string;
  editable: boolean;
}

export interface SettingGroupView {
  group: string;
  fields: SettingFieldView[];
}

/**
 * Renders settings from the registry rather than a hand-written form, so a new
 * module's settings appear here automatically (17-settings.md).
 */
export function SettingsPanel({
  groups,
  currencySymbol,
}: {
  groups: SettingGroupView[];
  currencySymbol: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(saveSettings, {
    ok: true,
  });

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const allKeys = groups.flatMap((g) =>
    g.fields.filter((f) => f.editable).map((f) => f.key),
  );

  if (allKeys.length === 0) {
    return (
      <p className="rounded-xs border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No configurable settings are available for your role.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* The server only persists keys listed here. */}
      {allKeys.map((key) => (
        <input key={key} type="hidden" name="__keys" value={key} />
      ))}

      {!state.ok ? <FormError message={state.message} /> : null}

      {groups.map((group) => (
        <section
          key={group.group}
          className="rounded-xs border border-border bg-card"
        >
          <header className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{group.group}</h2>
          </header>
          <div className="divide-y divide-border">
            {group.fields.map((field) => (
              <SettingRow
                key={field.key}
                field={field}
                currencySymbol={currencySymbol}
                error={state.errors?.[field.key]}
              />
            ))}
          </div>
        </section>
      ))}

      <div className="sticky bottom-0 flex justify-end border-t border-border bg-background/95 py-3 backdrop-blur">
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          Save settings
        </SubmitButton>
      </div>
    </form>
  );
}

function SettingRow({
  field,
  currencySymbol,
  error,
}: {
  field: SettingFieldView;
  currencySymbol: string;
  error?: string[];
}) {
  const disabled = !field.editable;

  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-md">
        <label
          htmlFor={field.key}
          className="block text-sm font-medium text-foreground"
        >
          {field.label}
        </label>
        {field.description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {field.description}
          </p>
        ) : null}
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
          {field.key}
        </p>
        {error?.map((message) => (
          <p key={message} className="mt-0.5 text-[11px] text-destructive">
            {message}
          </p>
        ))}
      </div>

      <div className="w-full shrink-0 sm:w-64">
        {field.type === "boolean" ? (
          <div className="flex sm:justify-end">
            <Switch
              id={field.key}
              name={field.key}
              defaultChecked={Boolean(field.value)}
              disabled={disabled}
            />
          </div>
        ) : field.type === "select" ? (
          <select
            id={field.key}
            name={field.key}
            defaultValue={String(field.value ?? "")}
            disabled={disabled}
            className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60"
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.type === "textarea" ? (
          <Textarea
            id={field.key}
            name={field.key}
            rows={3}
            defaultValue={String(field.value ?? "")}
            disabled={disabled}
          />
        ) : (
          <div className="relative">
            {field.type === "money" ? (
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {currencySymbol}
              </span>
            ) : null}
            <Input
              id={field.key}
              name={field.key}
              type={
                field.type === "number" || field.type === "money"
                  ? "number"
                  : "text"
              }
              step={field.type === "money" ? "0.01" : "1"}
              min={
                field.type === "number" || field.type === "money"
                  ? "0"
                  : undefined
              }
              defaultValue={String(field.value ?? "")}
              disabled={disabled}
              className={
                field.type === "money"
                  ? "pl-7 text-right"
                  : field.type === "number"
                    ? "text-right"
                    : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
