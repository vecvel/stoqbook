import "server-only";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { toAppError } from "@/lib/authz/errors";

/**
 * Uniform server-action result.
 *
 * Actions never throw across the RSC boundary — they return this shape so forms
 * can render field-level errors without an error boundary swallowing the page.
 */
export interface ActionResult<T = undefined> {
  ok: boolean;
  message?: string;
  errors?: Record<string, string[]>;
  data?: T;
}

export const success = <T>(data?: T, message?: string): ActionResult<T> => ({
  ok: true,
  message,
  data,
});

/**
 * `data` is optional on a failure because some failures carry detail the form
 * has to render — a spreadsheet import that rejected 12 of 400 rows needs to
 * show which 12, and a message string cannot express that.
 */
export const failure = <T = never>(
  message: string,
  errors?: Record<string, string[]>,
  data?: T,
): ActionResult<T> => ({ ok: false, message, errors, data });

/**
 * Wraps an action body, converting thrown AppErrors into a failure result.
 * `redirect()` throws a control-flow signal that must be re-thrown untouched.
 */
export async function runAction<T>(
  body: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    /* Next's internal control-flow signals — redirect, notFound, forbidden,
       unauthorized — must pass straight through. `unstable_rethrow` recognises
       all of them, including ones added in future versions; catching a denial
       here and returning it as a failure message would leave the user on a page
       they are not allowed to see. */
    unstable_rethrow(error);
    const appError = toAppError(error);
    if (appError.category === "system") {
      console.error("[action]", appError.message, error);
      return failure("Something went wrong. Please try again.");
    }
    return failure(appError.message, appError.errors);
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "NEXT_NOT_FOUND"
  );
}

/** Revalidates several paths after a mutation. */
export function revalidate(...paths: string[]): void {
  for (const path of paths) revalidatePath(path);
}

/* -------------------------------------------------------------------------- */
/* FormData coercion                                                          */
/* -------------------------------------------------------------------------- */

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function optionalStr(form: FormData, key: string): string | null {
  const value = str(form, key);
  return value === "" ? null : value;
}

export function num(form: FormData, key: string, fallback = 0): number {
  const value = Number(str(form, key));
  return Number.isFinite(value) ? value : fallback;
}

/** Decimal fields stay strings so exactness is never lost via Number. */
export function decimalStr(form: FormData, key: string, fallback = "0"): string {
  const value = str(form, key);
  if (value === "") return fallback;
  return /^-?\d*\.?\d*$/.test(value) ? value : fallback;
}

export function optionalDecimal(form: FormData, key: string): string | null {
  const value = str(form, key);
  if (value === "") return null;
  return /^-?\d*\.?\d*$/.test(value) ? value : null;
}

export function bool(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function uuid(form: FormData, key: string): string | null {
  const value = str(form, key);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

export function dateOrNull(form: FormData, key: string): Date | null {
  const value = str(form, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Reads repeated indexed fields from a form, e.g. `lines[0][product_id]`.
 * Rows are returned in index order with gaps removed.
 */
export function rows(
  form: FormData,
  prefix: string,
): Record<string, string>[] {
  const collected = new Map<number, Record<string, string>>();
  const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]\\[(\\w+)\\]$`);

  for (const [key, value] of form.entries()) {
    const match = key.match(pattern);
    if (!match) continue;
    const index = Number(match[1]);
    const field = match[2];
    const row = collected.get(index) ?? {};
    row[field] = String(value).trim();
    collected.set(index, row);
  }

  return [...collected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}
