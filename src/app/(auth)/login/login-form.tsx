"use client";

import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/shared/form";
import { Input } from "@/components/ui/input";

import { loginAction, type AuthFormState } from "../actions";

const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "superadmin@mybusiness.test", desc: "Universal control over all modules, stores & reports." },
  { label: "Manager", email: "manager@mybusiness.test", desc: "Runs single-store inventory, sales, purchases & staff." },
  { label: "Cashier", email: "cashier@mybusiness.test", desc: "Fast POS counter sales, sessions & receipt prints." },
  { label: "Inventory", email: "stock@mybusiness.test", desc: "Monitors stock levels, audits, counts & transfers." },
  { label: "Accountant", email: "accounts@mybusiness.test", desc: "Financial ledgers, expenses & reports (Read-only)." },
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
        <div className="mt-2.5 flex flex-col gap-1.5">
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
              className="group flex flex-col gap-0.5 rounded-xs border border-transparent bg-transparent px-2 py-1.5 text-left text-[11px] text-muted-foreground transition-all hover:border-border hover:bg-card hover:text-foreground"
            >
              <span className="font-semibold text-foreground group-hover:text-accent">
                {account.label}
              </span>
              <span className="text-[10px] text-muted-foreground/80">
                {account.email}
              </span>
              <span className="text-[10px] leading-normal text-muted-foreground/75 group-hover:text-muted-foreground">
                {account.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
