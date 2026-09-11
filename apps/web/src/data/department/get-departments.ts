import { cache } from "react";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@tusker/core/data/cache-tags";
import prisma from "@tusker/db";

export type DepartmentMember = {
    id: string;
    designation: string | null;
    workspaceRole: string;
    user: {
        id: string;
        name: string;
        surname: string | null;
        email: string;
        image: string | null;
    };
};

export type DepartmentWithSchedule = {
    id: string;
    name: string;
    shiftScheduleId: string | null;
    shiftSchedule: { id: string; name: string } | null;
    _count: { members: number };
    members: DepartmentMember[];
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
                const departments = await prisma.department.findMany({
                    where: { workspaceId },
                    select: {
                        id: true,
                        name: true,
                        shiftScheduleId: true,
                        shiftSchedule: { select: { id: true, name: true } },
                        _count: { select: { members: true } },
                        members: {
                            select: {
                                id: true,
                                designation: true,
                                workspaceRole: true,
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        email: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { name: "asc" },
                });

                return departments.map((dept) => ({
                    ...dept,
                    members: (dept.members || []).sort((a, b) => {
                        const nameA = [a.user.name, a.user.surname].filter(Boolean).join(" ").toLowerCase();
                        const nameB = [b.user.name, b.user.surname].filter(Boolean).join(" ").toLowerCase();
                        return nameA.localeCompare(nameB);
                    }),
                }));
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
