"use client";

import { useActionState } from "react";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";

import { setupAction, type AuthFormState } from "../actions";

/**
 * First-run setup. Everything here is captured in one submission so the
 * installation is fully usable the moment it completes — a partially set up
 * business would leave POS and inventory unable to function.
 */
export function SetupForm({
  countries,
  currencies,
  timezones,
}: {
  countries: { value: string; label: string }[];
  currencies: { value: string; label: string }[];
  timezones: string[];
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    setupAction,
    {},
  );
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={state.error} />

      <section className="flex flex-col gap-4">
        <h2 className="section-title">1 · Your business</h2>

        <Field
          label="Business name"
          htmlFor="business_name"
          error={errors.business_name}
          hint="Shown on invoices and receipts."
          required
        >
          <Input
            id="business_name"
            name="business_name"
            placeholder="FreshMart Supermarket"
            required
            autoFocus
          />
        </Field>

        <FieldRow>
          <Field
            label="First store"
            htmlFor="store_name"
            hint="More stores can be added later."
          >
            <Input
              id="store_name"
              name="store_name"
              placeholder="Main Store"
              defaultValue="Main Store"
            />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+91 98200 11223"
            />
          </Field>
        </FieldRow>

        <FieldRow cols={3}>
          <Field label="Country" htmlFor="country">
            <select
              id="country"
              name="country"
              defaultValue="IN"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {countries.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor="currency">
            <select
              id="currency"
              name="currency"
              defaultValue="INR"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {currencies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="Business days are cut here."
          >
            <select
              id="timezone"
              name="timezone"
              defaultValue="Asia/Kolkata"
              className="h-9 w-full rounded-xs border border-input bg-background px-2.5 text-sm outline-none focus:border-ring"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
        </FieldRow>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="section-title">2 · Owner account</h2>
        <p className="-mt-2 text-xs text-muted-foreground">
          The owner holds every permission and cannot be locked out. Additional
          users are created later from Employees.
        </p>

        <FieldRow>
          <Field
            label="Your name"
            htmlFor="owner_name"
            error={errors.owner_name}
            required
          >
            <Input
              id="owner_name"
              name="owner_name"
              placeholder="Asha Menon"
              required
            />
          </Field>
          <Field label="Email address" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              required
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field
            label="Password"
            htmlFor="password"
            error={errors.password}
            hint="8+ characters, mixed case and a number."
            required
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>
          <Field
            label="Confirm password"
            htmlFor="confirm_password"
            error={errors.confirm_password}
            required
          >
            <Input
              id="confirm_password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>
        </FieldRow>
      </section>

      <section className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="section-title">3 · Licence</h2>

        <Field
          label="Licence key"
          htmlFor="license_key"
          hint="Optional. A lifetime licence is activated either way; the key is recorded for your records."
        >
          <Input
            id="license_key"
            name="license_key"
            placeholder="STQB-XXXX-XXXX-XXXX"
            className="font-mono"
          />
        </Field>
      </section>

      <SubmitButton className="w-full" pendingLabel="Setting up…">
        Complete setup
      </SubmitButton>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Setup provisions your store, warehouse, the standard role set, default
        tax groups and document numbering so you can start trading immediately.
        This runs once.
      </p>
    </form>
  );
}
