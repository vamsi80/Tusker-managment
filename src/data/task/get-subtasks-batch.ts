"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildSubTaskConditions } from "@/lib/tasks/filter-utils";
import { Prisma } from "@/generated/prisma/client";
import { resolveTaskPermissions } from "./get-tasks";
import {
    TASK_CORE_SELECT,
} from "@/lib/tasks/query-builder";
import {
    batchLoadUsers,
    batchLoadTags,
    hydrateTasks,
} from "@/lib/tasks/batch-loader";

export type BatchSubTasksResult = {
    parentTaskId: string;
    subTasks: any[];
    totalCount: number;
    hasMore: boolean;
}[];

/**
 * Internal function to fetch subtasks for multiple parent tasks in a SINGLE query
 * Uses SQL window function to get top N subtasks per parent efficiently.
 */
async function _getSubTasksByParentIdsInternal(
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    permissionMode: "admin" | "lead" | "member",
    authorizedProjectIds: string[],
    adminScope: boolean,
    filters: Partial<TaskFilters> = {},
    pageSize: number = 10
) {
    if (parentTaskIds.length === 0) {
        return [];
    }

    // 1. Build permissions SQL
    let permissionSql = Prisma.empty;
    if (permissionMode === "member" && !adminScope) {
        permissionSql = Prisma.sql`AND "assigneeTo" = ${userId}`;
    } else if (permissionMode === "lead" && !adminScope) {
        // Leads see all in authorized projects, but we are already filtering by parentTaskId
        // which belongs to a project. However, for workspace-wide batch, we still need project scope.
        if (authorizedProjectIds.length > 0) {
            permissionSql = Prisma.sql`AND "projectId" IN (${Prisma.join(authorizedProjectIds)})`;
        }
    }

    // 2. Build Count Query (Prisma is fine for counts)
    const countWhere: any = {
        parentTaskId: { in: parentTaskIds },
        ...buildSubTaskConditions({ ...filters, workspaceId })
    };
    if (permissionMode === "member" && !adminScope) {
        countWhere.assigneeTo = userId;
    } else if (permissionMode === "lead" && !adminScope && authorizedProjectIds.length > 0) {
        countWhere.projectId = { in: authorizedProjectIds };
    }

    // 3. SQL for window function pagination
    const subTaskIdsRaw = await prisma.$queryRaw<any[]>`
        SELECT id FROM (
            SELECT 
                id, 
                ROW_NUMBER() OVER(PARTITION BY "parentTaskId" ORDER BY "createdAt" DESC) as rn
            FROM "Task"
            WHERE "parentTaskId" IN (${Prisma.join(parentTaskIds)})
              AND "workspaceId" = ${workspaceId}
              ${permissionSql}
        ) sub WHERE rn <= ${pageSize}
    `;

    const subTaskIds = subTaskIdsRaw.map(r => r.id);

    // 4. Group counts and fetch full objects
    const [totalCountByParent, rawSubTasks] = await prisma.$transaction([
        prisma.task.groupBy({
            by: ['parentTaskId'],
            where: countWhere,
            _count: { id: true },
            orderBy: { parentTaskId: 'asc' }
        }),
        prisma.task.findMany({
            where: { id: { in: subTaskIds } },
            select: {
                ...TASK_CORE_SELECT,
                // Ensure we have parentTaskId for grouping
                parentTaskId: true,
            },
            orderBy: [
                { parentTaskId: 'asc' },
                { createdAt: 'desc' },
            ]
        })
    ]);

    // 5. Batch load related entities for hydration
    const [userMap, tagMap] = await Promise.all([
        batchLoadUsers([
            ...rawSubTasks.map(t => t.assigneeTo),
            ...rawSubTasks.map(t => t.reviewerId),
            ...rawSubTasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawSubTasks.map(t => t.tagId)),
    ]);

    const hydratedSubTasks = hydrateTasks(rawSubTasks, userMap, tagMap, new Map());

    // 6. Group by parent
    const groupedResults = new Map<string, any[]>();
    const countMap = new Map<string, number>();

    parentTaskIds.forEach(id => {
        groupedResults.set(id, []);
        countMap.set(id, 0);
    });

    totalCountByParent.forEach(item => {
        if (item.parentTaskId) {
            const count = (item._count as any)?.id ?? 0;
            countMap.set(item.parentTaskId, count);
        }
    });

    hydratedSubTasks.forEach(subTask => {
        if (subTask.parentTaskId) {
            groupedResults.get(subTask.parentTaskId)?.push(subTask);
        }
    });

    return parentTaskIds.map(parentTaskId => {
        const subTasks = groupedResults.get(parentTaskId) || [];
        const totalCount = countMap.get(parentTaskId) || 0;
        return {
            parentTaskId,
            subTasks,
            totalCount,
            hasMore: totalCount > pageSize,
        };
    });
}

/**
 * Generate a hash for filters to use in cache key
 */
function getFilterHash(filters: Partial<TaskFilters>): string {
    return JSON.stringify({
        status: filters.status,
        assigneeId: filters.assigneeId,
        tagId: filters.tagId,
        search: filters.search,
        dueAfter: filters.dueAfter,
        dueBefore: filters.dueBefore,
    });
}

/**
 * Cached version of batch subtask fetch
 */
const getCachedSubTasksByParentIds = (
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    permissionMode: "admin" | "lead" | "member",
    authorizedProjectIds: string[],
    adminScope: boolean,
    filters: Partial<TaskFilters>,
    pageSize: number
) => {
    // Sort IDs for consistent cache keys
    const sortedIds = [...parentTaskIds].sort().join(',');
    const filterHash = getFilterHash(filters);

    return unstable_cache(
        async () => _getSubTasksByParentIdsInternal(
            parentTaskIds,
            workspaceId,
            projectId,
            userId,
            permissionMode,
            authorizedProjectIds,
            adminScope,
            filters,
            pageSize
        ),
        [`batch-subtasks-${sortedIds}-${userId}-${permissionMode}-${adminScope}-${filterHash}-${pageSize}-v2`],
        {
            tags: [
                ...parentTaskIds.flatMap(id => CacheTags.taskSubTasks(id, userId)),
                `workspace-tasks-${workspaceId}`,
            ],
            revalidate: 60,
        }
    )();
};

/**
 * Get subtasks for multiple parent tasks in a SINGLE database query
 */
export const getSubTasksByParentIds = cache(
    async (
        parentTaskIds: string[],
        workspaceId: string,
        projectId?: string,
        filters: Partial<TaskFilters> = {},
        pageSize: number = 10
    ): Promise<BatchSubTasksResult> => {
        try {
            if (parentTaskIds.length === 0) {
                return [];
            }

            // Resolve permissions using unified engine
            const {
                tier: permissionMode,
                permissions,
                authorizedProjectIds,
                isWorkspaceAdmin: adminScope
            } = await resolveTaskPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this workspace");
            }

            return await getCachedSubTasksByParentIds(
                parentTaskIds,
                workspaceId,
                projectId,
                permissions.workspaceMember.userId,
                permissionMode,
                authorizedProjectIds,
                adminScope,
                filters,
                pageSize
            );
        } catch (error) {
            console.error("Error fetching batch subtasks:", error);
            return parentTaskIds.map(parentTaskId => ({
                parentTaskId,
                subTasks: [],
                totalCount: 0,
                hasMore: false,
            }));
        }
    }
);

// ============================================
// TYPE EXPORTS
// ============================================

export type BatchSubTasksResponse = Awaited<ReturnType<typeof getSubTasksByParentIds>>;
export type BatchSubTaskItem = BatchSubTasksResponse[number];
