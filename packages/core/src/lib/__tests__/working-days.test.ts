import { describe, expect, it } from "vitest";
import { pointsPeriodStart, signedWorkingDays } from "../date-utils";

// October 2026: Thu 15, Fri 16, Sat 17, Sun 18, Mon 19.
/** An instant on the IST clock, e.g. ist("2026-10-16", "14:00"). */
const ist = (day: string, time = "00:00") => new Date(`${day}T${time}:00+05:30`);
/** How a dueDate is stored: IST midnight (parseIST). */
const due = (day: string) => ist(day);
/** Points for completing at `done` against `dueDay`: positive = early. */
const points = (done: Date, dueDay: string, holidays: string[] = []) =>
    signedWorkingDays(done, due(dueDay), new Set(holidays));

describe("signedWorkingDays", () => {
    it("due Fri, completed Thu: one working day early", () => {
        expect(points(ist("2026-10-15", "14:00"), "2026-10-16")).toBe(1);
    });

    it("due Mon, completed Sat: Sunday is skipped, still one day early", () => {
        expect(points(ist("2026-10-17", "11:00"), "2026-10-19")).toBe(1);
    });

    it("due Fri, completed Mon: two working days late (Sat + Mon)", () => {
        expect(points(ist("2026-10-19", "10:00"), "2026-10-16")).toBe(-2);
    });

    it("completed on the due day scores exactly 0, never -0", () => {
        expect(Object.is(points(ist("2026-10-16", "18:00"), "2026-10-16"), 0)).toBe(true);
    });

    it("a public holiday inside the span is not a working day", () => {
        expect(points(ist("2026-10-13", "12:00"), "2026-10-16")).toBe(3);
        expect(points(ist("2026-10-13", "12:00"), "2026-10-16", ["2026-10-15"])).toBe(2);
    });

    it("02:00 IST on the due day is the due day (20:30Z the previous UTC day)", () => {
        const done = ist("2026-10-16", "02:00");
        expect(done.toISOString()).toBe("2026-10-15T20:30:00.000Z");
        expect(points(done, "2026-10-16")).toBe(0);
    });

    it("23:59 IST on the due day is still on time", () => {
        expect(points(ist("2026-10-16", "23:59"), "2026-10-16")).toBe(0);
    });

    it("accepts @db.Date values (midnight UTC) as calendar days", () => {
        const fri = new Date(Date.UTC(2026, 9, 16));
        const mon = new Date(Date.UTC(2026, 9, 19));
        expect(signedWorkingDays(fri, mon)).toBe(2);
        expect(signedWorkingDays(mon, fri)).toBe(-2);
    });
});

describe("pointsPeriodStart", () => {
    const now = new Date("2026-10-16T12:00:00.000Z"); // Fri 16 Oct, 17:30 IST

    it("starts each period at IST midnight", () => {
        expect(pointsPeriodStart("MONTHLY", now)?.toISOString()).toBe("2026-09-30T18:30:00.000Z");
        expect(pointsPeriodStart("WEEKLY", now)?.toISOString()).toBe("2026-10-11T18:30:00.000Z"); // Mon 12 Oct
        expect(pointsPeriodStart("QUARTERLY", now)?.toISOString()).toBe("2026-09-30T18:30:00.000Z"); // 1 Oct
        expect(pointsPeriodStart("YEARLY", now)?.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    });

    it("NEVER means all time", () => {
        expect(pointsPeriodStart("NEVER", now)).toBeNull();
    });

    it("unknown values fall back to MONTHLY", () => {
        expect(pointsPeriodStart("bogus", now)).toEqual(pointsPeriodStart("MONTHLY", now));
    });

    it("follows the IST date, not UTC: 00:30 IST on 1 Nov is November", () => {
        const justAfterMidnight = new Date("2026-10-31T19:00:00.000Z");
        expect(pointsPeriodStart("MONTHLY", justAfterMidnight)?.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    });

    it("a Sunday belongs to the week that started the Monday before", () => {
        const sunday = ist("2026-10-18", "20:00");
        expect(pointsPeriodStart("WEEKLY", sunday)?.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    });
});
