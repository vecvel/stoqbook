/**
 * Standardised failure categories (01-platform-architecture.md § Failure Strategy).
 * Each maps to a single HTTP status and a safe, non-leaking message.
 */
export type FailureCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "business_rule"
  | "not_found"
  | "conflict"
  | "limit_exceeded"
  | "license"
  | "system";

const STATUS: Record<FailureCategory, number> = {
  authentication: 401,
  authorization: 403,
  validation: 422,
  business_rule: 409,
  not_found: 404,
  conflict: 409,
  limit_exceeded: 402,
  license: 402,
  system: 500,
};

export class AppError extends Error {
  readonly category: FailureCategory;
  readonly status: number;
  readonly code: string;
  readonly errors?: Record<string, string[]>;
  /** Where to send the user when this is hit during navigation. */
  readonly redirectTo?: string;

  constructor(
    category: FailureCategory,
    message: string,
    options: {
      code?: string;
      errors?: Record<string, string[]>;
      redirectTo?: string;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.category = category;
    this.status = STATUS[category];
    this.code = options.code ?? category.toUpperCase();
    this.errors = options.errors;
    this.redirectTo = options.redirectTo;
  }
}

export const AuthenticationError = (message = "Authentication required.") =>
  new AppError("authentication", message, { redirectTo: "/login" });

/**
 * Deliberately generic: never reveal which internal permission was missing
 * (04-rbac.md § Authorization Response).
 */
export const AuthorizationError = (
  message = "You do not have access to this resource.",
) => new AppError("authorization", message);

export const ValidationError = (
  message: string,
  errors?: Record<string, string[]>,
) => new AppError("validation", message, { errors });

export const BusinessRuleError = (message: string, code?: string) =>
  new AppError("business_rule", message, { code });

export const NotFoundError = (message = "Resource not found.") =>
  new AppError("not_found", message);

export const ConflictError = (message: string) =>
  new AppError("conflict", message);

export const LicenseError = (message: string, code?: string) =>
  new AppError("license", message, { code, redirectTo: "/license-required" });

export const LimitExceededError = (message: string) =>
  new AppError("limit_exceeded", message);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Normalises any thrown value into an AppError. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof Error) {
    return new AppError("system", e.message);
  }
  return new AppError("system", "An unexpected error occurred.");
}
