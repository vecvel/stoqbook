/**
 * Query-string parsing shared by REST routes and list pages:
 * pagination, sorting, search, field selection and relationship expansion
 * (18-api-specification.md).
 */

export interface ListQuery {
  page: number;
  limit: number;
  offset: number;
  search: string | null;
  /** Ordered sort instructions; `-field` means descending. */
  sort: { field: string; direction: "asc" | "desc" }[];
  /** Sparse fieldset requested by the client. */
  fields: string[] | null;
  /** Relations to expand. */
  include: string[];
  /** Everything else, e.g. status=active&category=… */
  filters: Record<string, string>;
}

const RESERVED = new Set([
  "page",
  "limit",
  "search",
  "q",
  "sort",
  "fields",
  "include",
]);

const MAX_LIMIT = 200;

export function parseListQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  options: { defaultLimit?: number; defaultSort?: string } = {},
): ListQuery {
  const params =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          Object.entries(input).flatMap(([k, v]) =>
            v === undefined
              ? []
              : Array.isArray(v)
                ? v.map((x) => [k, x] as [string, string])
                : [[k, v] as [string, string]],
          ),
        );

  const page = Math.max(1, toInt(params.get("page"), 1));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, toInt(params.get("limit"), options.defaultLimit ?? 25)),
  );

  const sortRaw = params.get("sort") ?? options.defaultSort ?? "";
  const sort = sortRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s.startsWith("-")
        ? { field: s.slice(1), direction: "desc" as const }
        : { field: s, direction: "asc" as const },
    );

  const fieldsRaw = params.get("fields");
  const fields = fieldsRaw
    ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean)
    : null;

  const include = (params.get("include") ?? "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);

  const filters: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    if (RESERVED.has(key)) continue;
    if (value === "" || value === "all") continue;
    filters[key] = value;
  }

  const search = (params.get("search") ?? params.get("q") ?? "").trim() || null;

  return { page, limit, offset: (page - 1) * limit, search, sort, fields, include, filters };
}

function toInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Restricts a client-supplied sort to columns the route allows, protecting
 * against sorting on arbitrary or sensitive columns.
 */
export function safeSort<T extends string>(
  sort: ListQuery["sort"],
  allowed: readonly T[],
  fallback: { field: T; direction: "asc" | "desc" },
): { field: T; direction: "asc" | "desc" } {
  for (const s of sort) {
    if ((allowed as readonly string[]).includes(s.field)) {
      return { field: s.field as T, direction: s.direction };
    }
  }
  return fallback;
}

/** Applies a sparse fieldset to a row, always keeping `id`. */
export function pickFields<T extends Record<string, unknown>>(
  row: T,
  fields: string[] | null,
): Partial<T> {
  if (!fields || fields.length === 0) return row;
  const keep = new Set([...fields, "id"]);
  return Object.fromEntries(
    Object.entries(row).filter(([k]) => keep.has(k)),
  ) as Partial<T>;
}

/** Builds a `?a=b` string, dropping empty values — used for pagination links. */
export function buildQueryString(
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
