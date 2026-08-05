import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getContext } from "@/lib/authz/context";
import { getBusiness } from "@/lib/services/business";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // There is nothing to sign in to until the installation has been set up.
  const business = await getBusiness();
  if (!business) redirect("/setup");

  // Already signed in — send them where they belong.
  const ctx = await getContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{business.name}</p>
      </header>

      <LoginForm />
    </div>
  );
}
