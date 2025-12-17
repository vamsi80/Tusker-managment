"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";
import { getUserPermissions } from "@/data/user/get-user-permissions";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

/**
 * Internal function to fetch subtasks by status with pagination
 */
async function _getSubTasksByStatusInternal(
    projectId: string,
    status: TaskStatus,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) {
    const skip = (page - 1) * pageSize;

    // Build where clause based on role
    const whereClause = isMember
        ? {
            parentTask: { projectId },
            parentTaskId: { not: null },
            status,
            assignee: { workspaceMemberId },
        }
        : {
            parentTask: { projectId },
            parentTaskId: { not: null },
            status,
        };

    // Fetch count and data in transaction
    const [totalCount, subTasks] = await prisma.$transaction([
        prisma.task.count({ where: whereClause }),
        prisma.task.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                taskSlug: true,
                description: true,
                status: true,
                position: true,
                startDate: true,
                days: true,
                tag: true,
                parentTaskId: true,
                isPinned: true,
                pinnedAt: true,
                parentTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                },
                assignee: {
                    select: {
                        id: true,
                        workspaceMember: {
                            select: {
                                user: {
                                    select: {
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
                dependsOn: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                    },
                },
                _count: {
                    select: {
                        reviewComments: true,
                    },
                },
            },
            orderBy: [
                { isPinned: 'desc' }, // Pinned tasks first
                { position: 'asc' },  // Then by position
            ],
            skip,
            take: pageSize,
        }),
    ]);

    return {
        subTasks,
        totalCount,
        hasMore: skip + subTasks.length < totalCount,
        currentPage: page,
    };
}

/**
 * Cached version with Next.js unstable_cache
 */
const getCachedSubTasksByStatus = (
    projectId: string,
    status: TaskStatus,
    workspaceMemberId: string,
    isMember: boolean,
    page: number,
    pageSize: number
) =>
    unstable_cache(
        async () => _getSubTasksByStatusInternal(projectId, status, workspaceMemberId, isMember, page, pageSize),
        [`kanban-${projectId}-${status}-${workspaceMemberId}-p${page}-s${pageSize}`],
        {
            tags: [`project-tasks-${projectId}`, `kanban-${status}`, `kanban-all`],
            revalidate: 60,
        }
    )();

/**
 * Get subtasks by status with pagination for Kanban columns
 * 
 * @param projectId - Project ID
 * @param workspaceId - Workspace ID
 * @param status - Task status (column)
 * @param page - Page number (default: 1)
 * @param pageSize - Items per page (default: 5)
 */
export const getSubTasksByStatus = cache(
    async (
        projectId: string,
        workspaceId: string,
        status: TaskStatus,
        page: number = 1,
        pageSize: number = 5
    ) => {
        const user = await requireUser();

        try {
            const permissions = await getUserPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("No access to project");
            }

            return await getCachedSubTasksByStatus(
                projectId,
                status,
                permissions.workspaceMemberId,
                permissions.isMember,
                page,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching subtasks by status:", error);
            return {
                subTasks: [],
                totalCount: 0,
                hasMore: false,
                currentPage: 1,
            };
        }
    }
);

// Type exports
export type SubTasksByStatusResponse = Awaited<ReturnType<typeof getSubTasksByStatus>>;
export type KanbanSubTaskType = SubTasksByStatusResponse['subTasks'][number];
