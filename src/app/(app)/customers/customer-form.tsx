"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormActions,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";

import { saveCustomer } from "./actions";

export interface CustomerFormValues {
  id?: string;
  code: string;
  name: string;
  companyName: string;
  type: string;
  groupId: string;
  phone: string;
  email: string;
  taxNumber: string;
  dateOfBirth: string;
  creditLimit: string;
  paymentTermsDays: string;
  status: string;
  note: string;
  isWalkIn?: boolean;
}

export const EMPTY_CUSTOMER: CustomerFormValues = {
  code: "",
  name: "",
  companyName: "",
  type: "retail",
  groupId: "",
  phone: "",
  email: "",
  taxNumber: "",
  dateOfBirth: "",
  creditLimit: "0",
  paymentTermsDays: "0",
  status: "active",
  note: "",
};

export function CustomerForm({
  values,
  groups,
  currencySymbol,
  creditEnabled,
  defaultCreditLimit,
}: {
  values: CustomerFormValues;
  groups: { id: string; name: string }[];
  currencySymbol: string;
  creditEnabled: boolean;
  defaultCreditLimit: number;
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    saveCustomer,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const errors = state.errors ?? {};
  const isEdit = Boolean(values.id);

  return (
    <form action={action} className="flex flex-col gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection title="Identity">
        <FieldRow cols={2}>
          <Field label="Name" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              name="name"
              defaultValue={values.name}
              placeholder="Ravi Sharma"
              required
              autoFocus={!isEdit}
              disabled={values.isWalkIn}
            />
          </Field>
          <Field
            label="Customer code"
            htmlFor="code"
            hint={isEdit ? undefined : "Generated automatically if left blank."}
          >
            <Input
              id="code"
              name="code"
              defaultValue={values.code}
              placeholder="CUS-000001"
              className="font-mono"
              readOnly={isEdit}
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Company" htmlFor="company_name">
            <Input
              id="company_name"
              name="company_name"
              defaultValue={values.companyName}
              placeholder="Optional"
            />
          </Field>
          <Field label="Type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue={values.type}
              disabled={values.isWalkIn}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60"
            >
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="corporate">Corporate</option>
              <option value="distributor">Distributor</option>
              <option value="employee">Employee</option>
              {values.isWalkIn ? <option value="walk_in">Walk-in</option> : null}
            </select>
          </Field>
          <Field label="Group" htmlFor="group_id">
            <select
              id="group_id"
              name="group_id"
              defaultValue={values.groupId}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection title="Contact">
        <FieldRow cols={3}>
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              placeholder="+91 98111 22334"
            />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
            />
          </Field>
          <Field label="Date of birth" htmlFor="date_of_birth">
            <Input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              defaultValue={values.dateOfBirth}
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Business terms"
        description={
          creditEnabled
            ? "Credit sales are blocked once the outstanding balance would exceed this limit."
            : "Credit accounts are not included in your current plan."
        }
      >
        <FieldRow cols={3}>
          <Field label="Tax number" htmlFor="tax_number">
            <Input
              id="tax_number"
              name="tax_number"
              defaultValue={values.taxNumber}
              placeholder="GSTIN"
              className="font-mono"
            />
          </Field>
          <Field
            label={`Credit limit (${currencySymbol})`}
            htmlFor="credit_limit"
            hint={
              !creditEnabled
                ? "Stored but not enforced without the credit feature."
                : defaultCreditLimit > 0
                  ? `Default ${defaultCreditLimit}`
                  : undefined
            }
          >
            <Input
              id="credit_limit"
              name="credit_limit"
              type="number"
              step="0.01"
              min="0"
              defaultValue={values.creditLimit}
              className="text-right"
            />
          </Field>
          <Field label="Payment terms (days)" htmlFor="payment_terms_days">
            <Input
              id="payment_terms_days"
              name="payment_terms_days"
              type="number"
              min="0"
              defaultValue={values.paymentTermsDays}
              className="text-right"
            />
          </Field>
        </FieldRow>

        <FieldRow cols={2}>
          <Field
            label="Status"
            htmlFor="status"
            hint="Blocked customers cannot take on new credit."
          >
            <select
              id="status"
              name="status"
              defaultValue={values.status}
              disabled={values.isWalkIn}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring disabled:opacity-60"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </FieldRow>

        <Field label="Internal note" htmlFor="note">
          <Textarea
            id="note"
            name="note"
            rows={2}
            defaultValue={values.note}
            placeholder="Preferences, delivery instructions, relationship notes."
          />
        </Field>
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href={values.id ? `/customers/${values.id}` : "/customers"}>
            Cancel
          </Link>
        </Button>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Create customer"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
