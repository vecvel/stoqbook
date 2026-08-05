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

import { saveSupplier } from "./actions";

export interface SupplierFormValues {
  id?: string;
  code: string;
  companyName: string;
  contactPerson: string;
  type: string;
  phone: string;
  email: string;
  website: string;
  taxNumber: string;
  registrationNumber: string;
  paymentTerms: string;
  creditDays: string;
  rating: string;
  status: string;
  note: string;
}

export const EMPTY_SUPPLIER: SupplierFormValues = {
  code: "",
  companyName: "",
  contactPerson: "",
  type: "distributor",
  phone: "",
  email: "",
  website: "",
  taxNumber: "",
  registrationNumber: "",
  paymentTerms: "",
  creditDays: "0",
  rating: "0",
  status: "active",
  note: "",
};

export function SupplierForm({
  values,
  ratingsEnabled,
  defaultCreditDays,
}: {
  values: SupplierFormValues;
  ratingsEnabled: boolean;
  defaultCreditDays: number;
}) {
  const [state, action] = useActionState<ActionResult<{ id: string }>, FormData>(
    saveSupplier,
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

      <FormSection title="Company">
        <FieldRow cols={2}>
          <Field
            label="Company name"
            htmlFor="company_name"
            error={errors.company_name}
            required
          >
            <Input
              id="company_name"
              name="company_name"
              defaultValue={values.companyName}
              placeholder="Metro Cash & Carry"
              required
              autoFocus={!isEdit}
            />
          </Field>
          <Field
            label="Supplier code"
            htmlFor="code"
            hint={isEdit ? undefined : "Generated automatically if left blank."}
          >
            <Input
              id="code"
              name="code"
              defaultValue={values.code}
              placeholder="SUP-000001"
              className="font-mono"
              readOnly={isEdit}
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Contact person" htmlFor="contact_person">
            <Input
              id="contact_person"
              name="contact_person"
              defaultValue={values.contactPerson}
            />
          </Field>
          <Field label="Supplier type" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue={values.type}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="manufacturer">Manufacturer</option>
              <option value="distributor">Distributor</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="importer">Importer</option>
              <option value="local_vendor">Local vendor</option>
              <option value="service_provider">Service provider</option>
            </select>
          </Field>
          <Field
            label="Status"
            htmlFor="status"
            hint="Blocked suppliers cannot receive new orders."
          >
            <select
              id="status"
              name="status"
              defaultValue={values.status}
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              <option value="active">Active</option>
              <option value="pending">Pending verification</option>
              <option value="inactive">Inactive</option>
              <option value="blocked">Blocked</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection title="Contact">
        <FieldRow cols={3}>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
              placeholder="+91 22 4000 1000"
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
          <Field label="Website" htmlFor="website">
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={values.website}
              placeholder="https://…"
            />
          </Field>
        </FieldRow>
      </FormSection>

      <FormSection
        title="Compliance and terms"
        description="Credit days drive the default due date on purchase invoices."
      >
        <FieldRow cols={2}>
          <Field label="Tax number" htmlFor="tax_number">
            <Input
              id="tax_number"
              name="tax_number"
              defaultValue={values.taxNumber}
              placeholder="GSTIN"
              className="font-mono"
            />
          </Field>
          <Field label="Registration number" htmlFor="registration_number">
            <Input
              id="registration_number"
              name="registration_number"
              defaultValue={values.registrationNumber}
              className="font-mono"
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Payment terms" htmlFor="payment_terms">
            <Input
              id="payment_terms"
              name="payment_terms"
              defaultValue={values.paymentTerms}
              placeholder={`Net ${defaultCreditDays}`}
            />
          </Field>
          <Field label="Credit days" htmlFor="credit_days">
            <Input
              id="credit_days"
              name="credit_days"
              type="number"
              min="0"
              defaultValue={values.creditDays}
              className="text-right"
            />
          </Field>
          {ratingsEnabled ? (
            <Field
              label="Rating (0–5)"
              htmlFor="rating"
              hint="Delivery, quality and responsiveness."
            >
              <Input
                id="rating"
                name="rating"
                type="number"
                step="0.1"
                min="0"
                max="5"
                defaultValue={values.rating}
                className="text-right"
              />
            </Field>
          ) : (
            <input type="hidden" name="rating" value={values.rating} />
          )}
        </FieldRow>

        <Field label="Internal note" htmlFor="note">
          <Textarea
            id="note"
            name="note"
            rows={2}
            defaultValue={values.note}
            placeholder="Delivery patterns, negotiated terms, contacts."
          />
        </Field>
      </FormSection>

      <FormActions>
        <Button asChild variant="outline" size="sm">
          <Link href={values.id ? `/suppliers/${values.id}` : "/suppliers"}>
            Cancel
          </Link>
        </Button>
        <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
          {isEdit ? "Save changes" : "Create supplier"}
        </SubmitButton>
      </FormActions>
    </form>
  );
}
