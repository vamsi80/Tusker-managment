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
                "projectId" = ANY(${fullAccessProjectIds}::uuid[])
                OR ("projectId" = ANY(${restrictedProjectIds}::uuid[]) AND "assigneeTo" = ${userId}::uuid)
            )`;
        } else if (fullAccessProjectIds.length > 0) {
            permissionSql = Prisma.sql`AND "projectId" = ANY(${fullAccessProjectIds}::uuid[])`;
        } else if (restrictedProjectIds.length > 0) {
            // Only restricted projects — must be assigned
            permissionSql = Prisma.sql`AND "projectId" = ANY(${restrictedProjectIds}::uuid[]) AND "assigneeTo" = ${userId}::uuid`;
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

    // ── 3. Optimized Fetch using Prisma findMany ─────────────────────────────────
    // We fetch ALL matching subtasks for these parents.
    // Since we only fetch for ~50 parents at a time, this is very efficient.
    const rawSubTasksAll = await prisma.task.findMany({
        where: countWhere,
        select: {
            ...TASK_CORE_SELECT,
            parentTaskId: true,
        },
        orderBy: { createdAt: 'desc' }
    });

    // Manual slice per parentTaskId to respect pageSize (mimicking ROW_NUMBER logic)
    const subTasksMap = new Map<string, any[]>();
    const totalCountMap = new Map<string, number>();

    rawSubTasksAll.forEach(task => {
        const pId = task.parentTaskId!;
        const currentCount = totalCountMap.get(pId) || 0;
        totalCountMap.set(pId, currentCount + 1);

        if (currentCount < pageSize) {
            if (!subTasksMap.has(pId)) subTasksMap.set(pId, []);
            subTasksMap.get(pId)!.push(task);
        }
    });

    const subTaskIds = rawSubTasksAll.map(r => r.id);
    const rawSubTasks = rawSubTasksAll;

    // ── 4. Hydrate ────────────────────────────────────────────────────────
    const [userMap, tagMap] = await Promise.all([
        batchLoadUsers([
            ...rawSubTasks.map(t => t.assigneeTo),
            ...rawSubTasks.map(t => t.reviewerId),
            ...rawSubTasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawSubTasks.map(t => t.tagId)),
    ]);

    const hydratedSubTasks = hydrateTasks(rawSubTasks, userMap, tagMap, new Map());

    // ── 5. Group by parent & Slice ────────────────────────────────────────
    const finalGrouped = new Map<string, any[]>();
    const counts = new Map<string, number>();

    hydratedSubTasks.forEach(subTask => {
        if (!subTask.parentTaskId) return;

        // Track total count for "hasMore"
        counts.set(subTask.parentTaskId, (counts.get(subTask.parentTaskId) || 0) + 1);

        // Slice to pageSize
        if (!finalGrouped.has(subTask.parentTaskId)) finalGrouped.set(subTask.parentTaskId, []);
        if (finalGrouped.get(subTask.parentTaskId)!.length < pageSize) {
            finalGrouped.get(subTask.parentTaskId)!.push(subTask);
        }
    });

    return parentTaskIds.map(parentTaskId => {
        const subTasks = finalGrouped.get(parentTaskId) || [];
        const totalCount = counts.get(parentTaskId) || 0;
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
