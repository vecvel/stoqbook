import { redirect } from "next/navigation";

import { getContext } from "@/lib/authz/context";
import { isInstalled } from "@/lib/services/business";

/**
 * The root path is a router, not a page: an unconfigured installation goes to
 * setup, a signed-in user to their dashboard, everyone else to sign-in.
 */
export default async function RootPage() {
  if (!(await isInstalled())) redirect("/setup");

  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect("/dashboard");
}
