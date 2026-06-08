export function getZonedDateOnly(date: Date, timeZone: string = "Asia/Kolkata"): Date {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

    const year = parseInt(getPart("year")!);
    const month = parseInt(getPart("month")!) - 1;
    const day = parseInt(getPart("day")!);

    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

export function getISTDateOnly(date: Date): Date {
    return getZonedDateOnly(date, "Asia/Kolkata");
}
