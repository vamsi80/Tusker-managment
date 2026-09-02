import "server-only";

import prisma from "@/lib/db";

export interface ShiftTimes {
    lateThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    overtimeThreshold: string;
    casualLeaveAccrualDays: number;
}

/**
 * Last-resort values, used only when a member has no department schedule *and*
 * the workspace row is missing. Before departments existed these defaults were
 * spelled out three times with three different sets of values (21:30/23:00 at
 * check-in, 07:30/21:30 at check-out, 09:40/19:00 on an admin edit); this is now
 * the single copy, and it matches the schema defaults on Workspace.
 */
export const SHIFT_TIME_DEFAULTS: ShiftTimes = {
    lateThreshold: "21:30",
    halfDayThreshold: "23:00",
    shiftStartTime: "21:30",
    shiftEndTime: "07:00",
    overtimeThreshold: "07:00",
    casualLeaveAccrualDays: 20,
};

/**
 * The shift a member is actually held to.
 *
 * Departments do not carry times themselves — they point at a shared ShiftSchedule
 * ("Head Office", "Factory"), so every department on the same schedule moves
 * together. A member with no department, or a department with no schedule, falls
 * back to the workspace-wide settings, which is how everyone worked before
 * departments existed.
 */
export async function resolveShiftTimes(workspaceMemberId: string): Promise<ShiftTimes> {
    const member = await prisma.workspaceMember.findUnique({
        where: { id: workspaceMemberId },
        select: {
            department: {
                select: {
                    shiftSchedule: {
                        select: {
                            lateThreshold: true,
                            halfDayThreshold: true,
                            shiftStartTime: true,
                            shiftEndTime: true,
                            overtimeThreshold: true,
                        },
                    },
                },
            },
            workspace: {
                select: {
                    lateThreshold: true,
                    halfDayThreshold: true,
                    shiftStartTime: true,
                    shiftEndTime: true,
                    overtimeThreshold: true,
                    casualLeaveAccrualDays: true,
                },
            },
        },
    });

    const schedule = member?.department?.shiftSchedule;
    const workspace = member?.workspace;

    return {
        lateThreshold: schedule?.lateThreshold || workspace?.lateThreshold || SHIFT_TIME_DEFAULTS.lateThreshold,
        halfDayThreshold: schedule?.halfDayThreshold || workspace?.halfDayThreshold || SHIFT_TIME_DEFAULTS.halfDayThreshold,
        shiftStartTime: schedule?.shiftStartTime || workspace?.shiftStartTime || SHIFT_TIME_DEFAULTS.shiftStartTime,
        shiftEndTime: schedule?.shiftEndTime || workspace?.shiftEndTime || SHIFT_TIME_DEFAULTS.shiftEndTime,
        overtimeThreshold: schedule?.overtimeThreshold || workspace?.overtimeThreshold || SHIFT_TIME_DEFAULTS.overtimeThreshold,
        casualLeaveAccrualDays: workspace?.casualLeaveAccrualDays ?? SHIFT_TIME_DEFAULTS.casualLeaveAccrualDays,
    };
}
