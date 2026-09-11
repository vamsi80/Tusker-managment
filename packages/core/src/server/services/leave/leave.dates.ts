import { addDateOnlyDays, toDateOnly } from "../../../lib/date-utils";

/**
 * The days a revoked leave should stop marking as ON_LEAVE: its own range,
 * minus any day another approved leave still covers. Nothing stops a member
 * holding two overlapping approved requests, and clearing a shared day would
 * mark someone present who is still away.
 *
 * All dates are `@db.Date` calendar days (midnight UTC), compared by timestamp.
 */
export function daysToClearOnRevoke(
    start: Date,
    end: Date,
    otherApproved: Array<{ startDate: Date; endDate: Date }>,
): Date[] {
    const stillOnLeave = new Set<number>();
    for (const other of otherApproved) {
        const from = toDateOnly(other.startDate)!;
        const to = toDateOnly(other.endDate)!;
        for (let d = from; d <= to; d = addDateOnlyDays(d, 1)) {
            stillOnLeave.add(d.getTime());
        }
    }

    const days: Date[] = [];
    for (let current = start; current <= end; current = addDateOnlyDays(current, 1)) {
        if (!stillOnLeave.has(current.getTime())) days.push(new Date(current.getTime()));
    }
    return days;
}
