import { describe, it, expect, beforeEach, vi } from "vitest";

import prisma from "@/lib/db";
import { resolveShiftTimes, SHIFT_TIME_DEFAULTS } from "../resolve-shift-times";

const workspaceTimes = {
    lateThreshold: "21:30",
    halfDayThreshold: "23:00",
    shiftStartTime: "21:30",
    shiftEndTime: "07:00",
    overtimeThreshold: "07:00",
    casualLeaveAccrualDays: 20,
};

const factoryTimes = {
    lateThreshold: "08:30",
    halfDayThreshold: "11:00",
    shiftStartTime: "08:00",
    shiftEndTime: "17:00",
    overtimeThreshold: "17:00",
};

describe("resolveShiftTimes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses the department's shift schedule when it has one", async () => {
        (prisma.workspaceMember.findUnique as any).mockResolvedValue({
            department: { shiftSchedule: factoryTimes },
            workspace: workspaceTimes,
        });

        const times = await resolveShiftTimes("member-1");

        expect(times.lateThreshold).toBe("08:30");
        expect(times.overtimeThreshold).toBe("17:00");
        // Accrual is a workspace-level policy, never overridden by the shift.
        expect(times.casualLeaveAccrualDays).toBe(20);
    });

    it("falls back to the workspace when the department has no schedule", async () => {
        (prisma.workspaceMember.findUnique as any).mockResolvedValue({
            department: { shiftSchedule: null },
            workspace: workspaceTimes,
        });

        const times = await resolveShiftTimes("member-1");

        expect(times.lateThreshold).toBe("21:30");
        expect(times.halfDayThreshold).toBe("23:00");
    });

    it("falls back to the workspace when the member has no department", async () => {
        (prisma.workspaceMember.findUnique as any).mockResolvedValue({
            department: null,
            workspace: { ...workspaceTimes, lateThreshold: "22:15" },
        });

        const times = await resolveShiftTimes("member-1");

        expect(times.lateThreshold).toBe("22:15");
        expect(times.shiftStartTime).toBe("21:30");
    });

    it("uses the built-in defaults when there is nothing to read", async () => {
        (prisma.workspaceMember.findUnique as any).mockResolvedValue(null);

        const times = await resolveShiftTimes("missing-member");

        expect(times).toEqual(SHIFT_TIME_DEFAULTS);
    });
});
