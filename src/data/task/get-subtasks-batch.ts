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
 * Internal function to fetch subtasks for multiple parent tasks in a SINGLE query.
 * Uses SQL window function to get top N subtasks per parent efficiently.
 *
 * Permission model (no tiers):
 *   - isAdmin      → no project restriction at all
 *   - fullAccess   → can see all subtasks in those projects
 *   - restricted   → can only see assigned subtasks in those projects
 */
async function _getSubTasksByParentIdsInternal(
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    filters: Partial<TaskFilters> = {},
    pageSize: number = 10
) {
    if (parentTaskIds.length === 0) {
        return [];
    }

    // ── 1. Build raw SQL permission clause ────────────────────────────────
    let permissionSql = Prisma.empty;

    if (!isAdmin) {
        if (fullAccessProjectIds.length > 0 && restrictedProjectIds.length > 0) {
            // Mixed: full-access OR (restricted AND assigned)
            permissionSql = Prisma.sql`AND (
                "projectId" IN (${Prisma.join(fullAccessProjectIds)})
                OR ("projectId" IN (${Prisma.join(restrictedProjectIds)}) AND "assigneeTo" = ${userId})
            )`;
        } else if (fullAccessProjectIds.length > 0) {
            permissionSql = Prisma.sql`AND "projectId" IN (${Prisma.join(fullAccessProjectIds)})`;
        } else if (restrictedProjectIds.length > 0) {
            // Only restricted projects — must be assigned
            permissionSql = Prisma.sql`AND "projectId" IN (${Prisma.join(restrictedProjectIds)}) AND "assigneeTo" = ${userId}`;
        } else {
            // No access at all — short circuit
            return parentTaskIds.map(parentTaskId => ({
                parentTaskId,
                subTasks: [],
                totalCount: 0,
                hasMore: false,
            }));
        }
    }

    // ── 2. Build Prisma count WHERE (mirrors the SQL above) ──────────────
    const countWhere: any = {
        parentTaskId: { in: parentTaskIds },
        ...buildSubTaskConditions({ ...filters, workspaceId })
    };

    if (!isAdmin) {
        if (fullAccessProjectIds.length > 0 && restrictedProjectIds.length > 0) {
            countWhere.OR = [
                { projectId: { in: fullAccessProjectIds } },
                { projectId: { in: restrictedProjectIds }, assigneeTo: userId }
            ];
        } else if (fullAccessProjectIds.length > 0) {
            countWhere.projectId = { in: fullAccessProjectIds };
        } else if (restrictedProjectIds.length > 0) {
            countWhere.projectId = { in: restrictedProjectIds };
            countWhere.assigneeTo = userId;
        }
    }

    // ── 3. Window-function pagination ─────────────────────────────────────
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

    // ── 4. Group counts + fetch full objects ──────────────────────────────
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
                parentTaskId: true,
            },
            orderBy: [
                { parentTaskId: 'asc' },
                { createdAt: 'desc' },
            ]
        })
    ]);

    // ── 5. Hydrate ────────────────────────────────────────────────────────
    const [userMap, tagMap] = await Promise.all([
        batchLoadUsers([
            ...rawSubTasks.map(t => t.assigneeTo),
            ...rawSubTasks.map(t => t.reviewerId),
            ...rawSubTasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawSubTasks.map(t => t.tagId)),
    ]);

    const hydratedSubTasks = hydrateTasks(rawSubTasks, userMap, tagMap, new Map());

    // ── 6. Group by parent ────────────────────────────────────────────────
    const groupedResults = new Map<string, any[]>();
    const countMap = new Map<string, number>();

    parentTaskIds.forEach((id: string) => {
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
 * Generate a stable hash for filters for use in the cache key.
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
 * Cached version of batch subtask fetch.
 */
const getCachedSubTasksByParentIds = (
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    filters: Partial<TaskFilters>,
    pageSize: number
) => {
    const sortedIds = [...parentTaskIds].sort().join(',');
    const filterHash = getFilterHash(filters);
    // Include sorted scopes in the cache key for correctness
    const scopeHash = JSON.stringify({
        isAdmin,
        full: [...fullAccessProjectIds].sort(),
        restricted: [...restrictedProjectIds].sort(),
    });

    return unstable_cache(
        async () => _getSubTasksByParentIdsInternal(
            parentTaskIds,
            workspaceId,
            projectId,
            userId,
            isAdmin,
            fullAccessProjectIds,
            restrictedProjectIds,
            filters,
            pageSize
        ),
        [`batch-subtasks-v4-${sortedIds}-${userId}-${scopeHash}-${filterHash}-${pageSize}`],
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
 * Get subtasks for multiple parent tasks in a SINGLE database query.
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

            const {
                permissions,
                isWorkspaceAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
            } = await resolveTaskPermissions(workspaceId, projectId);

            if (!permissions.workspaceMemberId) {
                throw new Error("User does not have access to this workspace");
            }

            return await getCachedSubTasksByParentIds(
                parentTaskIds,
                workspaceId,
                projectId,
                permissions.workspaceMember.userId,
                isWorkspaceAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
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
