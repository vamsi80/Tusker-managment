"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import crypto from "crypto";
import prisma from "@/lib/db";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";
import { getTaskSelect, TaskCursor, buildProjectRootWhere, buildSubtaskExpansionWhere, buildWorkspaceFilterWhere, WorkspaceFilterOpts, } from "@/lib/tasks/query-builder";
import { logger } from "@/lib/logger";

export type TaskViewType = "list" | "kanban" | "gantt" | "calendar";

export interface GetTasksOptions {
    workspaceId: string;
    projectId?: string;
    hierarchyMode?: "parents" | "children" | "all";
    groupBy?: "status";

    status?: string | string[];
    permissionStatus?: string | string[];
    assigneeId?: string | string[];
    tagId?: string | string[];
    tag?: string | string[];
    search?: string;
    dueAfter?: string | Date;
    dueBefore?: string | Date;
    startDate?: string | Date;
    endDate?: string | Date;
    isPinned?: boolean;

    filterParentTaskId?: string;
    onlyParents?: boolean;
    excludeParents?: boolean;
    onlySubtasks?: boolean;

    cursor?: TaskCursor;
    skip?: number;
    expandedProjectIds?: string[];
    page?: number;
    limit?: number;
    includeSubTasks?: boolean;
    includeFacets?: boolean;

    view_mode?: "default" | "search" | "list" | "kanban" | "gantt" | "calendar";
    sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
}

// ============================================================
//  SORT CONTRACT — Single Source of Truth
//  Client field name → DB column + null-handling strategy.
//
//  ⚠️  DO NOT add relation fields here (e.g. assignee → assigneeTo).
//  Sorting by a FK id is semantically meaningless.
//  Denormalize the display value into the Task table first,
//  then add it here.
// ============================================================
type SortDefinition = {
    /** Exact Prisma field name on the Task model */
    dbField: string;
    /** How to handle NULL rows — omit for non-nullable columns */
    nulls?: "last" | "first";
};

const SORT_MAP: Record<string, SortDefinition> = {
    name: { dbField: "name" },
    status: { dbField: "status", nulls: "last" },
    dueDate: { dbField: "dueDate", nulls: "last" },
    startDate: { dbField: "startDate", nulls: "last" },
    createdAt: { dbField: "createdAt" },
    assignee: { dbField: "assigneeDisplayName", nulls: "last" },
    reviewer: { dbField: "reviewerDisplayName", nulls: "last" },
};

function buildOrderBy(sorts?: Array<{ field: string; direction: "asc" | "desc" }>) {
    if (!sorts || sorts.length === 0) {
        return [
            { createdAt: "desc" as const },
            { id: "asc" as const },
        ];
    }

    const { field, direction } = sorts[0];
    const def = SORT_MAP[field];

    if (!def) {
        throw new Error(`[buildOrderBy] Invalid sort field: "${field}". Add it to SORT_MAP first.`);
    }

    const primary: any = def.nulls
        ? { [def.dbField]: { sort: direction, nulls: def.nulls } }
        : { [def.dbField]: direction };

    // ALWAYS use id: asc as the deterministic tiebreaker to match query builder's 'gt' logic 
    // and take advantage of standard compound indexes (field, id).
    return [primary, { id: "asc" as const }];
}

/**
 * Builds a WHERE extension that skips all rows already delivered by the previous page.
 * Uses the exact same field order as buildOrderBy so pagination is stable.
 *
 * IMPORTANT: cursor keys are DB column names (e.g. "startDate"), NOT client field names.
 */
/**
 * Builds a WHERE extension that skips all rows already delivered by the previous page.
 * Uses the exact same field order as buildOrderBy so pagination is stable.
 */
function buildSeekCondition(
    sorts: Array<{ field: string; direction: "asc" | "desc" }>,
    cursor: any
): any {
    try {
        if (!sorts?.length || !cursor) return {};

        const { field, direction } = sorts[0];
        const def = SORT_MAP[field];
        if (!def) return {};

        const dbField = def.dbField;
        const lastFieldValue = cursor[dbField];
        const lastId = cursor.id;

        if (lastId === undefined || lastId === null) return {};

        const op = direction === "asc" ? "gt" : "lt";

        if (lastFieldValue === null || lastFieldValue === undefined) {
            // We are in the NULL block at the end (nulls: 'last')
            return {
                AND: [
                    { [dbField]: null },
                    { id: { [op]: lastId } },
                ],
            };
        }

        // We are in the non-null block
        const conditions: any[] = [
            // 1. All rows strictly after this value (direction-dependent: lt for DESC, gt for ASC)
            { [dbField]: { [op]: lastFieldValue } },
            // 2. Rows with SAME value but strictly after this ID (ALWAYS 'gt' because tiebreaker is ALWAYS 'asc')
            {
                AND: [
                    { [dbField]: lastFieldValue },
                    { id: { gt: lastId } },
                ],
            },
        ];

        // 3. If we haven't hit the NULL block yet, include it
        if (def.nulls === "last") {
            conditions.push({ [dbField]: null });
        }

        return { OR: conditions };
    } catch (err) {
        console.error("[buildSeekCondition] Error building skip condition:", err);
        return {};
    }
}

const toArray = <T>(v: T | T[] | undefined): T[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];

const toUTCDateOnly = (input: string | Date | undefined) => {
    if (!input) return undefined;

    const d = new Date(input);

    // If it's a Date object (not a string), it likely came from a local UI picker.
    // We want the calendar day the user sees. Use local components getFullYear/getMonth/getDate.
    if (typeof input !== 'string') {
        return new Date(Date.UTC(
            d.getFullYear(),
            d.getMonth(),
            d.getDate()
        ));
    }

    // For strings like "2024-10-10", stay in UTC
    return new Date(Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate()
    ));
};

const addOneDayUTC = (date: Date) =>
    new Date(date.getTime() + 24 * 60 * 60 * 1000);


// const ORDER_BY_CREATED_DESC = [{ createdAt: "desc" as const }, { id: "asc" as const }];

/**
 * Normalizes query options into a stable signature object for better cache hit ratios.
 */
function buildQuerySignature(
    workspaceId: string,
    projectId: string | undefined,
    permissionScope: { fullAccessProjectIds: string[], restrictedProjectIds: string[] } | string,
    opts: GetTasksOptions
) {
    const f: Record<string, any> = {};
    const sortArr = (val: any) => (Array.isArray(val) ? [...val].sort() : val);

    if (opts.status) f.st = sortArr(opts.status);
    if (opts.assigneeId) f.as = sortArr(opts.assigneeId);
    if (opts.tagId) f.tg = sortArr(opts.tagId);
    if (opts.search) f.q = opts.search.trim().toLowerCase();
    const dueAfter = opts.dueAfter || opts.startDate;
    const dueBefore = opts.dueBefore || opts.endDate;
    if (dueAfter) f.da = new Date(dueAfter).getTime();
    if (dueBefore) f.db = new Date(dueBefore).getTime();

    if (opts.hierarchyMode) f.hm = opts.hierarchyMode;
    if (opts.groupBy) f.gb = opts.groupBy;
    if (opts.filterParentTaskId) f.pt = opts.filterParentTaskId;
    if (opts.expandedProjectIds) f.ep = sortArr(opts.expandedProjectIds);
    const signature = {
        ws: workspaceId,
        p: projectId ?? "all",
        ps: permissionScope,
        f,
        // sorts MUST be in the key — without this every sort variant hits the same cached unsorted result
        so: opts.sorts && opts.sorts.length > 0
            ? opts.sorts.map(s => `${s.field}:${s.direction}`).join(",")
            : null,
        c: opts.cursor?.id ?? null,
        sk: opts.skip ?? 0,
        l: opts.limit ?? 20,
    };

    // 3. Hash the signature
    return crypto.createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

export const resolveTaskPermissions = cache(async (workspaceId: string, projectId?: string, userId?: string) => {
    const start = performance.now();
    let permissions: any;
    let isWorkspaceAdmin = false;
    let authorizedProjectIds: string[] = [];

    if (projectId) {
        const pStart = performance.now();
        permissions = await getUserPermissions(workspaceId, projectId, userId);
        isWorkspaceAdmin = permissions.isWorkspaceAdmin;

        const hasFullAccess =
            isWorkspaceAdmin ||
            permissions.isProjectLead ||
            permissions.isProjectManager;

        const result = {
            permissions,
            isWorkspaceAdmin,
            authorizedProjectIds: [projectId],
            fullAccessProjectIds: hasFullAccess ? [projectId] : [],
            restrictedProjectIds: hasFullAccess ? [] : [projectId]
        };
        return result;
    } else {
        const wsStart = performance.now();
        const wsPerms = await getWorkspacePermissions(workspaceId, userId);
        permissions = wsPerms;
        isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;

        if (isWorkspaceAdmin) {
            authorizedProjectIds = [];
        } else {
            // AUTHORIZED PROJECTS: Combine all projects where user has a defined role
            authorizedProjectIds = [
                ...(wsPerms.leadProjectIds || []),
                ...(wsPerms.managedProjectIds || []),
                ...(wsPerms.memberProjectIds || [])
            ];
        }

        const fullAccessProjectIds = [
            ...(wsPerms.leadProjectIds ?? []),
            ...(wsPerms.managedProjectIds ?? [])
        ];

        const restrictedProjectIds = authorizedProjectIds.filter(
            id => !fullAccessProjectIds.includes(id)
        );

        const result = {
            permissions,
            isWorkspaceAdmin,
            authorizedProjectIds,
            fullAccessProjectIds,
            restrictedProjectIds
        };
        return result;
    }
});

// ============================================================
//  VIEW 1: PROJECT ROOT  (Parent Tasks — initial load)
//  Index:  (projectId, isParent, status, createdAt DESC)
// ============================================================
async function _fetchProjectRoot(
    projectId: string,
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 50;
    const status = toArray(opts.status);
    const assigneeIds = toArray(opts.assigneeId);

    // Admins and leads with full access to this project see everything;
    // restricted members only see assigned tasks.
    const hasFullAccess = isAdmin || fullAccessProjectIds.includes(projectId);

    const assigneeFilter = !hasFullAccess
        ? userId  // member: always restrict to their own tasks
        : assigneeIds && assigneeIds.length > 0
            ? assigneeIds[0] // single-assignee fast path for admin/lead
            : undefined;

    const where = buildProjectRootWhere(projectId, {
        status,
        assigneeId: assigneeFilter,
        cursor: opts.cursor,
    });

    // For multi-assignee filter (admin/lead) override the single fast-path
    if (hasFullAccess && assigneeIds && assigneeIds.length > 1) {
        where.assigneeTo = { in: assigneeIds };
        delete where.OR;
    }

    // const countWhere = { ...where };
    // console.log(`[PRISMA PROJECT ROOT] where:`, JSON.stringify(where, null, 2));
    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: getTaskSelect(opts.view_mode),
            orderBy: buildOrderBy(opts.sorts),
            take: limit + 1,
        }),
        Promise.resolve(null as number | null),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? { id: rawTasks[rawTasks.length - 1].id, createdAt: rawTasks[rawTasks.length - 1].createdAt }
        : null;

    return { tasks: rawTasks, totalCount, hasMore, nextCursor };
}

// ============================================================
//  VIEW 2: SUBTASK EXPANSION  (Children of a Parent)
//  Index: (parentTaskId, createdAt)
// ============================================================
async function _fetchSubtasks(
    parentTaskId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 30;
    const status = toArray(opts.status);

    // Resolve the parent's projectId so we can apply the correct per-project scope.
    // This is a tiny indexed lookup (PK) so it adds negligible latency.
    let assigneeId: string | undefined = undefined;
    if (!isAdmin) {
        const parent = await prisma.task.findUnique({
            where: { id: parentTaskId },
            select: { projectId: true },
        });
        const parentProjectId = parent?.projectId;
        if (parentProjectId) {
            if (restrictedProjectIds.includes(parentProjectId)) {
                // Member-only project: restrict to own subtasks
                assigneeId = userId;
            }
            // fullAccessProjectIds → no restriction; assigneeId stays undefined
        }
    }

    const where = buildSubtaskExpansionWhere(parentTaskId, {
        status: status,
        assigneeId: assigneeId ? [assigneeId] : toArray(opts.assigneeId),
        tagId: toArray(opts.tagId),
        search: opts.search,
        dueAfter: toUTCDateOnly(opts.dueAfter),
        dueBefore: opts.dueBefore ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!) : undefined,
        cursor: opts.cursor,
    });

    const rawSubtasks = await prisma.task.findMany({
        where,
        select: getTaskSelect(opts.view_mode),
        orderBy: buildOrderBy(opts.sorts),
        take: limit + 1,
    });

    const hasMore = rawSubtasks.length > limit;
    if (hasMore) rawSubtasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? { id: rawSubtasks[rawSubtasks.length - 1].id, createdAt: rawSubtasks[rawSubtasks.length - 1].createdAt }
        : null;

    return { tasks: rawSubtasks, hasMore, nextCursor };
}

// ============================================================
async function _fetchFilteredHierarchy(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 50;

    // Filter Detection: If no explicit filters exist, we limit expansion depth to prevent
    // massive over-fetching in large workspaces.
    const hasExplicitFilters = !!(
        (opts.status && toArray(opts.status)?.length) ||
        (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
        (opts.tagId && toArray(opts.tagId)?.length) ||
        (opts.search && opts.search.trim().length > 0) ||
        opts.dueAfter ||
        opts.dueBefore
    );

    const matchWhere = buildWorkspaceFilterWhere(
        {
            workspaceId,
            projectId: opts.projectId,
            assigneeId: toArray(opts.assigneeId),
            status: toArray(opts.status),
            tagId: toArray(opts.tagId),
            dueAfter: toUTCDateOnly(opts.dueAfter),
            dueBefore: opts.dueBefore ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!) : undefined,
            search: opts.search,
            isAdmin,
            fullAccessProjectIds,
            restrictedProjectIds,
            // When not filtering, we only look at items that could be roots if hierarchyMode says so
            projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
            includeSubTasks: opts.includeSubTasks,
            viewMode: opts.view_mode,
        },

        userId
    );

    // 1. Fetch matches directly
    const rawMatches = await prisma.task.findMany({
        where: matchWhere,
        select: getTaskSelect(opts.view_mode),
        take: limit + 1,
        orderBy: buildOrderBy(opts.sorts),
    });

    const hasMore = rawMatches.length > limit;
    const matches = rawMatches.slice(0, limit);

    if (matches.length === 0) {
        return { tasks: [], totalCount: 0, hasMore: false, nextCursor: null };
    }

    // 2. CONTEXT EXPANSION
    const taskMap = new Map<string, any>();
    const shouldHaveSubTasks = opts.includeSubTasks || hasExplicitFilters;
    matches.forEach(t => taskMap.set(t.id, { ...t, subTasks: shouldHaveSubTasks ? [] : undefined }));

    // Depth limit based on context: 3 levels for filtered search, 1 level for global browse.
    const maxDepth = hasExplicitFilters ? 3 : 1;
    let currentGeneration = [...matches];

    for (let i = 0; i < maxDepth; i++) {
        // Find parents that we matched as subtasks but don't have the parent object for
        const missingParentIds = currentGeneration
            .filter(t => t.parentTaskId && !taskMap.has(t.parentTaskId))
            .map(t => t.parentTaskId!);

        // Find subtasks for parents we matched (ONLY for global browse, NOT filtered context)
        // If filters are active, we only climb UPWARDS to preserve the tree path. Downward children are already in 'matches' via pagination.
        const parentIdsToExpand = (opts.includeSubTasks && !hasExplicitFilters)
            ? currentGeneration.filter(t => t.isParent).map(t => t.id)
            : [];

        if (missingParentIds.length === 0 && parentIdsToExpand.length === 0) break;

        const extraTasks = await prisma.task.findMany({
            where: {
                OR: [
                    { id: { in: missingParentIds } },
                    {
                        AND: [
                            { parentTaskId: { in: parentIdsToExpand } },
                            hasExplicitFilters ? matchWhere : buildWorkspaceFilterWhere({
                                workspaceId,
                                projectId: opts.projectId,
                                isAdmin,
                                fullAccessProjectIds,
                                restrictedProjectIds,
                                projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
                                viewMode: opts.view_mode,
                            }, userId)
                        ]
                    }
                ]
            },
            select: getTaskSelect(opts.view_mode),
            take: 200 // Batch safety limit — prevent RSC payload bloat
        });

        if (extraTasks.length === 0) break;

        const newEntries: any[] = [];
        extraTasks.forEach(t => {
            if (!taskMap.has(t.id)) {
                const entry = { ...t, subTasks: shouldHaveSubTasks ? [] : undefined };
                taskMap.set(t.id, entry);
                newEntries.push(entry);
            }
        });
        currentGeneration = newEntries;

        // Cumulative safety cap to prevent RSC payload bloating
        if (taskMap.size > 500) break;
    }

    // 3. RE-NESTING
    const rootTasks: any[] = [];
    const nestedIds = new Set<string>();
    const allTasks = Array.from(taskMap.values());

    // First pass: Nest everything we have collected
    allTasks.forEach(task => {
        if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
            const parent = taskMap.get(task.parentTaskId);
            if (!parent.subTasks) parent.subTasks = [];
            if (!parent.subTasks.some((st: any) => st.id === task.id)) {
                parent.subTasks.push(task);
            }
            nestedIds.add(task.id);
        }
    });

    // Second pass: Identify root rows
    allTasks.forEach(task => {
        if (!nestedIds.has(task.id)) {
            rootTasks.push(task);
        }
    });

    // 4. SORTING
    // Prefer original match order for roots, but ensure parents of matches come first
    const sortedRoots = rootTasks.sort((a, b) => {
        const aIdx = matches.findIndex(m => m.id === a.id);
        const bIdx = matches.findIndex(m => m.id === b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const nextCursor: TaskCursor | null = hasMore && matches.length > 0
        ? { id: matches[matches.length - 1].id, createdAt: matches[matches.length - 1].createdAt }
        : null;

    // 5. PROJECT FACETS (If requested)
    const projectFacets: Record<string, number> = {};
    if (opts.includeFacets) {
        const facetWhere = { ...matchWhere };
        delete (facetWhere as any).AND; // Remove cursor for global count
        
        const counts = await prisma.task.groupBy({
            by: ['projectId'],
            where: facetWhere,
            _count: true
        });
        counts.forEach(c => {
            if (c.projectId) projectFacets[c.projectId] = (projectFacets[c.projectId] || 0) + c._count;
        });
    }

    return { 
        tasks: sortedRoots, 
        totalCount: matches.length, 
        hasMore, 
        nextCursor,
        facets: { status: {}, assignee: {}, tags: {}, projects: projectFacets }
    };
}


// ============================================================
//  VIEW 4: WORKSPACE FILTER (Flat Layout)
//  Used for Kanban/Sorted/Global Search results without tree
// ============================================================
async function _fetchWorkspaceFilter(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 50;

    const start = toUTCDateOnly(opts.dueAfter);
    const end = toUTCDateOnly(opts.dueBefore);

    const normalizedStart = start;
    const normalizedEnd = end ? addOneDayUTC(end) : undefined;

    const isSorting = opts.sorts && opts.sorts.length > 0;

    const filterOpts: WorkspaceFilterOpts = {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: normalizedStart,
        dueBefore: normalizedEnd,
        search: opts.search,
        // Only use default cursor if NO primary sort is active (avoids createdAt logic in builder)
        cursor: isSorting ? undefined : opts.cursor,
        isAdmin,
        fullAccessProjectIds,
        restrictedProjectIds,
        projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
        onlyParents: isSorting ? false : opts.onlyParents,
        excludeParents: opts.excludeParents,
        onlySubtasks: isSorting ? true : opts.onlySubtasks,

        viewMode: opts.view_mode,
    };

    // --- STRATEGY: FLAT FILTER ---
    // Used for Kanban, Sorted lists, or search results that don't require parent grouping
    let where = buildWorkspaceFilterWhere(filterOpts, userId);

    // Apply seek pagination if sorting
    if (isSorting && opts.cursor) {
        const seek = buildSeekCondition(opts.sorts!, opts.cursor);
        if (seek) {
            // Merge with any existing conditions to avoid overwriting scope clauses
            if (where.OR) {
                // If there's an existing OR, we need to wrap it in an AND with the new seek condition
                const existingOR = where.OR;
                delete where.OR; // Remove the top-level OR
                where.AND = [
                    ...(Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : [])),
                    { OR: existingOR }, // Re-add the existing OR clause
                    seek // Add the new seek condition
                ];
            } else {
                // If no existing OR, just add the seek condition to AND
                where.AND = [
                    ...(Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : [])),
                    seek
                ];
            }
        }
    }

    const primarySort = opts.sorts?.[0];

    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: getTaskSelect(opts.view_mode),
            orderBy: buildOrderBy(opts.sorts),
            take: limit + 1,
            skip: opts.skip || 0,
        }),
        Promise.resolve(null),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const lastTask = rawTasks[rawTasks.length - 1] as any;
    const nextCursor: any = hasMore && lastTask
        ? primarySort && SORT_MAP[primarySort.field]
            ? {
                id: lastTask.id,
                [SORT_MAP[primarySort.field].dbField]: lastTask[SORT_MAP[primarySort.field].dbField],
            }
            : { id: lastTask.id, createdAt: lastTask.createdAt }
        : null;

    return { tasks: rawTasks, totalCount, hasMore, nextCursor };
}

// ============================================================
//  ROUTER: Chooses the right fetch strategy
// ============================================================
async function _getTasksInternal(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    if (opts.startDate && !opts.dueAfter) opts.dueAfter = opts.startDate;
    if (opts.endDate && !opts.dueBefore) opts.dueBefore = opts.endDate;

    const startTime = performance.now();
    const { projectId, hierarchyMode, filterParentTaskId } = opts;
    let strategy = "NONE";

    try {
        const hasExplicitFilters =
            !!(
                (opts.status && toArray(opts.status)?.length) ||
                (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
                (opts.tagId && toArray(opts.tagId)?.length) ||
                (opts.search && opts.search.trim().length > 0) ||
                opts.dueAfter ||
                opts.dueBefore ||
                opts.startDate ||
                opts.endDate ||
                (opts.sorts && opts.sorts.length > 0)
            );

        const emptyFacets = { status: {}, assignee: {}, tags: {}, projects: {} };

        if (!projectId && !hasExplicitFilters && !opts.expandedProjectIds?.length && hierarchyMode !== "parents") {
            strategy = "SAFETY_GUARD";
            return {
                tasks: [],
                totalCount: 0,
                hasMore: false,
                nextCursor: null,
                facets: emptyFacets,
            };
        }

        if (filterParentTaskId) {
            strategy = "SUBTASK_EXPANSION";
            const result = await _fetchSubtasks(
                filterParentTaskId, userId, isAdmin,
                fullAccessProjectIds, restrictedProjectIds, opts
            );
            return { ...result, totalCount: null, facets: emptyFacets };
        }

        if (projectId && !hasExplicitFilters && (hierarchyMode === "parents" || !hierarchyMode)) {
            strategy = opts.includeSubTasks ? "RECURSIVE_HIERARCHY" : "PROJECT_ROOT";
            const result = await _fetchProjectRoot(
                projectId, workspaceId, userId, isAdmin,
                fullAccessProjectIds, restrictedProjectIds, opts
            );

            if (opts.includeSubTasks && result.tasks.length > 0) {
                const parentIds = result.tasks.filter(t => t.isParent).map(t => t.id);
                if (parentIds.length > 0) {
                    const hasFullAccess = isAdmin || (projectId ? fullAccessProjectIds.includes(projectId) : false);
                    const assigneeFilter = !hasFullAccess ? [userId] : toArray(opts.assigneeId);

                    const subtasks = await prisma.task.findMany({
                        where: buildSubtaskExpansionWhere(undefined, {
                            parentIds,
                            status: toArray(opts.status),
                            assigneeId: assigneeFilter,
                            tagId: toArray(opts.tagId),
                            search: opts.search,
                        }),
                        select: getTaskSelect(opts.view_mode),
                        orderBy: buildOrderBy(opts.sorts)
                    });

                    // Nest subtasks into parents
                    result.tasks.forEach((parent: any) => {
                        if (parent.isParent) {
                            parent.subTasks = subtasks.filter(st => st.parentTaskId === parent.id);
                        } else {
                            parent.subTasks = [];
                        }
                    });
                }
            }

            return { ...result, facets: emptyFacets };
        }

        const isSorting = opts.sorts && opts.sorts.length > 0;

        // If sorting is OFF, and we are not forcing subtasks, execute Hierarchy search.
        if (!isSorting && !opts.onlySubtasks && !opts.excludeParents && (hasExplicitFilters || (hierarchyMode === "parents" || !hierarchyMode))) {
            strategy = opts.includeSubTasks ? "FILTERED_RECURSIVE_HIERARCHY" : "FILTERED_HIERARCHY";
            const result = await _fetchFilteredHierarchy(
                workspaceId, userId, isAdmin,
                fullAccessProjectIds, restrictedProjectIds, opts
            );

            // Note: _fetchFilteredHierarchy now handles context expansion (parents/subtasks)
            // and search-aware nesting even at the global workspace level.
            return { ...result, facets: emptyFacets };
        }
        if (opts.groupBy === "status") {
            strategy = opts.includeSubTasks ? "KANBAN_RECURSIVE_HIERARCHY" : "KANBAN_SINGLE_QUERY";
            const baseWhere = buildWorkspaceFilterWhere({
                workspaceId,
                projectId: opts.projectId,
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                dueAfter: toUTCDateOnly(opts.dueAfter),
                dueBefore: opts.dueBefore ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!) : undefined,
                isAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                cursor: opts.cursor, // FIX: Pass cursor for pagination
                onlyParents: opts.hierarchyMode === "parents",
                onlySubtasks: opts.hierarchyMode === "children",
                excludeParents: opts.excludeParents,
                includeSubTasks: opts.includeSubTasks,
                viewMode: opts.view_mode,
            }, userId);


            // Normalize input cursor early for Prisma safety
            if (opts.cursor && typeof opts.cursor.createdAt === 'string') {
                opts.cursor.createdAt = new Date(opts.cursor.createdAt);
            }

            // --- KANBAN OPTIMIZATION: STATUS COUNTS ---
            // Fetch total counts per status to support "Load More" UI and correct hasMore flags.
            // We strip the cursor so we get the TOTAL count for the currently applied filters.
            const countWhere = { ...baseWhere };
            delete countWhere.AND; // Remove the cursor/seek condition if it was added

            const countsResult = await prisma.task.groupBy({
                by: ['status'],
                where: countWhere,
                _count: true
            });

            const statusCounts: Record<string, number> = {};
            countsResult.forEach(c => {
                if (c.status) statusCounts[c.status] = c._count;
            });

            // Normal Prisma take+1 logic to determine if there's more accurately via the query
            const limit = opts.limit ?? 50;
            const tasks = await prisma.task.findMany({
                where: baseWhere,
                take: limit + 1, // Take one extra to confidently define hasMore
                select: getTaskSelect(opts.view_mode),
                orderBy: buildOrderBy(opts.sorts)
            });

            const trueHasMore = tasks.length > limit;
            if (trueHasMore) tasks.pop(); // Remove the extra sentinel task

            // If recursive hierarchy requested, fetch subtasks for any parents in this set
            if (opts.includeSubTasks && tasks.length > 0) {
                const parentIds = tasks.filter(t => t.isParent).map(t => t.id);
                if (parentIds.length > 0) {
                    const subtasks = await prisma.task.findMany({
                        where: buildSubtaskExpansionWhere(undefined, {
                            parentIds,
                            status: toArray(opts.status),
                            assigneeId: toArray(opts.assigneeId),
                            tagId: toArray(opts.tagId),
                            search: opts.search,
                            dueAfter: toUTCDateOnly(opts.dueAfter),
                            dueBefore: opts.dueBefore ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!) : undefined,
                        }),
                        select: getTaskSelect(opts.view_mode),
                        orderBy: buildOrderBy(opts.sorts)
                    });

                    // Nest subtasks into parents
                    tasks.forEach((parent: any) => {
                        if (parent.isParent) {
                            parent.subTasks = subtasks.filter(st => st.parentTaskId === parent.id);
                        } else {
                            parent.subTasks = [];
                        }
                    });
                }
            }

            // Determine next cursor for pagination (supporting custom sorting)
            const primarySort = opts.sorts?.[0];
            const lastTask = tasks.length > 0 ? (tasks[tasks.length - 1] as any) : null;
            
            const nextCursor: any = trueHasMore && lastTask
                ? primarySort && SORT_MAP[primarySort.field]
                    ? {
                        id: lastTask.id,
                        [SORT_MAP[primarySort.field].dbField]: lastTask[SORT_MAP[primarySort.field].dbField],
                    }
                    : { id: lastTask.id, createdAt: lastTask.createdAt }
                : null;

            return {
                tasks,
                totalCount: tasks.length, // Accurate UI total count is generated via facets later
                hasMore: trueHasMore,
                nextCursor,
                facets: {
                    ...emptyFacets,
                    statusCounts
                }
            };
        }

        strategy = "FLAT_WORKSPACE_FILTER";
        const filterResult = await _fetchWorkspaceFilter(
            workspaceId, userId, isAdmin,
            fullAccessProjectIds, restrictedProjectIds,
            {
                ...opts,
                // If filtering, don't restrict to just parents/children; let the matching criteria find either
                onlyParents: !hasExplicitFilters && (opts.onlyParents || (hierarchyMode === "parents")),
                excludeParents: opts.excludeParents,
                onlySubtasks: !hasExplicitFilters && (isSorting || opts.onlySubtasks || (hierarchyMode === "children"))
            }
        );

        return { ...filterResult, facets: emptyFacets };
    } finally {
        const duration = performance.now() - startTime;
        if (duration > 50) { // Log significant queries
            logger.serverPerf("GET_TASKS_INTERNAL", duration, {
                strategy,
                workspaceId,
                projectId: opts.projectId,
                groupBy: opts.groupBy,
                search: !!opts.search
            });
        }
    }
}

// ============================================================
//  PUBLIC API  (React cache + Next.js unstable_cache)
// ============================================================
export const getTasks = cache(async (opts: GetTasksOptions, providedUserId?: string) => {
    const { workspaceId, projectId } = opts;

    // --- Normalization ---
    if (opts.cursor && typeof opts.cursor.createdAt === 'string') {
        opts.cursor.createdAt = new Date(opts.cursor.createdAt);
    }

    // --- Auth + Permission Resolution ---
    const {
        permissions,
        isWorkspaceAdmin,
        authorizedProjectIds,
        fullAccessProjectIds,
        restrictedProjectIds
    } = await resolveTaskPermissions(workspaceId, projectId, providedUserId);

    if (!permissions.workspaceMemberId || (!isWorkspaceAdmin && authorizedProjectIds.length === 0)) {
        return {
            tasks: [],
            totalCount: 0,
            hasMore: false,
            nextCursor: null,
            facets: { status: {}, assignee: {}, tags: {}, projects: {} },
        };
    }

    // --- Cache key construction ---
    const sig = buildQuerySignature(workspaceId, projectId, { fullAccessProjectIds, restrictedProjectIds }, opts);
    const cacheKey = `tasks-v11-${workspaceId}-${isWorkspaceAdmin ? 'admin' : 'user'}-${permissions.workspaceMember.userId}-${sig}`;

    const tags = projectId
        ? CacheTags.projectTasks(projectId, permissions.workspaceMember.userId)
        : CacheTags.workspaceTasks(workspaceId, permissions.workspaceMember.userId);

    let res;
    // 🚀 BYPASS For Server Actions or single user loads 
    if (providedUserId) {
        res = await _getTasksInternal(
            workspaceId,
            permissions.workspaceMember!.userId,
            isWorkspaceAdmin,
            fullAccessProjectIds,
            restrictedProjectIds,
            opts
        );
    } else {
        res = await unstable_cache(
            () => _getTasksInternal(
                workspaceId,
                permissions.workspaceMember!.userId,
                isWorkspaceAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                opts
            ),
            [cacheKey],
            { tags, revalidate: 30 }
        )();
    }

    // Strip reviewer from parent tasks to save payload bandwidth per exact request
    if (res && res.tasks) {
        res.tasks.forEach((t: any) => {
            if (t.isParent) {
                delete t.reviewer;
                delete (t as any).reviewerId;
            }
        });
    }

    return res;
});

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
export type GetTasksTask = NonNullable<GetTasksResponse>["tasks"][number];
