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
    attendanceLocations: AttendanceLocation[];
};

export type AttendanceLocation = {
    id: string;
    name: string;
    address: string | null;
    latitude: number;
    longitude: number;
    radius: number;
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
    attendanceLocations: [],
};

/**
 * Fetches attendance-specific thresholds for a workspace (Team Settings)
 */
export const getAttendanceSettings = async (workspaceId: string): Promise<AttendanceSettingsData> => {
    try {
        const [workspaceResult, holidays, locations] = await Promise.all([
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
            }),
            prisma.attendanceLocation.findMany({
                where: { workspaceId },
                orderBy: { createdAt: "desc" },
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
            attendanceLocations: locations || [],
        };
    } catch (error) {
        console.error("Error fetching attendance settings:", error);
        return DEFAULT_SETTINGS;
    }
};
