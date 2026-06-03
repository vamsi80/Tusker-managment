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
