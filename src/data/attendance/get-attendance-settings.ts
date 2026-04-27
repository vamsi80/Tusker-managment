import { cache } from "react";
import prisma from "@/lib/db";

export type AttendanceSettingsData = {
    lateThreshold: string;
    overtimeThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
};

const DEFAULT_SETTINGS: AttendanceSettingsData = {
    lateThreshold:    "21:30",
    overtimeThreshold: "07:00",
    halfDayThreshold: "23:00",
    shiftStartTime:   "21:30",
    shiftEndTime:     "07:00",
};

/**
 * Fetches attendance-specific thresholds for a workspace (Team Settings)
 */
export const getAttendanceSettings = cache(async (workspaceId: string): Promise<AttendanceSettingsData> => {
    try {
        // Use queryRawUnsafe to bypass Prisma Client's field stripping for fields it doesn't know about yet.
        const result = await prisma.$queryRawUnsafe<any[]>(
            `SELECT "lateThreshold", "overtimeThreshold", "halfDayThreshold", "shiftStartTime", "shiftEndTime"
             FROM "public"."Workspace"
             WHERE "id" = $1
             LIMIT 1`,
            workspaceId
        );

        const workspace = result[0];

        if (!workspace) return DEFAULT_SETTINGS;

        return {
            lateThreshold:     workspace.lateThreshold     || DEFAULT_SETTINGS.lateThreshold,
            overtimeThreshold: workspace.overtimeThreshold || DEFAULT_SETTINGS.overtimeThreshold,
            halfDayThreshold:  workspace.halfDayThreshold  || DEFAULT_SETTINGS.halfDayThreshold,
            shiftStartTime:    workspace.shiftStartTime    || DEFAULT_SETTINGS.shiftStartTime,
            shiftEndTime:      workspace.shiftEndTime      || DEFAULT_SETTINGS.shiftEndTime,
        };
    } catch (error) {
        console.error("Error fetching attendance settings:", error);
        return DEFAULT_SETTINGS;
    }
});
