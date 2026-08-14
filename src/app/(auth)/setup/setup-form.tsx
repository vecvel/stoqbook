"use client";

import { useActionState, useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

import { Field, FieldRow, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { setupAction, type AuthFormState } from "../actions";

/**
 * First-run setup step-based wizard.
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
  const [step, setStep] = useState(1);

  const validateStep = (currentStep: number) => {
    if (currentStep === 1) {
      const businessName = document.getElementById("business_name") as HTMLInputElement;
      if (!businessName?.value.trim()) {
        businessName?.reportValidity();
        return false;
      }
    } else if (currentStep === 2) {
      const superAdminName = document.getElementById("super_admin_name") as HTMLInputElement;
      const email = document.getElementById("email") as HTMLInputElement;
      const password = document.getElementById("password") as HTMLInputElement;
      const confirmPassword = document.getElementById("confirm_password") as HTMLInputElement;

      if (!superAdminName?.value.trim()) {
        superAdminName?.reportValidity();
        return false;
      }
      if (!email?.value.trim() || !email.reportValidity()) {
        email?.reportValidity();
        return false;
      }
      if (!password?.value || password.value.length < 8) {
        password?.setCustomValidity("Password must be at least 8 characters.");
        password?.reportValidity();
        return false;
      } else {
        password?.setCustomValidity("");
      }
      if (confirmPassword?.value !== password?.value) {
        confirmPassword?.setCustomValidity("Passwords do not match.");
        confirmPassword?.reportValidity();
        return false;
      } else {
        confirmPassword?.setCustomValidity("");
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <FormError message={state.error} />

      {/* Step Indicator Progress Bar */}
      <div className="flex items-center justify-between border-b border-border pb-5 mb-2 select-none">
        {[
          { num: 1, label: "Business" },
          { num: 2, label: "Super Admin" },
        ].map((s, idx) => (
          <div key={s.num} className="flex flex-1 items-center last:flex-initial">
            <div className="flex items-center gap-2">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                  step === s.num
                    ? "bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20 scale-110"
                    : step > s.num
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.num}
              </span>
              <span
                className={`text-xs font-semibold ${
                  step === s.num
                    ? "text-foreground font-bold"
                    : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < 1 && (
              <div
                className={`mx-4 h-0.5 flex-1 transition-all duration-500 ${
                  step > s.num ? "bg-accent" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: BUSINESS */}
      <div className={step === 1 ? "flex flex-col gap-4" : "hidden"}>
        <div className="mb-2">
          <h2 className="text-base font-bold text-foreground">Your business details</h2>
          <p className="text-xs text-muted-foreground">Specify your store name, currency, and country configuration.</p>
        </div>

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
            placeholder="My Business"
            required={step === 1}
            autoFocus={step === 1}
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
      </div>

      {/* STEP 2: SUPER ADMIN */}
      <div className={step === 2 ? "flex flex-col gap-4" : "hidden"}>
        <div className="mb-2">
          <h2 className="text-base font-bold text-foreground">Super Admin account</h2>
          <p className="text-xs text-muted-foreground">
            The super admin holds every permission and cannot be locked out.
          </p>
        </div>

        <FieldRow>
          <Field
            label="Your name"
            htmlFor="super_admin_name"
            error={errors.super_admin_name}
            hint="Enter your name."
            required
          >
            <Input
              id="super_admin_name"
              name="super_admin_name"
              placeholder="Stoqer"
              required={step === 2}
            />
          </Field>
          <Field label="Email address" htmlFor="email" error={errors.email} required>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@business.com"
              required={step === 2}
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
              required={step === 2}
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
              required={step === 2}
            />
          </Field>
        </FieldRow>
      </div>

      {/* Step Buttons */}
      <div className="flex gap-3 mt-4">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="w-1/3 gap-1"
          >
            <ChevronLeft className="size-4" />
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button
            type="button"
            onClick={handleNext}
            className="flex-1 gap-1"
          >
            Continue
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <SubmitButton className="flex-1" pendingLabel="Setting up…">
            Complete setup
          </SubmitButton>
        )}
      </div>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Setup provisions your business, the standard role set, default tax groups
        and document numbering. Add your stores from Settings once you&apos;re in.
        This runs once.
      </p>
    </form>
  );
}
