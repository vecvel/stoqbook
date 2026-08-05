import { toNumber } from "./money";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
};

export function currencySymbol(code = "INR"): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** Money for display. Storage always keeps 4 decimals; display uses 2. */
export function formatMoney(
  value: string | number | null | undefined,
  options: { currency?: string; decimals?: number; showSymbol?: boolean } = {},
): string {
  const { currency = "INR", decimals = 2, showSymbol = true } = options;
  const n = toNumber(value);
  const formatted = n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return showSymbol ? `${currencySymbol(currency)}${formatted}` : formatted;
}

/** Compact money for KPI tiles: ₹1.2L, ₹4.5Cr, $12.3K. */
export function formatMoneyCompact(
  value: string | number | null | undefined,
  currency = "INR",
): string {
  const n = toNumber(value);
  const sym = currencySymbol(currency);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  // Indian numbering for INR, short scale otherwise.
  if (currency === "INR") {
    if (abs >= 1_00_00_000) return `${sign}${sym}${(abs / 1_00_00_000).toFixed(2)}Cr`;
    if (abs >= 1_00_000) return `${sign}${sym}${(abs / 1_00_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  } else {
    if (abs >= 1_000_000_000) return `${sign}${sym}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${sym}${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}${sym}${abs.toFixed(2)}`;
}

/** Quantity display — trims trailing zeros so "5.0000" shows as "5". */
export function formatQuantity(
  value: string | number | null | undefined,
  options: { maxDecimals?: number; unit?: string | null } = {},
): string {
  const { maxDecimals = 3, unit } = options;
  const n = toNumber(value);
  const rounded = Number(n.toFixed(maxDecimals));
  const text = rounded.toLocaleString("en-IN", { maximumFractionDigits: maxDecimals });
  return unit ? `${text} ${unit}` : text;
}

export function formatPercent(
  value: string | number | null | undefined,
  decimals = 1,
): string {
  return `${toNumber(value).toFixed(decimals)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-IN");
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
}

export function formatTime(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** ISO date (yyyy-MM-dd) for date inputs. */
export function toDateInput(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatRelative(value: Date | string | null | undefined): string {
  const d = asDate(value);
  if (!d) return "—";

  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 30) return `${Math.round(days / 7)} wk ago`;

  return formatDate(d);
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** snake_case / kebab-case enum → "Title Case" for display. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function truncate(value: string, length = 60): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}
