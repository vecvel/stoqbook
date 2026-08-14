import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 403 page (rendered by `forbidden()` from the authorization pipeline).
 *
 * The wording says who to ask rather than what was missing. Naming the absent
 * permission would tell someone probing the app exactly what to look for, and it
 * would mean nothing to the cashier who followed a stale bookmark
 * (04-rbac.md § Authorization Response).
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <ShieldOff className="size-5 text-destructive" aria-hidden />
        </span>

        <h1 className="mt-4 text-lg font-semibold">You do not have access</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your role does not include this screen. If you need it, ask whoever
          administers your store or the super admin to add it to your role.
        </p>

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button asChild variant="accent" size="sm">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          You are still signed in. Nothing was changed.
        </p>
      </div>
    </main>
  );
}
