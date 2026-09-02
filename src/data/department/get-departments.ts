import { cache } from "react";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import prisma from "@/lib/db";

export type DepartmentWithSchedule = {
    id: string;
    name: string;
    shiftScheduleId: string | null;
    shiftSchedule: { id: string; name: string } | null;
    _count: { members: number };
};

export type ShiftScheduleData = {
    id: string;
    name: string;
    lateThreshold: string;
    halfDayThreshold: string;
    shiftStartTime: string;
    shiftEndTime: string;
    overtimeThreshold: string;
    _count: { departments: number };
};

/**
 * Departments with their shift schedule and member count.
 */
export const getWorkspaceDepartments = cache(async (workspaceId: string) => {
    return unstable_cache(
        async () => {
            try {
                return await prisma.department.findMany({
                    where: { workspaceId },
                    select: {
                        id: true,
                        name: true,
                        shiftScheduleId: true,
                        shiftSchedule: { select: { id: true, name: true } },
                        _count: { select: { members: true } },
                    },
                    orderBy: { name: "asc" },
                });
            } catch (error) {
                console.error("Error fetching workspace departments:", error);
                throw new Error("Failed to fetch workspace departments");
            }
        },
        [`workspace-departments-${workspaceId}`],
        {
            tags: CacheTags.workspaceDepartments(workspaceId),
            revalidate: 60 * 60 * 24, // 24 hours
        }
    )();
});

/**
 * The shift schedules a department can point at ("Head Office", "Factory", ...).
 */
export const getWorkspaceShiftSchedules = cache(async (workspaceId: string) => {
    return unstable_cache(
        async () => {
            try {
                return await prisma.shiftSchedule.findMany({
                    where: { workspaceId },
                    select: {
                        id: true,
                        name: true,
                        lateThreshold: true,
                        halfDayThreshold: true,
                        shiftStartTime: true,
                        shiftEndTime: true,
                        overtimeThreshold: true,
                        _count: { select: { departments: true } },
                    },
                    orderBy: { createdAt: "asc" },
                });
            } catch (error) {
                console.error("Error fetching workspace shift schedules:", error);
                throw new Error("Failed to fetch workspace shift schedules");
            }
        },
        [`workspace-shift-schedules-${workspaceId}`],
        {
            tags: CacheTags.workspaceDepartments(workspaceId),
            revalidate: 60 * 60 * 24, // 24 hours
        }
    )();
});
