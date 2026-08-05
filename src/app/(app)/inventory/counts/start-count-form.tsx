"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

import { startStockCount } from "../actions";

export function StartCountForm({
  warehouses,
}: {
  warehouses: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    startStockCount,
    { ok: true },
  );

  return (
    <section className="rounded-xs border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Start a count</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A count sheet is generated from every tracked product currently holding
          a stock record in the chosen warehouse.
        </p>
      </header>
      <form
        action={action}
        className="flex flex-wrap items-end gap-3 px-4 py-4"
      >
        {!state.ok ? (
          <div className="w-full">
            <FormError message={state.message} />
          </div>
        ) : null}

        <Field
          label="Warehouse"
          htmlFor="warehouse_id"
          className="min-w-[200px]"
          required
        >
          <select
            id="warehouse_id"
            name="warehouse_id"
            className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Name" htmlFor="name" className="min-w-[220px] flex-1">
          <Input
            id="name"
            name="name"
            placeholder="Month-end count — July"
          />
        </Field>

        <SubmitButton variant="accent" size="sm" pendingLabel="Generating…">
          Start count
        </SubmitButton>
      </form>
    </section>
  );
}
