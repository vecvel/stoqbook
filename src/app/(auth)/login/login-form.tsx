"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";

import { loginAction, type AuthFormState } from "../actions";

const DEMO_ACCOUNTS = [
  { label: "Owner", email: "owner@freshmart.test" },
  { label: "Manager", email: "manager@freshmart.test" },
  { label: "Cashier", email: "cashier@freshmart.test" },
  { label: "Inventory", email: "stock@freshmart.test" },
  { label: "Accountant", email: "accounts@freshmart.test" },
];

const DEMO_PASSWORD = "Stoqbook@123";

export function LoginForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(
    loginAction,
    {},
  );

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-col gap-4">
        <FormError message={state.error} />

        <Field label="Email address" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            required
            autoFocus
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </Field>

        <SubmitButton className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
      </form>

      {/* Demo credentials, so the seeded business is easy to explore. */}
      <div className="rounded-xs border border-border bg-muted/50 px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Demo accounts
          </span>
          <code className="rounded-xs bg-card px-1.5 py-0.5 font-mono text-[11px]">
            {DEMO_PASSWORD}
          </code>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                const form = document.querySelector("form");
                const email = form?.querySelector<HTMLInputElement>("#email");
                const password =
                  form?.querySelector<HTMLInputElement>("#password");
                if (email) email.value = account.email;
                if (password) password.value = DEMO_PASSWORD;
                email?.focus();
              }}
              className="rounded-xs px-1.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <span className="block font-medium text-foreground">
                {account.label}
              </span>
              <span className="block truncate">{account.email}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
