import { NextResponse, type NextRequest } from "next/server";

import { destroySession } from "@/lib/auth/session";

/** Sign out. POST only, so it cannot be triggered by a link or image request. */
export async function POST(request: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 forces the follow-up request to be a GET.
    status: 303,
  });
}
