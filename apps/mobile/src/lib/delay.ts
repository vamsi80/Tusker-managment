import { differenceInCalendarDays } from "date-fns";
import { toDate } from "./format";

/** @tusker/core/lib/colors/delay-colors.ts — deadline pill colour and wording. */
export function remainingDays(due?: string | Date | null) {
    const d = toDate(due);
    return d ? differenceInCalendarDays(d, new Date()) : null;
}

export function delayColor(days: number | null, status?: string | null): { color: string; ring: boolean } {
    if (status === "COMPLETED") return { color: "#10b981", ring: false };
    if (status === "CANCELLED" || status === "HOLD") return { color: "#94a3b8", ring: false };
    if (days === null) return { color: "#d1d5db", ring: false };
    if (days < 0) return { color: "#f43f5e", ring: false };
    if (days === 0) return { color: "#f43f5e", ring: false };
    if (days > 20) return { color: "#10b981", ring: true };
    if (days > 10) return { color: "#f97316", ring: false };
    return { color: "#f43f5e", ring: true };
}

export function delayText(days: number | null, status?: string | null) {
    if (status === "COMPLETED") return "Finished";
    if (status === "CANCELLED") return "Cancelled";
    if (status === "HOLD") return "On hold";
    if (days === null) return "No deadline";
    if (days > 0) return `${days}d left`;
    if (days === 0) return "Due today";
    return `${Math.abs(days)}d delayed`;
}
