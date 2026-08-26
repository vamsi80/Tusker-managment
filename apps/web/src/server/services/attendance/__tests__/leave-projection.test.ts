import { describe, test, expect } from "vitest";

import { AttendanceStatus } from "@tusker/db";
import { getVisibleThrough } from "../attendance.service";

// 2026-08-14 12:00 UTC → the IST day is still 2026-08-14
const NOW = new Date("2026-08-14T12:00:00.000Z");
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const endOfDay = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

describe("getVisibleThrough", () => {
    test("default month view stops at today, so future leave days stay hidden", () => {
        const end = getVisibleThrough(day("2026-08-01"), endOfDay("2026-08-31"), [], NOW);
        expect(end).toBe(day("2026-08-14").getTime());
    });

    test("no range at all still stops at today", () => {
        expect(getVisibleThrough(undefined, undefined, [], NOW)).toBe(day("2026-08-14").getTime());
    });

    test("filtering by ON_LEAVE shows the whole requested range", () => {
        const end = getVisibleThrough(
            day("2026-08-01"),
            endOfDay("2026-08-31"),
            [AttendanceStatus.ON_LEAVE],
            NOW
        );
        expect(end).toBe(day("2026-08-31").getTime());
    });

    test("filtering by ON_LEAVE with no range is left unbounded", () => {
        expect(getVisibleThrough(undefined, undefined, [AttendanceStatus.ON_LEAVE], NOW)).toBe(Infinity);
    });

    test("a range that starts in the future is honoured as-is", () => {
        const end = getVisibleThrough(day("2026-09-01"), endOfDay("2026-09-30"), [], NOW);
        expect(end).toBe(day("2026-09-30").getTime());
    });

    test("a past range is never widened past its own end", () => {
        const end = getVisibleThrough(day("2026-07-01"), endOfDay("2026-07-31"), [], NOW);
        expect(end).toBe(day("2026-07-31").getTime());
    });

    test("a range ending today keeps today", () => {
        const end = getVisibleThrough(day("2026-08-01"), endOfDay("2026-08-14"), [], NOW);
        expect(end).toBe(day("2026-08-14").getTime());
    });
});
