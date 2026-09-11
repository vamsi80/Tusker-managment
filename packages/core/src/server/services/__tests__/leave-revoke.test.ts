import { describe, expect, it } from "vitest";
import { daysToClearOnRevoke } from "../leave/leave.dates";

/** `@db.Date` columns are calendar days at midnight UTC. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const keys = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

describe("daysToClearOnRevoke", () => {
    it("clears every day of the range when nothing else covers it", () => {
        expect(keys(daysToClearOnRevoke(day("2026-09-14"), day("2026-09-16"), []))).toEqual([
            "2026-09-14",
            "2026-09-15",
            "2026-09-16",
        ]);
    });

    it("clears a single-day leave", () => {
        expect(keys(daysToClearOnRevoke(day("2026-09-14"), day("2026-09-14"), []))).toEqual([
            "2026-09-14",
        ]);
    });

    it("keeps days a second approved leave still covers", () => {
        const days = daysToClearOnRevoke(day("2026-09-14"), day("2026-09-16"), [
            { startDate: day("2026-09-15"), endDate: day("2026-09-15") },
        ]);
        expect(keys(days)).toEqual(["2026-09-14", "2026-09-16"]);
    });

    it("clears nothing when another approved leave covers the whole range", () => {
        const days = daysToClearOnRevoke(day("2026-09-14"), day("2026-09-16"), [
            { startDate: day("2026-09-01"), endDate: day("2026-09-30") },
        ]);
        expect(days).toEqual([]);
    });

    it("spans a month boundary without losing a day", () => {
        expect(keys(daysToClearOnRevoke(day("2026-09-29"), day("2026-10-02"), []))).toEqual([
            "2026-09-29",
            "2026-09-30",
            "2026-10-01",
            "2026-10-02",
        ]);
    });
});
