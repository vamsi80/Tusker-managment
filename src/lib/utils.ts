import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a date string or object as DD/MM/YYYY using UTC components.
 * This prevents 1-day shifts caused by local timezone offsets.
 */
export function formatDateUTC(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Formats a date in Indian Standard Time (IST)
 */
export function formatIST(date: string | Date | null | undefined, formatStr: string = "PPP"): string {
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
