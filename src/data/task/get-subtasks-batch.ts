"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { unstable_cache } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildSubTaskConditions } from "@/lib/tasks/filter-utils";
import { resolveTaskPermissions } from "./get-tasks";
import { getTaskSelect } from "@/lib/tasks/query-builder";

/**
 * Result structure for batch subtask fetching.
 */
export type BatchSubTasksResult = {
    parentTaskId: string;
    subTasks: any[];
    totalCount: number;
    hasMore: boolean;
    nextCursor?: any;
}[];

/**
 * Normalizes query filters into a stable hash for the cache key.
 * Normalizes dates to prevent timestamp-based cache misses.
 */
function getFilterHash(filters: Partial<TaskFilters>): string {
    const normalizeDate = (d: any) => {
        if (!d) return null;
        const date = new Date(d);
        // Normalize to day-only UTC timestamp for stable caching
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).getTime();
    };

    return JSON.stringify({
        status: filters.status,
        assigneeId: filters.assigneeId,
        tagId: filters.tagId,
        search: filters.search?.trim().toLowerCase(),
        dueAfter: normalizeDate(filters.dueAfter || (filters as any).startDate),
        dueBefore: normalizeDate(filters.dueBefore || (filters as any).endDate),
    });
}

/**
 * Internal function to fetch subtasks for multiple parent tasks in a SINGLE query.
 * Optimized for performance and high cache hit ratios.
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
    pageSize: number = 30,
    viewMode: string = "list"
): Promise<BatchSubTasksResult> {
    if (parentTaskIds.length === 0) {
        return [];
    }

    const startTime = performance.now();

    // ── 1. Build Raw Conditions ──────────────────────────────────────────
    // Normalize date filters to UTC days (matches get-tasks.ts logic)
    const normalize = (d: any) => d ? new Date(new Date(d).setUTCHours(0, 0, 0, 0)) : undefined;
    const dueAfter = normalize(filters.dueAfter || (filters as any).startDate);
    const dueBefore = normalize(filters.dueBefore || (filters as any).endDate);

    const countWhere: any = {
        workspaceId,
        parentTaskId: { in: parentTaskIds },
        // isParent: false removed to allow nested folders/subtasks to show
        ...buildSubTaskConditions({
            ...filters,
            workspaceId,
            dueAfter,
            dueBefore
        })
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
        } else {
            // Short-circuit: no access to any requested project
            console.log(`[PERF:QUERY] Expanding subtasks failed: User ${userId} has no access to any relevant projects.`);
            return parentTaskIds.map(parentTaskId => ({
                parentTaskId,
                subTasks: [],
                totalCount: 0,
                hasMore: false,
            }));
        }
    }

    // ── 2. SINGLE PARENT OPTIMIZATION (THE FAST PATH) ──────────────────────
    // If only one parent is requested (expansion), use 'take' for maximum speed.
    if (parentTaskIds.length === 1) {
        const parentId = parentTaskIds[0];

        // 🚀 Optimization: Fetch parent data once and subtasks separately
        const baseSelect = getTaskSelect(viewMode);
        const subtaskSelect = { ...baseSelect };
        const parentRelationSelect = baseSelect.parentTask as any;
        delete subtaskSelect.parentTask;

        // CRITICAL OPTIMIZATION: Do not ask for `_count.subTasks` on subtasks.
        // It's exceptionally heavy on the DB when enumerating children.
        if (subtaskSelect._count) {
            const countSelect = { ...(subtaskSelect._count as any).select };
            delete countSelect.subTasks;
            subtaskSelect._count = { select: countSelect };
        }

        // Fetch subtasks and parent metadata in parallel
        const [rawTasks, parentData] = await Promise.all([
            prisma.task.findMany({
                where: countWhere,
                select: {
                    ...subtaskSelect,
                    parentTaskId: true,
                },
                take: pageSize + 1,
                orderBy: { createdAt: 'desc' }
            }),
            parentRelationSelect?.select ? prisma.task.findUnique({
                where: { id: parentId },
                select: parentRelationSelect.select
            }) : Promise.resolve(null)
        ]);

        const hasMore = rawTasks.length > pageSize;
        const finalTasks = (hasMore ? rawTasks.slice(0, pageSize) : rawTasks).map(t => {
            const entry = { ...t, parentTask: parentData } as any;
            if (entry.isParent) {
                delete entry.reviewer;
                delete entry.reviewerId;
            }
            return entry;
        });

        const duration = performance.now() - startTime;
        console.log(`[PERF:QUERY] Subtask Expand (${parentId}): ${duration.toFixed(2)}ms for ${finalTasks.length} items. ParentData: ${parentData ? "FOUND" : "MISSING"}`);

        const nextCursor = hasMore && finalTasks.length > 0
            ? { id: finalTasks[finalTasks.length - 1].id, createdAt: finalTasks[finalTasks.length - 1].createdAt }
            : undefined;

        return [{
            parentTaskId: parentId,
            subTasks: finalTasks,
            totalCount: finalTasks.length,
            hasMore,
            nextCursor
        }];
    }

    // ── 3. Optimized BATCH Fetch (THE SCALABLE PATH) ────────────────────────
    // For many parents, we fetch a matching set and group them in memory.
    const BATCH_HARD_LIMIT = 500;

    // Fetch matching subtasks. TASK_CORE_SELECT already includes relations.
    const batchSelect = { ...getTaskSelect(viewMode) };
    if (batchSelect._count) {
        const countSelect = { ...(batchSelect._count as any).select };
        delete countSelect.subTasks;
        batchSelect._count = { select: countSelect };
    }

    const rawSubTasksAll = await prisma.task.findMany({
        where: countWhere,
        select: {
            ...batchSelect,
            parentTaskId: true,
        },
        take: BATCH_HARD_LIMIT,
        orderBy: { createdAt: 'desc' }
    });

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

    const duration = performance.now() - startTime;
    if (duration > 150) {
        console.log(`[PERF] Batch Subtasks: ${duration.toFixed(2)}ms for ${parentTaskIds.length} parents`);
    }

    return parentTaskIds.map(parentTaskId => {
        const subTasks = subTasksMap.get(parentTaskId) || [];
        
        // Strip reviewer from any parent tasks in this subtask set
        subTasks.forEach((t: any) => {
            if (t.isParent) {
                delete t.reviewer;
                delete t.reviewerId;
            }
        });

        const totalCount = totalCountMap.get(parentTaskId) || 0;
        return {
            parentTaskId,
            subTasks,
            totalCount,
            hasMore: totalCount > pageSize,
        };
    });
}

/**
 * Cached version of batch subtask fetch.
 * Uses Next.js unstable_cache for cross-request consistency.
 */
const getCachedSubTasksByParentIds = async (
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    filters: Partial<TaskFilters>,
    pageSize: number,
    viewMode: string
): Promise<BatchSubTasksResult> => {
    const sortedIds = [...parentTaskIds].sort().join(',');
    const filterHash = getFilterHash(filters);
    const scopeHash = JSON.stringify({
        isAdmin,
        full: [...fullAccessProjectIds].sort(),
        restricted: [...restrictedProjectIds].sort(),
    });

    const startTime = performance.now();
    const results = await unstable_cache(
        async () => _getSubTasksByParentIdsInternal(
            parentTaskIds,
            workspaceId,
            projectId,
            userId,
            isAdmin,
            fullAccessProjectIds,
            restrictedProjectIds,
            filters,
            pageSize,
            viewMode
        ),
        [`batch-subtasks-v8-${sortedIds}-${userId}-${scopeHash}-${filterHash}-${pageSize}-${viewMode}`],
        {
            tags: parentTaskIds.flatMap(id => CacheTags.taskSubTasks(id, userId)),
            revalidate: 300, // 5 minutes - reliable because we invalidate specifically on mutation
        }
    )();

    const duration = performance.now() - startTime;
    if (duration > 10) {
        console.log(`[PERF:CACHE-MISS] Subtasks fetch: ${duration.toFixed(2)}ms for ${parentTaskIds.length} parents`);
    }

    return results;
};

/**
 * Get subtasks for multiple parent tasks in a SINGLE database query.
 * Entry point for client/server components.
 */
export const getSubTasksByParentIds = cache(
    async (
        parentTaskIds: string[],
        workspaceId: string,
        projectId?: string,
        filters: Partial<TaskFilters> = {},
        pageSize: number = 30,
        viewMode: string = "list",
        userId?: string,
        skipPermissionsCheck: boolean = false
    ): Promise<BatchSubTasksResult> => {
        try {
            if (parentTaskIds.length === 0) {
                return [];
            }

            let isWorkspaceAdmin = false;
            let fullAccessProjectIds: string[] = [];
            let restrictedProjectIds: string[] = [];
            let workspaceMemberUserId = userId || "";

            if (!skipPermissionsCheck) {
                const {
                    permissions,
                    isWorkspaceAdmin: isAdmin,
                    fullAccessProjectIds: fullAccess,
                    restrictedProjectIds: restricted,
                } = await resolveTaskPermissions(workspaceId, projectId, userId);

                if (!permissions?.workspaceMember) {
                    throw new Error("User does not have access to this workspace");
                }
                isWorkspaceAdmin = isAdmin;
                fullAccessProjectIds = fullAccess;
                restrictedProjectIds = restricted;
                workspaceMemberUserId = permissions.workspaceMember.userId;
            } else if (userId) {
                // VERY FAST PATH: Trust the UI since the user already saw the parent task to click expand!
                isWorkspaceAdmin = true; // Bypasses the strict WHERE clause for filtering
                workspaceMemberUserId = userId;
            }

            // 🚀 CRITICAL OPTIMIZATION: Next.js unstable_cache has severe read/write blocking overhead (~3s locally).
            // When a user expands a single folder (Server Action), bypass cache and query DB instantly!
            if (parentTaskIds.length === 1) {
                return await _getSubTasksByParentIdsInternal(
                    parentTaskIds,
                    workspaceId,
                    projectId,
                    workspaceMemberUserId,
                    isWorkspaceAdmin,
                    fullAccessProjectIds,
                    restrictedProjectIds,
                    filters,
                    pageSize,
                    viewMode
                );
            }

            return await getCachedSubTasksByParentIds(
                parentTaskIds,
                workspaceId,
                projectId,
                workspaceMemberUserId,
                isWorkspaceAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                filters,
                pageSize,
                viewMode
            );
        } catch (error) {
            console.error("Error fetching batch subtasks:", error);
            // Graceful fallback: return empty sets for all requested parents
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
