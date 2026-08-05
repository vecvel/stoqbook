import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";

import { toAppError } from "@/lib/authz/errors";

/**
 * Standard response envelope (18-api-specification.md § Standard Response Format).
 */

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  pages?: number;
  [key: string]: unknown;
}

export interface ApiLinks {
  self?: string;
  next?: string | null;
  prev?: string | null;
}

export function ok<T>(
  data: T,
  options: { message?: string; meta?: ApiMeta; links?: ApiLinks; status?: number } = {},
) {
  return NextResponse.json(
    {
      success: true,
      message: options.message ?? "Operation completed successfully.",
      data,
      meta: options.meta ?? {},
      links: options.links ?? {},
    },
    { status: options.status ?? 200 },
  );
}

export function created<T>(data: T, message = "Resource created successfully.") {
  return ok(data, { message, status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(
  message: string,
  options: {
    status?: number;
    errors?: Record<string, string[]>;
    code?: string;
  } = {},
) {
  return NextResponse.json(
    {
      success: false,
      message,
      code: options.code,
      errors: options.errors ?? {},
    },
    { status: options.status ?? 400 },
  );
}

/** Converts any thrown value into the standard failure envelope. */
export function failFrom(error: unknown) {
  /* A Next control-flow signal is not an error and must not be turned into a
     JSON body. API routes pass `onDenied: "throw"` so they should never see one,
     but re-throwing keeps a stray `redirect()` in a service from being swallowed
     into a misleading 500. */
  unstable_rethrow(error);
  const appError = toAppError(error);

  if (appError.category === "system" && process.env.NODE_ENV !== "test") {
    console.error("[api]", appError.message, error);
  }

  return fail(
    // Never leak internal details on a 500.
    appError.category === "system"
      ? "An unexpected error occurred."
      : appError.message,
    {
      status: appError.status,
      errors: appError.errors,
      code: appError.code,
    },
  );
}

export function paginationMeta(
  page: number,
  limit: number,
  total: number,
): ApiMeta {
  return {
    page,
    limit,
    total,
    pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}
