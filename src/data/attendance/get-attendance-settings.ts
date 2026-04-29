import { cache } from "react";
import prisma from "@/lib/db";

export type PublicHoliday = {
    id: string;
    name: string;
    date: Date;
};

export type AttendanceSettingsData = {
    lateThreshold: string;
    overtimeThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    sickLeaveLimit: number;
    casualLeaveAccrualDays: number;
    publicHolidays: PublicHoliday[];
};

const DEFAULT_SETTINGS: AttendanceSettingsData = {
    lateThreshold:    "21:30",
    overtimeThreshold: "07:00",
    halfDayThreshold: "23:00",
    shiftStartTime:   "21:30",
    shiftEndTime:     "07:00",
    sickLeaveLimit:   12,
    casualLeaveAccrualDays: 20,
    publicHolidays:   [],
};

/**
 * Fetches attendance-specific thresholds for a workspace (Team Settings)
 */
export const getAttendanceSettings = cache(async (workspaceId: string): Promise<AttendanceSettingsData> => {
    try {
        const [workspaceResult, holidays] = await Promise.all([
            prisma.$queryRawUnsafe<any[]>(
                `SELECT "lateThreshold", "overtimeThreshold", "halfDayThreshold", "shiftStartTime", "shiftEndTime", "sickLeaveLimit", "casualLeaveAccrualDays"
                 FROM "public"."Workspace"
                 WHERE "id" = $1
                 LIMIT 1`,
                workspaceId
            ),
            prisma.public_holiday.findMany({
                where: { workspaceId },
                orderBy: { date: "asc" },
            })
        ]);

        const workspace = workspaceResult[0];

        if (!workspace) return DEFAULT_SETTINGS;

        return {
            lateThreshold:     workspace.lateThreshold     || DEFAULT_SETTINGS.lateThreshold,
            overtimeThreshold: workspace.overtimeThreshold || DEFAULT_SETTINGS.overtimeThreshold,
            halfDayThreshold:  workspace.halfDayThreshold  || DEFAULT_SETTINGS.halfDayThreshold,
            shiftStartTime:    workspace.shiftStartTime    || DEFAULT_SETTINGS.shiftStartTime,
            shiftEndTime:      workspace.shiftEndTime      || DEFAULT_SETTINGS.shiftEndTime,
            sickLeaveLimit:    workspace.sickLeaveLimit    ?? DEFAULT_SETTINGS.sickLeaveLimit,
            casualLeaveAccrualDays: workspace.casualLeaveAccrualDays ?? DEFAULT_SETTINGS.casualLeaveAccrualDays,
            publicHolidays:    holidays,
        };
    } catch (error) {
        console.error("Error fetching attendance settings:", error);
        return DEFAULT_SETTINGS;
    }
});
