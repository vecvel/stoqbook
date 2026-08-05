import { NextResponse, type NextRequest } from "next/server";

import { getContext } from "@/lib/authz/context";
import { setActiveStore } from "@/lib/auth/session";

/**
 * Switches the store the session operates in.
 *
 * Only stores the user is actually scoped to are accepted, so a crafted id
 * cannot widen access.
 */
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const storeId = request.nextUrl.searchParams.get("id");
  const allowed = ctx.stores.some((s) => s.id === storeId);

  if (storeId && allowed) {
    await setActiveStore(ctx.session.id, storeId);
  }

  // Return the user to where they came from, defaulting to the dashboard.
  const referer = request.headers.get("referer");
  const target =
    referer && new URL(referer, request.url).origin === request.nextUrl.origin
      ? referer
      : new URL("/dashboard", request.url).toString();

  return NextResponse.redirect(target);
}
