import { describe, test, expect, vi } from "vitest";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("AttendanceService holiday and deactivation checks", () => {
    test("reconcileAttendance skips Sundays and workspace public holidays", async () => {
        vi.mock("@tusker/db", async (importOriginal) => {
            const actual = await importOriginal<any>();
            return {
                ...actual,
                default: {
                    public_holiday: {
                        findFirst: vi.fn(async ({ where }: any) => {
                            // Mock a holiday on 2026-08-15
                            if (where.date?.toISOString().startsWith("2026-08-15")) {
                                return { id: "h1", name: "Independence Day" };
                            }
                            return null;
                        }),
                    },
                    workspaceMember: {
                        findMany: vi.fn(async () => []),
                    },
                    attendance: {
                        findMany: vi.fn(async () => []),
                        createMany: vi.fn(),
                    },
                    leave_request: {
                        findMany: vi.fn(async () => []),
                    },
                },
            };
        });

        const { AttendanceService } = await import("../attendance.service");

        // Sunday: 2026-11-01 was a Sunday
        const sundayResult = await AttendanceService.reconcileAttendance("w1", day("2026-11-01"));
        expect(sundayResult).toEqual({ count: 0, reason: "SUNDAY" });

        // Public holiday: 2026-08-15
        const holidayResult = await AttendanceService.reconcileAttendance("w1", day("2026-08-15"));
        expect(holidayResult).toEqual({ count: 0, reason: "PUBLIC_HOLIDAY", holidayName: "Independence Day" });
    });
});

