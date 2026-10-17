import { format, parse } from "date-fns";

/** Canonical display format for dates across the app. */
export const APP_DATE_FORMAT = "d MMM yyyy";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns a Date object representing the start of the day (00:00:00)
 * in a specific timezone, normalized to a UTC Date object.
 * This is essential for consistent database 'DATE' column queries.
 */
export function getZonedDateOnly(date: Date, timeZone: string = "Asia/Kolkata") {
    // Using Intl.DateTimeFormat to reliably extract components for the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const year = parseInt(getPart('year')!);
    const month = parseInt(getPart('month')!) - 1; // Intl months are 1-indexed, JS Dates are 0-indexed
    const day = parseInt(getPart('day')!);

    // Return a date object at midnight UTC for those components
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Legacy wrapper for Indian Standard Time (IST)
 */
export function getISTDateOnly(date: Date) {
    return getZonedDateOnly(date, "Asia/Kolkata");
}

/* ------------------------------------------------------------------------- *
 * Calendar-day ("date-only") helpers
 *
 * Columns declared `@db.Date` (leave_request.startDate/endDate, attendance.date,
 * public_holiday.date) hold a calendar day, not an instant. Prisma reads them
 * back as midnight UTC, and truncates writes on the *UTC* day. Sending a
 * browser-local midnight through toISOString() therefore lands on the previous
 * day for anyone east of UTC — a leave picked for the 31st was stored as the
 * 30th. The helpers below keep calendar days as calendar days end to end.
 * ------------------------------------------------------------------------- */

/**
 * Builds the canonical in-memory form of a `@db.Date` value: midnight UTC.
 * `month` is 1-indexed to match how humans (and "yyyy-MM-dd") write dates.
 */
export function dateOnlyFromParts(year: number, month: number, day: number) {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Serialises a day the user picked in a calendar as "yyyy-MM-dd", reading its
 * *local* parts — the day they actually clicked, not the UTC instant it maps to.
 * Use this instead of toISOString() whenever the value is a calendar day.
 */
export function toDateOnlyString(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Normalises anything that represents a calendar day into midnight UTC:
 *  - "yyyy-MM-dd"       → that exact day, with no timezone arithmetic
 *  - a `@db.Date` value → returned unchanged (it is already midnight UTC)
 *  - a full ISO instant → the IST calendar day that instant falls on, which
 *                         recovers the intended day from older clients that
 *                         still send toISOString()
 * Returns null when the input is missing or unparseable.
 */
export function toDateOnly(value: string | Date | null | undefined): Date | null {
    if (!value) return null;

    if (typeof value === "string" && DATE_ONLY_PATTERN.test(value.trim())) {
        const [year, month, day] = value.trim().split("-").map(Number);
        const parsed = dateOnlyFromParts(year, month, day);
        return isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (isNaN(parsed.getTime())) return null;

    // Already midnight UTC: it is a date-only value, keep it verbatim.
    if (parsed.getTime() % MS_PER_DAY === 0) return parsed;

    // A real instant — resolve it to the IST day it belongs to.
    return getISTDateOnly(parsed);
}

/**
 * Floors a value that already sits on the UTC day grid to the start of its day.
 * Use for UTC day-boundary filters (a range end of 23:59:59.999Z belongs to that
 * same day) — unlike toDateOnly, it never reinterprets the value through IST.
 */
export function floorToUTCDay(date: Date) {
    return new Date(Math.floor(date.getTime() / MS_PER_DAY) * MS_PER_DAY);
}

/**
 * Adds whole calendar days to a date-only value. Works purely in UTC, so it is
 * immune to the server's local timezone (unlike Date#setDate/#getDate).
 */
export function addDateOnlyDays(date: Date, days: number) {
    return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * Inclusive number of calendar days covered by a date-only range.
 * A single-day leave (start === end) counts as 1.
 */
export function countDateOnlyDays(start: Date, end: Date) {
    return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

/**
 * Formats a date-only value from its UTC parts, so it renders as the same
 * calendar day for every viewer regardless of their timezone.
 */
export function formatDateOnly(
    value: string | Date | null | undefined,
    formatStr: string = APP_DATE_FORMAT
): string {
    const d = toDateOnly(value);
    if (!d) return "-";
    return format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), formatStr);
}

/**
 * Parses a date string as Indian Standard Time (IST)
 * Supports multiple formats: d MMM yyyy (priority), YYYY-MM-DD, and ISO strings
 */
export function parseIST(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. Try native Date parsing for ISO strings
  if (trimmed.includes('Z') || (trimmed.includes('+') && trimmed.includes('T'))) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. Try "d MMM yyyy" (e.g., 15 Apr 2026)
  try {
    const d = parse(trimmed, 'd MMM yyyy', new Date());
    if (!isNaN(d.getTime())) {
      // Set to 05:30 offset (IST)
      const year = d.getFullYear();
      const month = d.getMonth();
      const day = d.getDate();
      return new Date(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+05:30`);
    }
  } catch (e) {}

  // 3. Try "yyyy-MM-dd"
  try {
    const d = parse(trimmed, 'yyyy-MM-dd', new Date());
    if (!isNaN(d.getTime())) {
      return new Date(`${trimmed}T00:00:00+05:30`);
    }
  } catch (e) {}

  // 4. Final attempt with native Date
  const finalD = new Date(trimmed);
  return isNaN(finalD.getTime()) ? null : finalD;
}

/**
 * "yyyy-MM-dd" bucket key for anything shown on a calendar grid.
 *  - `@db.Date` values (leaves, holidays — midnight UTC) keep their UTC day, so a
 *    leave taken today never lands on tomorrow's cell for viewers east of UTC.
 *  - real instants (meeting start times, the grid's own local Date cells) use
 *    their local parts, which is the day the user sees on the clock.
 */
export function calendarDayKey(value: string | Date): string {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    if (d.getTime() % MS_PER_DAY === 0) {
        return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;
    }
    return toDateOnlyString(d);
}

/* ------------------------------------------------------------------------- *
 * Working days (reward points)
 * ------------------------------------------------------------------------- */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Anything but a Sunday or a workspace public holiday. `day` is a calendar day
 * at midnight UTC (toDateOnly / getISTDateOnly), holidays are "yyyy-MM-dd" keys.
 */
export function isWorkingDay(day: Date, holidayKeys: ReadonlySet<string> = new Set()): boolean {
    return day.getUTCDay() !== 0 && !holidayKeys.has(calendarDayKey(day));
}

/**
 * Signed working days between two IST calendar days. Positive = `to` is later.
 * A working day is anything but a Sunday or a workspace public holiday —
 * Saturday counts, matching attendance, where Sunday is the only weekly off.
 *
 * Half-open on the earlier end, so the same day is 0 and the next working day
 * is 1: due Fri / done Thu = +1, due Mon / done Sat = +1 (Sunday skipped),
 * due Fri / done Mon = −2.
 *
 * Either argument may be a `@db.Date` value or a real instant; both go through
 * toDateOnly, which reads an instant on the IST clock. That matters: dueDate is
 * stored as IST midnight (18:30Z the day before), and a task completed at 02:00
 * IST is 20:30Z on the previous UTC day.
 *
 * Holidays are passed in as "yyyy-MM-dd" keys, never queried here, so a bulk
 * caller loads them once.
 */
export function signedWorkingDays(from: Date, to: Date, holidayKeys: ReadonlySet<string> = new Set()): number {
    const a = toDateOnly(from);
    const b = toDateOnly(to);
    if (!a || !b || a.getTime() === b.getTime()) return 0;

    const [start, end, sign] = a < b ? [a, b, 1] : [b, a, -1];
    let count = 0;
    for (let d = addDateOnlyDays(start, 1); d <= end; d = addDateOnlyDays(d, 1)) {
        if (isWorkingDay(d, holidayKeys)) count++;
    }
    return sign * count;
}

export const POINTS_RESET_PERIODS = ["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "NEVER"] as const;
export type PointsResetPeriod = (typeof POINTS_RESET_PERIODS)[number];

/**
 * The instant the current points period began on the IST calendar — Monday,
 * the 1st of the month, the quarter (Jan/Apr/Jul/Oct) or the year — or null
 * for NEVER (all time). Unknown values fall back to MONTHLY.
 */
export function pointsPeriodStart(period: string | null | undefined, now: Date = new Date()): Date | null {
    if (period === "NEVER") return null;

    const today = getISTDateOnly(now);
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    let start: Date;
    if (period === "WEEKLY") {
        start = addDateOnlyDays(today, -((today.getUTCDay() + 6) % 7));
    } else if (period === "QUARTERLY") {
        start = dateOnlyFromParts(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
    } else if (period === "YEARLY") {
        start = dateOnlyFromParts(year, 1, 1);
    } else {
        start = dateOnlyFromParts(year, month, 1);
    }
    // IST midnight of that day, as an instant.
    return new Date(start.getTime() - IST_OFFSET_MS);
}
