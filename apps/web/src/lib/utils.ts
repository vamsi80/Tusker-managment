import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Pure utilities re-exported from shared so existing @/lib/utils imports keep working
export { APP_DATE_FORMAT, toTitleCase, formatRelativeTime, parseIST, formatIST, formatDateUTC } from "@tusker/shared/utils";
