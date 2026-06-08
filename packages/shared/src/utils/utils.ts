import { format, parse, formatDistanceToNow } from "date-fns";

export const APP_DATE_FORMAT = "d MMM yyyy";

export function toTitleCase(str: string | null | undefined): string {
    if (!str) return "";
    return str.toLowerCase().replace(/(?:^|\s)\S/g, (match) => match.toUpperCase());
}

export function formatRelativeTime(date: string | Date | null | undefined): string {
    if (!date) return "-";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";
    return formatDistanceToNow(d, { addSuffix: true });
}

export function parseIST(dateStr: string | null | undefined): Date | null {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    if (trimmed.includes("Z") || (trimmed.includes("+") && trimmed.includes("T"))) {
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    }

    try {
        const d = parse(trimmed, "d MMM yyyy", new Date());
        if (!isNaN(d.getTime())) {
            const year = d.getFullYear();
            const month = d.getMonth();
            const day = d.getDate();
            return new Date(
                `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+05:30`
            );
        }
    } catch {}

    try {
        const d = parse(trimmed, "yyyy-MM-dd", new Date());
        if (!isNaN(d.getTime())) {
            return new Date(`${trimmed}T00:00:00+05:30`);
        }
    } catch {}

    const finalD = new Date(trimmed);
    return isNaN(finalD.getTime()) ? null : finalD;
}

export function formatIST(
    date: string | Date | null | undefined,
    formatStr: string = APP_DATE_FORMAT
): string {
    if (!date) return "-";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

    const year = parseInt(getPart("year")!);
    const month = parseInt(getPart("month")!) - 1;
    const day = parseInt(getPart("day")!);
    const hour = parseInt(getPart("hour")!);
    const minute = parseInt(getPart("minute")!);
    const second = parseInt(getPart("second")!);

    return format(new Date(year, month, day, hour, minute, second), formatStr);
}

export function formatDateUTC(
    date: string | Date | null | undefined,
    includeTime: boolean = true
): string {
    if (!date) return "-";
    const d = new Date(date);
    if (isNaN(d.getTime())) return "-";

    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

    const hours = getPart("hour");
    const minutes = getPart("minute");
    const dateStr = format(d, APP_DATE_FORMAT);
    return includeTime ? `${dateStr} ${hours}:${minutes}` : dateStr;
}
