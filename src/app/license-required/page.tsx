import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getContext } from "@/lib/authz/context";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Access unavailable" };

/**
 * Shown when a user is authenticated but the business cannot operate: it is
 * suspended, archived, still mid-setup, or holding an expired licence. Data is
 * preserved in every one of these states (02-business-structure.md).
 */
export default async function LicenseRequiredPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.business.status === "active" && ctx.entitlements.isValid) {
    redirect("/dashboard");
  }

  const { business, entitlements } = ctx;

  const cases: Record<
    string,
    { title: string; body: string; tone: "warning" | "danger" }
  > = {
    suspended: {
      title: "Business suspended",
      body:
        business.suspended_reason ??
        "Access has been suspended. Your data is intact and will be available as soon as the issue is resolved.",
      tone: "danger",
    },
    archived: {
      title: "Business archived",
      body:
        "This business has been archived and is no longer trading. All data is retained and the super admin can reactivate it from the admin panel.",
      tone: "warning",
    },
    created: {
      title: "Setup not finished",
      body:
        "Installation setup was started but never completed. The super admin can finish it from the admin panel.",
      tone: "warning",
    },
  };

  const detail =
    cases[business.status] ??
    (entitlements.isValid
      ? {
          title: "Business unavailable",
          body: "This business is not currently active.",
          tone: "warning" as const,
        }
      : {
          title: "Licence not active",
          body:
            entitlements.invalidReason ??
            "The licence is not active. Renew it to restore access — no data has been lost.",
          tone: "danger" as const,
        });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xs bg-bark text-sm font-bold text-parchment">
            S
          </span>
          <span className="font-semibold tracking-tight">StoqBook</span>
        </div>

        <div className="rounded-xs border border-border bg-card">
          <div
            className={
              detail.tone === "danger"
                ? "border-b-2 border-destructive px-5 py-4"
                : "border-b-2 border-warning px-5 py-4"
            }
          >
            <h1 className="text-lg font-semibold">{detail.title}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{detail.body}</p>
          </div>

          <dl className="divide-y divide-border">
            <Row label="Business" value={business.name} />
            <Row label="Status" value={business.status.replace(/_/g, " ")} />
            <Row label="Plan" value={entitlements.plan?.name ?? "None assigned"} />
            {entitlements.license?.expires_at ? (
              <Row
                label="Expired"
                value={formatDate(entitlements.license.expires_at)}
              />
            ) : null}
            <Row label="Signed in as" value={ctx.user.email} />
          </dl>

          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
            {ctx.isSuperAdmin ? (
              <Button asChild variant="accent" size="sm">
                <Link href="/admin/license">Fix the licence</Link>
              </Button>
            ) : null}
            <form action="/api/session/logout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Need help? Contact the super admin.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="field-label">{label}</dt>
      <dd className="text-sm capitalize">{value}</dd>
    </div>
  );
}
