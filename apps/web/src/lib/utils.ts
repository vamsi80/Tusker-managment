import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from "date-fns"
import { APP_DATE_FORMAT, parseIST } from "@tusker/core/lib/date-utils"

// Re-exported so the many UI call sites can keep importing them from here.
export { APP_DATE_FORMAT, parseIST }
 

/**
 * Formats a date as a relative time string (e.g., "5 mins ago", "2 days ago")
 */
export function formatRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return formatDistanceToNow(d, { addSuffix: true });
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Converts a string to Title Case (first letter of each word capitalised, rest lowercase).
 * Example: "RCC SLAB WORK" → "Rcc Slab Work", "concrete mix" → "Concrete Mix"
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (match) => match.toUpperCase());
}

/**
 * Formats a date string or object as d MMM yyyy using UTC components.
 * This prevents 1-day shifts caused by local timezone offsets.
 */

/**
 * Formats a date string or object as d MMM yyyy HH:mm in IST.
 */
export function formatDateUTC(date: string | Date | null | undefined, includeTime: boolean = true): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";

  // Using Intl.DateTimeFormat to reliably get IST components regardless of local environment
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;

  const day = getPart('day');
  const month = getPart('month');
  const year = getPart('year');
  const hours = getPart('hour');
  const minutes = getPart('minute');

  const dateStr = format(d, APP_DATE_FORMAT);
  return includeTime ? `${dateStr} ${hours}:${minutes}` : dateStr;
}

/**
 * Formats a date in Indian Standard Time (IST)
 */
export function formatIST(date: string | Date | null | undefined, formatStr: string = APP_DATE_FORMAT): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";

  // Using Intl.DateTimeFormat to reliably extract IST components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;

  const year = parseInt(getPart('year')!);
  const month = parseInt(getPart('month')!) - 1;
  const day = parseInt(getPart('day')!);
  const hour = parseInt(getPart('hour')!);
  const minute = parseInt(getPart('minute')!);
  const second = parseInt(getPart('second')!);

  const pseudoISTDate = new Date(year, month, day, hour, minute, second);

  return format(pseudoISTDate, formatStr);
}
