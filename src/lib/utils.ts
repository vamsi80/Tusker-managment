import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parse } from "date-fns"
 
export const APP_DATE_FORMAT = "d MMM yyyy";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string or object as d MMM yyyy using UTC components.
 * This prevents 1-day shifts caused by local timezone offsets.
 */
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
