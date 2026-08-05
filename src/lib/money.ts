/**
 * Exact decimal arithmetic for money and quantities.
 *
 * Postgres numeric values arrive as strings. Converting to `number` for
 * arithmetic reintroduces float error, so all maths happens on scaled BigInt
 * and results are serialised back to fixed-scale strings.
 */

const SCALE = 4;
const FACTOR = 10n ** BigInt(SCALE);

export type Decimal = string;

/** Parses a numeric string / number into scaled BigInt units. */
export function toUnits(value: Decimal | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;

  const s = typeof value === "number" ? value.toFixed(SCALE) : value.trim();
  const negative = s.startsWith("-");
  const body = negative ? s.slice(1) : s;

  const [whole = "0", frac = ""] = body.split(".");
  const fracPadded = (frac + "0".repeat(SCALE)).slice(0, SCALE);

  const digits = `${whole || "0"}${fracPadded}`.replace(/\D/g, "") || "0";
  const units = BigInt(digits);
  return negative ? -units : units;
}

/** Serialises scaled BigInt units back to a fixed-scale decimal string. */
export function fromUnits(units: bigint): Decimal {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Normalises any input to the canonical storage representation. */
export function dec(value: Decimal | number | null | undefined): Decimal {
  return fromUnits(toUnits(value));
}

export function add(...values: (Decimal | number)[]): Decimal {
  return fromUnits(values.reduce((acc, v) => acc + toUnits(v), 0n));
}

export function sub(a: Decimal | number, b: Decimal | number): Decimal {
  return fromUnits(toUnits(a) - toUnits(b));
}

export function mul(a: Decimal | number, b: Decimal | number): Decimal {
  // Two scaled operands produce a doubly-scaled product; divide once to restore.
  return fromUnits((toUnits(a) * toUnits(b)) / FACTOR);
}

export function div(a: Decimal | number, b: Decimal | number): Decimal {
  const divisor = toUnits(b);
  if (divisor === 0n) return "0.0000";
  return fromUnits((toUnits(a) * FACTOR) / divisor);
}

/** Percentage of a value: pct(200, 18) → 36.0000 */
export function pct(value: Decimal | number, percent: Decimal | number): Decimal {
  return div(mul(value, percent), 100);
}

export function negate(value: Decimal | number): Decimal {
  return fromUnits(-toUnits(value));
}

export function abs(value: Decimal | number): Decimal {
  const u = toUnits(value);
  return fromUnits(u < 0n ? -u : u);
}

export function cmp(a: Decimal | number, b: Decimal | number): -1 | 0 | 1 {
  const ua = toUnits(a);
  const ub = toUnits(b);
  return ua < ub ? -1 : ua > ub ? 1 : 0;
}

export const gt = (a: Decimal | number, b: Decimal | number) => cmp(a, b) === 1;
export const gte = (a: Decimal | number, b: Decimal | number) => cmp(a, b) >= 0;
export const lt = (a: Decimal | number, b: Decimal | number) => cmp(a, b) === -1;
export const lte = (a: Decimal | number, b: Decimal | number) => cmp(a, b) <= 0;
export const eq = (a: Decimal | number, b: Decimal | number) => cmp(a, b) === 0;
export const isZero = (v: Decimal | number) => toUnits(v) === 0n;
export const isNegative = (v: Decimal | number) => toUnits(v) < 0n;
export const isPositive = (v: Decimal | number) => toUnits(v) > 0n;

/** Rounds to `places` decimals, half away from zero. */
export function round(value: Decimal | number, places = 2): Decimal {
  if (places >= SCALE) return dec(value);
  const units = toUnits(value);
  const step = 10n ** BigInt(SCALE - places);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const rounded = ((abs + step / 2n) / step) * step;
  return fromUnits(negative ? -rounded : rounded);
}

/** Rounds to the nearest whole currency unit — used for invoice round-off. */
export function roundToWhole(value: Decimal | number): Decimal {
  return round(value, 0);
}

/** Plain JS number, for charts and aggregate display only. */
export function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function sum<T>(
  rows: T[],
  pick: (row: T) => Decimal | number | null | undefined,
): Decimal {
  return fromUnits(rows.reduce((acc, r) => acc + toUnits(pick(r)), 0n));
}

/**
 * Splits a total across `count` parts without losing or inventing units.
 * Used to apportion invoice-level discounts and freight across line items.
 */
export function apportion(total: Decimal | number, weights: (Decimal | number)[]): Decimal[] {
  const totalUnits = toUnits(total);
  const weightUnits = weights.map(toUnits);
  const weightSum = weightUnits.reduce((a, b) => a + b, 0n);

  if (weightSum === 0n) return weights.map(() => "0.0000");

  const parts = weightUnits.map((w) => (totalUnits * w) / weightSum);
  // Give any rounding remainder to the largest weight so the sum stays exact.
  const allocated = parts.reduce((a, b) => a + b, 0n);
  const remainder = totalUnits - allocated;
  if (remainder !== 0n) {
    let maxIndex = 0;
    for (let i = 1; i < weightUnits.length; i++) {
      if (weightUnits[i] > weightUnits[maxIndex]) maxIndex = i;
    }
    parts[maxIndex] += remainder;
  }

  return parts.map(fromUnits);
}
