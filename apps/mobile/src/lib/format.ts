import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, differenceInCalendarDays } from "date-fns";

type DateInput = string | number | Date | null | undefined;

export const toDate = (value: DateInput): Date | null => {
    if (value === null || value === undefined || value === "") return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtDate = (value: DateInput, pattern = "dd MMM yyyy", fallback = "—") => {
    const d = toDate(value);
    return d ? format(d, pattern) : fallback;
};

export const fmtShortDate = (value: DateInput, fallback = "—") => fmtDate(value, "dd MMM", fallback);
export const fmtTime = (value: DateInput, fallback = "—") => fmtDate(value, "h:mm a", fallback);
export const fmtDateTime = (value: DateInput, fallback = "—") => fmtDate(value, "dd MMM yyyy, h:mm a", fallback);

/** "Today", "Tomorrow", "Yesterday" or "12 Mar". */
export const fmtRelativeDay = (value: DateInput, fallback = "No date") => {
    const d = toDate(value);
    if (!d) return fallback;
    if (isToday(d)) return "Today";
    if (isTomorrow(d)) return "Tomorrow";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "dd MMM");
};

export const timeAgo = (value: DateInput) => {
    const d = toDate(value);
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    if (diff < 45_000) return "just now";
    return `${formatDistanceToNowStrict(d)} ago`;
};

export const isOverdue = (due: DateInput, status?: string | null) => {
    const d = toDate(due);
    if (!d || status === "COMPLETED" || status === "CANCELLED") return false;
    return differenceInCalendarDays(d, new Date()) < 0;
};

/** yyyy-MM-dd in local time — the day the API's @db.Date columns expect. */
export const toDateOnlyString = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// ─── Money (all procurement amounts are paise) ──────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** indent-detail-client formatRate: paise → "₹1,23,456.00", or "—". */
export const formatRate = (paise?: number | null) => (paise == null ? "—" : inr.format(Number(paise) / 100));

export const formatPaise = (paise: number) =>
    `${paise < 0 ? "-" : ""}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const toPaise = (rupees: string | number | null | undefined) => {
    const n = Number(rupees);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

export const paiseToRupeeString = (paise?: number | null) => (paise ? (paise / 100).toString() : "");

// ─── People ─────────────────────────────────────────────────────────────────

/**
 * lib/user-display-name.ts: the nickname (surname column) leads everywhere,
 * the legal name is the fallback.
 */
export const displayName = (user?: { name?: string | null; surname?: string | null; email?: string | null } | null, fallback = "Member") =>
    user?.surname?.trim() || user?.name?.trim() || user?.email?.trim().split("@")[0] || fallback;

export const initials = (name?: string | null) => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const vendorDisplayName = (vendor?: { name?: string | null; companyName?: string | null } | null, fallback = "-") =>
    vendor?.name?.trim() || vendor?.companyName?.trim() || fallback;

export const pluralize = (count: number, word: string, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
