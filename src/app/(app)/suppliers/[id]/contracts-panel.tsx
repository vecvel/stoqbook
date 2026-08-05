"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  SubmitButton,
} from "@/components/shared/form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import { deleteSupplierContract, saveSupplierContract } from "../actions";

export interface ContractView {
  id: string;
  contractNumber: string;
  effectiveFrom: string;
  effectiveTo: string;
  terms: string;
  attachmentUrl: string;
  isActive: boolean;
  expired: boolean;
}

export function ContractsPanel({
  supplierId,
  contracts,
  canWrite,
}: {
  supplierId: string;
  contracts: ContractView[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState<ContractView | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  // Close-on-success runs inside the action, not in an effect watching `state`.
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, form) => {
      const result = await saveSupplierContract(prev, form);
      if (result.ok && result.message) {
        toast.success(result.message);
        setEditing(null);
        setCreating(false);
      }
      return result;
    },
    { ok: true },
  );

  const open = creating || editing !== null;

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteSupplierContract(id, supplierId);
      if (result.ok) toast.success(result.message ?? "Deleted.");
      else toast.error(result.message ?? "Could not delete the contract.");
    });
  }

  return (
    <section className="overflow-hidden rounded-xs border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">Contracts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Agreed terms and their validity window.
          </p>
        </div>
        {canWrite && !open ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setCreating(true);
            }}
          >
            Add contract
          </Button>
        ) : null}
      </header>

      {open ? (
        <form action={action} className="border-b border-border px-4 py-3">
          <input type="hidden" name="supplier_id" value={supplierId} />
          {editing ? (
            <input type="hidden" name="id" value={editing.id} />
          ) : null}

          {!state.ok ? <FormError message={state.message} /> : null}

          <FieldRow cols={3}>
            <Field label="Contract number" htmlFor="contract_number" required>
              <Input
                id="contract_number"
                name="contract_number"
                defaultValue={editing?.contractNumber ?? ""}
                placeholder="AGR-2026-01"
                required
              />
            </Field>
            <Field label="Effective from" htmlFor="effective_from" required>
              <Input
                id="effective_from"
                name="effective_from"
                type="date"
                defaultValue={editing?.effectiveFrom ?? ""}
                required
              />
            </Field>
            <Field
              label="Effective to"
              htmlFor="effective_to"
              hint="Blank means open-ended."
            >
              <Input
                id="effective_to"
                name="effective_to"
                type="date"
                defaultValue={editing?.effectiveTo ?? ""}
              />
            </Field>
          </FieldRow>

          <Field label="Terms" htmlFor="terms">
            <Textarea
              id="terms"
              name="terms"
              rows={3}
              defaultValue={editing?.terms ?? ""}
              placeholder="45-day credit, 2% settlement discount, free delivery above 25,000."
            />
          </Field>

          <FieldRow cols={2}>
            <Field label="Attachment URL" htmlFor="attachment_url">
              <Input
                id="attachment_url"
                name="attachment_url"
                defaultValue={editing?.attachmentUrl ?? ""}
                placeholder="Optional link to the signed copy"
              />
            </Field>
            <Field label="Active" htmlFor="contract_is_active">
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox
                  id="contract_is_active"
                  name="is_active"
                  value="on"
                  defaultChecked={editing?.isActive ?? true}
                />
                Currently in force
              </label>
            </Field>
          </FieldRow>

          <div className="mt-3 flex items-center gap-2">
            <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
              Save contract
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {contracts.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No contracts recorded for this supplier.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {contracts.map((contract) => (
            <li
              key={contract.id}
              className="flex flex-wrap items-center gap-3 px-4 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-mono text-xs font-medium">
                  {contract.contractNumber}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {contract.effectiveFrom}
                  {" → "}
                  {contract.effectiveTo || "open-ended"}
                </span>
                {contract.terms ? (
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {contract.terms}
                  </span>
                ) : null}
              </span>

              {contract.expired ? (
                <Badge variant="soft-warning">Expired</Badge>
              ) : contract.isActive ? (
                <Badge variant="soft-success">In force</Badge>
              ) : (
                <Badge variant="soft-neutral">Inactive</Badge>
              )}

              {contract.attachmentUrl ? (
                <a
                  href={contract.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent hover:underline"
                >
                  Signed copy
                </a>
              ) : null}

              {canWrite ? (
                <span className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setCreating(false);
                      setEditing(contract);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => remove(contract.id)}
                  >
                    Delete
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
