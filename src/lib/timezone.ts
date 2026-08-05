/**
 * Timezone helpers.
 *
 * Business days belong to the tenant's timezone, not the server's and not UTC.
 * Mixing the two silently shifts "today" by a day for a business east or west of
 * the server, so every day boundary and day bucket goes through these helpers.
 */

/** Offset of `timeZone` from UTC at a given instant, in milliseconds. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Intl renders midnight as "24" in some locales; normalise it.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtc - date.getTime();
}

/** Calendar date in `timeZone` as `YYYY-MM-DD`. */
export function tzDateKey(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key format we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The UTC instant at which the given day starts in `timeZone`. */
export function startOfDayInTz(date: Date, timeZone: string): Date {
  const key = tzDateKey(date, timeZone);
  // Treat the key as UTC midnight, then shift by the zone's offset at that
  // moment to land on the real local midnight.
  const utcMidnight = new Date(`${key}T00:00:00.000Z`);
  return new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight, timeZone));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Start of the week (Sunday) containing `date`, in `timeZone`. */
export function startOfWeekInTz(date: Date, timeZone: string): Date {
  const dayStart = startOfDayInTz(date, timeZone);
  // Derive the weekday from the tenant-local calendar date, not the UTC one.
  const key = tzDateKey(date, timeZone);
  const weekday = new Date(`${key}T12:00:00.000Z`).getUTCDay();
  return startOfDayInTz(addDays(dayStart, -weekday), timeZone);
}

export function startOfMonthInTz(date: Date, timeZone: string): Date {
  const key = tzDateKey(date, timeZone);
  const [year, month] = key.split("-");
  return startOfDayInTz(
    new Date(`${year}-${month}-01T12:00:00.000Z`),
    timeZone,
  );
}

export function startOfQuarterInTz(date: Date, timeZone: string): Date {
  const key = tzDateKey(date, timeZone);
  const [year, month] = key.split("-").map(Number);
  const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return startOfDayInTz(
    new Date(
      `${year}-${String(quarterMonth).padStart(2, "0")}-01T12:00:00.000Z`,
    ),
    timeZone,
  );
}

export function startOfYearInTz(date: Date, timeZone: string): Date {
  const year = tzDateKey(date, timeZone).slice(0, 4);
  return startOfDayInTz(new Date(`${year}-01-01T12:00:00.000Z`), timeZone);
}

/** The last `count` calendar day keys in `timeZone`, oldest first. */
export function recentDayKeys(count: number, timeZone: string): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(tzDateKey(addDays(now, -i), timeZone));
  }
  return keys;
}

/** Short axis label for a `YYYY-MM-DD` key, e.g. "31/7". */
export function shortDayLabel(key: string): string {
  const [, month, day] = key.split("-");
  return `${Number(day)}/${Number(month)}`;
}

/** Validates a timezone, falling back to UTC so a bad value cannot throw. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}
