/**
 * Calendar-day helpers mirroring packages/core/src/lib/date-utils.ts
 * (calendarDayKey, addDateOnlyDays). Kept in sync manually since mobile
 * cannot import @tusker/core (server-oriented, depends on Prisma/AWS SDK).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateOnlyString(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * "yyyy-MM-dd" bucket key for anything shown on a calendar grid.
 *  - `@db.Date` values (leaves, holidays — midnight UTC) keep their UTC day.
 *  - real instants (meeting start times, local Date cells) use local parts.
 */
export function calendarDayKey(value: string | Date): string {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    if (d.getTime() % MS_PER_DAY === 0) {
        return `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-${`${d.getUTCDate()}`.padStart(2, "0")}`;
    }
    return toDateOnlyString(d);
}

/** Adds whole calendar days to a date-only value, immune to local timezone. */
export function addDateOnlyDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * MS_PER_DAY);
}
