import Link from "next/link";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * 401 page (rendered by `unauthorized()` when there is no valid session).
 *
 * Distinct from the 403: this one is fixable by the person reading it, so it
 * offers the sign-in link rather than telling them to find an administrator. It
 * most often appears when a session expired in a tab left open overnight.
 */
export default function Unauthorized() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <LogIn className="size-5 text-muted-foreground" aria-hidden />
        </span>

        <h1 className="mt-4 text-lg font-semibold">Please sign in</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your session has ended, or you are not signed in. Signing in again will
          bring you straight back.
        </p>

        <div className="mt-5">
          <Button asChild variant="accent" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
