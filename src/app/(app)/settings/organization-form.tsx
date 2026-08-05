"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  Field,
  FieldRow,
  FormError,
  FormSection,
  SubmitButton,
} from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/actions";

import { saveOrganization } from "./actions";

export interface OrganizationValues {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  taxNumber: string;
  registrationNumber: string;
  logoUrl: string;
}

export function OrganizationForm({ values }: { values: OrganizationValues }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    saveOrganization,
    { ok: true },
  );

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {!state.ok ? <FormError message={state.message} /> : null}

      <FormSection
        title="Organisation profile"
        description="Appears on invoices, receipts and purchase orders."
      >
        <FieldRow cols={2}>
          <Field
            label="Trading name"
            htmlFor="name"
            error={state.errors?.name}
            required
          >
            <Input id="name" name="name" defaultValue={values.name} required />
          </Field>
          <Field label="Legal name" htmlFor="legal_name">
            <Input
              id="legal_name"
              name="legal_name"
              defaultValue={values.legalName}
              placeholder="If different from the trading name"
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={values.email}
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={values.phone}
            />
          </Field>
          <Field label="Website" htmlFor="website">
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={values.website}
            />
          </Field>
        </FieldRow>

        <FieldRow cols={2}>
          <Field label="Address line 1" htmlFor="address_line1">
            <Input
              id="address_line1"
              name="address_line1"
              defaultValue={values.addressLine1}
            />
          </Field>
          <Field label="Address line 2" htmlFor="address_line2">
            <Input
              id="address_line2"
              name="address_line2"
              defaultValue={values.addressLine2}
            />
          </Field>
        </FieldRow>

        <FieldRow cols={4}>
          <Field label="City" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city} />
          </Field>
          <Field label="State" htmlFor="state">
            <Input id="state" name="state" defaultValue={values.state} />
          </Field>
          <Field label="Postal code" htmlFor="postal_code">
            <Input
              id="postal_code"
              name="postal_code"
              defaultValue={values.postalCode}
            />
          </Field>
          <Field label="Country" htmlFor="country">
            <Input
              id="country"
              name="country"
              defaultValue={values.country}
              maxLength={2}
              className="font-mono uppercase"
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Tax number" htmlFor="tax_number" hint="Printed on invoices.">
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
          <Field label="Logo URL" htmlFor="logo_url">
            <Input
              id="logo_url"
              name="logo_url"
              type="url"
              defaultValue={values.logoUrl}
              placeholder="https://…"
            />
          </Field>
        </FieldRow>

        <div className="flex justify-end">
          <SubmitButton variant="accent" size="sm" pendingLabel="Saving…">
            Save profile
          </SubmitButton>
        </div>
      </FormSection>
    </form>
  );
}
