"use server";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import crypto from "crypto";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { CacheTags } from "@/data/cache-tags";
import {
    TASK_CORE_SELECT,
    TaskCursor,
    buildProjectRootWhere,
    buildSubtaskExpansionWhere,
    buildWorkspaceFilterWhere,
    WorkspaceFilterOpts,
} from "@/lib/tasks/query-builder";
import {
    batchLoadUsers,
    batchLoadTags,
    batchLoadProjects,
    hydrateTasks,
} from "@/lib/tasks/batch-loader";

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
    expandedProjectIds?: string[];
    page?: number;
    limit?: number;

    includeFacets?: boolean;
    view_mode?: "default" | "search";
}
const toArray = <T>(v: T | T[] | undefined): T[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];

const toDate = (d: string | Date | undefined) => (d ? new Date(d) : undefined);

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


const ORDER_BY_CREATED_DESC = [{ createdAt: "desc" as const }, { id: "asc" as const }];

/**
 * Normalizes query options into a stable signature object for better cache hit ratios.
 */
function buildQuerySignature(
    workspaceId: string,
    projectId: string | undefined,
    permissionScope: { fullAccessProjectIds: string[], restrictedProjectIds: string[] } | string,
    opts: GetTasksOptions
) {
    // 1. Extract and normalize filters
    const f: Record<string, any> = {};

    // Array filters - sort for stability
    const sortArr = (val: any) => (Array.isArray(val) ? [...val].sort() : val);

    if (opts.status) f.st = sortArr(opts.status);
    if (opts.assigneeId) f.as = sortArr(opts.assigneeId);
    if (opts.tagId) f.tg = sortArr(opts.tagId);
    if (opts.search) f.q = opts.search.trim().toLowerCase();
    if (opts.dueAfter) f.da = new Date(opts.dueAfter).getTime();
    if (opts.dueBefore) f.db = new Date(opts.dueBefore).getTime();

    if (opts.hierarchyMode) f.hm = opts.hierarchyMode;
    if (opts.groupBy) f.gb = opts.groupBy;
    if (opts.filterParentTaskId) f.pt = opts.filterParentTaskId;
    if (opts.expandedProjectIds) f.ep = sortArr(opts.expandedProjectIds);
    const signature = {
        ws: workspaceId,
        p: projectId ?? "all",
        ps: permissionScope,
        f,
        c: opts.cursor?.id ?? null,
        l: opts.limit ?? 20,
    };

    // 3. Hash the signature
    return crypto.createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

export async function resolveTaskPermissions(workspaceId: string, projectId?: string) {
    let permissions: any;
    let isWorkspaceAdmin = false;
    let authorizedProjectIds: string[] = [];

    if (projectId) {
        permissions = await getUserPermissions(workspaceId, projectId);
        isWorkspaceAdmin = permissions.isWorkspaceAdmin;

        const hasFullAccess =
            isWorkspaceAdmin ||
            permissions.isProjectLead ||
            permissions.isProjectManager;

        return {
            permissions,
            isWorkspaceAdmin,
            authorizedProjectIds: [projectId],
            fullAccessProjectIds: hasFullAccess ? [projectId] : [],
            restrictedProjectIds: hasFullAccess ? [] : [projectId]
        };
    } else {
        const wsPerms = await getWorkspacePermissions(workspaceId);
        permissions = wsPerms;
        isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;

        if (isWorkspaceAdmin) {
            authorizedProjectIds = [];
        } else {
            const myProjects = await prisma.projectMember.findMany({
                where: { workspaceMemberId: permissions.workspaceMemberId, hasAccess: true },
                select: { projectId: true },
            });
            authorizedProjectIds = myProjects.map(p => p.projectId);
        }

        const fullAccessProjectIds = [
            ...(wsPerms.leadProjectIds ?? []),
            ...(wsPerms.managedProjectIds ?? [])
        ];

        const restrictedProjectIds = authorizedProjectIds.filter(
            id => !fullAccessProjectIds.includes(id)
        );

        return {
            permissions,
            isWorkspaceAdmin,
            authorizedProjectIds,
            fullAccessProjectIds,
            restrictedProjectIds
        };
    }
}

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
    const limit = opts.limit ?? 20;
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

    const countWhere = { ...where };
    console.log(`[PRISMA PROJECT ROOT] where:`, JSON.stringify(where, null, 2));
    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: TASK_CORE_SELECT,
            orderBy: ORDER_BY_CREATED_DESC,
            take: limit + 1,
        }),
        opts.cursor
            ? Promise.resolve(null as number | null)
            : prisma.task.count({ where: countWhere }),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? { id: rawTasks[rawTasks.length - 1].id, createdAt: rawTasks[rawTasks.length - 1].createdAt }
        : null;

    const [userMap, tagMap, projectMap] = await Promise.all([
        batchLoadUsers([
            ...rawTasks.map(t => t.assigneeTo),
            ...rawTasks.map(t => t.reviewerId),
            ...rawTasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawTasks.map(t => t.tagId)),
        batchLoadProjects(rawTasks.map(t => t.projectId)),
    ]);

    const tasks = hydrateTasks(rawTasks, userMap, tagMap, projectMap);

    return { tasks, totalCount, hasMore, nextCursor };
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
        status,
        assigneeId,
        cursor: opts.cursor,
    });

    console.log(`[PRISMA SUBTASKS] where:`, JSON.stringify(where, null, 2));
    const rawSubtasks = await prisma.task.findMany({
        where,
        select: TASK_CORE_SELECT,
        orderBy: ORDER_BY_CREATED_DESC,
        take: limit + 1,
    });

    const hasMore = rawSubtasks.length > limit;
    if (hasMore) rawSubtasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? { id: rawSubtasks[rawSubtasks.length - 1].id, createdAt: rawSubtasks[rawSubtasks.length - 1].createdAt }
        : null;

    const [userMap, tagMap] = await Promise.all([
        batchLoadUsers([
            ...rawSubtasks.map(t => t.assigneeTo),
            ...rawSubtasks.map(t => t.reviewerId),
            ...rawSubtasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawSubtasks.map(t => t.tagId)),
    ]);

    const emptyProjectMap = new Map<string, any>();
    const tasks = hydrateTasks(rawSubtasks, userMap, tagMap, emptyProjectMap);

    return { tasks, hasMore, nextCursor };
}

// ============================================================
//  VIEW 3: FILTERED HIERARCHY  (Subtask-First strategy)
//  Used when filters are present to find matching subtasks
//  while still returning a parent-based tree.
// ============================================================
async function _fetchFilteredHierarchy(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 20;

    const start = toUTCDateOnly(opts.dueAfter);
    const end = toUTCDateOnly(opts.dueBefore);

    const normalizedStart = start;
    const normalizedEnd = end ? addOneDayUTC(end) : undefined;

    const filterOpts: WorkspaceFilterOpts = {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: normalizedStart,
        dueBefore: normalizedEnd,
        search: opts.search,
        cursor: opts.cursor,
        isAdmin,
        fullAccessProjectIds,
        restrictedProjectIds,
        projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
    };

    // Unified Strategy: Find ANY task matching the filters at any level.
    const matchWhere = buildWorkspaceFilterWhere({
        ...filterOpts,
        onlyParents: false,
        onlySubtasks: false,
    }, userId);

    console.log(`[PRISMA HIERARCHY-MATCH] where:`, JSON.stringify(matchWhere, null, 2));

    // Step 2: Get unique parent IDs for all matching tasks.
    // If a subtask matches, its parentTaskId is the group basis.
    // If a parent task matches, its id is the group basis.
    const matches = await prisma.task.findMany({
        where: matchWhere,
        select: { id: true, parentTaskId: true },
        take: 100, // Fetch a reasonable set of matches to find parent groups
    });

    const parentIds = Array.from(new Set(
        matches.map(m => m.parentTaskId || m.id)
    )).slice(0, limit);

    // Step 3: Fetch the Parents
    const rawParents = await prisma.task.findMany({
        where: { id: { in: parentIds } },
        select: TASK_CORE_SELECT,
        orderBy: ORDER_BY_CREATED_DESC,
    });

    // Step 4: Fetch matching tasks for these parents (can be parents themselves or their children)
    const matchingTasks = await prisma.task.findMany({
        where: {
            ...matchWhere,
            OR: [
                { id: { in: parentIds } },
                { parentTaskId: { in: parentIds } }
            ]
        },
        select: TASK_CORE_SELECT,
        orderBy: ORDER_BY_CREATED_DESC,
    });

    // Hydration Logic
    const allRaw = [...rawParents, ...matchingTasks];
    const [userMap, tagMap, projectMap] = await Promise.all([
        batchLoadUsers([
            ...allRaw.map(t => t.assigneeTo),
            ...allRaw.map(t => t.reviewerId),
            ...allRaw.map(t => t.createdById),
        ]),
        batchLoadTags(allRaw.map(t => t.tagId)),
        batchLoadProjects(allRaw.map(t => t.projectId)),
    ]);

    const hydratedParents = hydrateTasks(rawParents, userMap, tagMap, projectMap);
    const hydratedMatching = hydrateTasks(matchingTasks, userMap, tagMap, projectMap);

    // Grouping: Attach matching tasks to their parents
    const subtaskGrouped = new Map<string, any[]>();
    hydratedMatching.forEach(task => {
        if (!task.parentTaskId) return; // Top level matches are already in rawParents
        if (!subtaskGrouped.has(task.parentTaskId)) subtaskGrouped.set(task.parentTaskId, []);
        subtaskGrouped.get(task.parentTaskId)!.push(task);
    });

    const tasks = hydratedParents.map(p => ({
        ...p,
        subTasks: subtaskGrouped.get(p.id) || []
    }));

    const hasMore = matches.length > limit;
    const totalCount = await prisma.task.count({ where: matchWhere });

    const nextCursor: TaskCursor | null = hasMore && tasks.length > 0
        ? { id: tasks[tasks.length - 1].id, createdAt: tasks[tasks.length - 1].createdAt }
        : null;

    return { tasks, totalCount, hasMore, nextCursor };
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
    const limit = opts.limit ?? 20;

    const start = toUTCDateOnly(opts.dueAfter);
    const end = toUTCDateOnly(opts.dueBefore);

    const normalizedStart = start;
    const normalizedEnd = end ? addOneDayUTC(end) : undefined;

    const filterOpts: WorkspaceFilterOpts = {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: normalizedStart,
        dueBefore: normalizedEnd,
        search: opts.search,
        cursor: opts.cursor,
        isAdmin,
        fullAccessProjectIds,
        restrictedProjectIds,
        projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
        onlyParents: opts.onlyParents,
        excludeParents: opts.excludeParents,
        onlySubtasks: opts.onlySubtasks,
    };

    // --- STRATEGY: FLAT FILTER ---
    // Used for Kanban, Sorted lists, or search results that don't require parent grouping
    const where = buildWorkspaceFilterWhere(filterOpts, userId);

    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: TASK_CORE_SELECT,
            orderBy: ORDER_BY_CREATED_DESC,
            take: limit + 1,
        }),
        opts.cursor ? Promise.resolve(null) : prisma.task.count({ where }),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? { id: rawTasks[rawTasks.length - 1].id, createdAt: rawTasks[rawTasks.length - 1].createdAt }
        : null;

    const [userMap, tagMap, projectMap] = await Promise.all([
        batchLoadUsers([
            ...rawTasks.map(t => t.assigneeTo),
            ...rawTasks.map(t => t.reviewerId),
            ...rawTasks.map(t => t.createdById),
        ]),
        batchLoadTags(rawTasks.map(t => t.tagId)),
        batchLoadProjects(rawTasks.map(t => t.projectId)),
    ]);

    const tasks = hydrateTasks(rawTasks, userMap, tagMap, projectMap);
    return { tasks, totalCount, hasMore, nextCursor };
}

// ============================================================
//  FACETS  (sidebar filter counts — runs parallel to main query)
//  Uses same WHERE but skips cursor and groups by field
// ============================================================
async function _fetchFacets(
    where: Prisma.TaskWhereInput,
    includeProjects: boolean
) {
    const [statusCounts, assigneeCounts, tagCounts, projectCounts] = await Promise.all([
        prisma.task.groupBy({ by: ["status"], where, _count: { status: true } }),
        prisma.task.groupBy({ by: ["assigneeTo"], where, _count: { assigneeTo: true } }),
        prisma.task.groupBy({ by: ["tagId"], where, _count: { tagId: true } }),
        includeProjects
            ? prisma.task.groupBy({ by: ["projectId"], where, _count: { projectId: true } })
            : Promise.resolve([]),
    ]);

    const fmt = (arr: any[], key: string) =>
        arr.reduce((acc: any, cur: any) => ({
            ...acc,
            [cur[key] || "unassigned"]: cur._count[key],
        }), {});

    return {
        status: fmt(statusCounts, "status"),
        assignee: fmt(assigneeCounts, "assigneeTo"),
        tags: fmt(tagCounts, "tagId"),
        projects: fmt(projectCounts, "projectId"),
    };
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
    const { projectId, hierarchyMode, filterParentTaskId, includeFacets } = opts;

    const hasExplicitFilters =
        !!(
            (opts.status && toArray(opts.status)?.length) ||
            (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
            (opts.tagId && toArray(opts.tagId)?.length) ||
            (opts.search && opts.search.trim().length > 0) ||
            opts.dueAfter ||
            opts.dueBefore
        );

    const emptyFacets = { status: {}, assignee: {}, tags: {}, projects: {} };

    /**
     * SAFETY GUARD: Prevent accidental global load
     * Workspace mode without project and without filters should return nothing
     */
    if (!projectId && !hasExplicitFilters && !opts.expandedProjectIds?.length) {
        return {
            tasks: [],
            totalCount: 0,
            hasMore: false,
            nextCursor: null,
            facets: emptyFacets,
        };
    }
    if (filterParentTaskId) {
        const result = await _fetchSubtasks(
            filterParentTaskId, userId, isAdmin,
            fullAccessProjectIds, restrictedProjectIds, opts
        );
        return { ...result, totalCount: null, facets: emptyFacets };
    }

    /**
     * STRATEGY B: Project Landing Page (Parents only, no filters)
     * Direct index scan on (projectId, isParent, status)
     */
    if (projectId && !hasExplicitFilters && (hierarchyMode === "parents" || !hierarchyMode)) {
        const result = await _fetchProjectRoot(
            projectId, workspaceId, userId, isAdmin,
            fullAccessProjectIds, restrictedProjectIds, opts
        );
        return { ...result, facets: emptyFacets };
    }

    /**
     * STRATEGY C: Filtered Hierarchy (Subtask-First)
     * Used in List/Gantt views when active filters are present.
     */
    if (hasExplicitFilters && (hierarchyMode === "parents" || !hierarchyMode)) {
        const result = await _fetchFilteredHierarchy(
            workspaceId, userId, isAdmin,
            fullAccessProjectIds, restrictedProjectIds, opts
        );
        return { ...result, facets: emptyFacets };
    }

    /**
     * STRATEGY D: Flat Workspace Filter / Kanban / Search Mode
     * Cross-hierarchy query using Workspace filter builder
     */
    const filterResult = await _fetchWorkspaceFilter(
        workspaceId, userId, isAdmin,
        fullAccessProjectIds, restrictedProjectIds,
        {
            ...opts,
            onlyParents: opts.onlyParents || (hierarchyMode === "parents"),
            excludeParents: opts.excludeParents,
            onlySubtasks: opts.onlySubtasks || (hierarchyMode === "children")
        }
    );

    // Optional facets (sidebar counts)
    let facets = emptyFacets;
    if (includeFacets && !opts.cursor) {
        const facetWhere = buildWorkspaceFilterWhere(
            {
                workspaceId,
                projectId,
                assigneeId: toArray(opts.assigneeId),
                status: toArray(opts.status),
                tagId: toArray(opts.tagId),
                dueAfter: toUTCDateOnly(opts.dueAfter),
                dueBefore: opts.dueBefore ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!) : undefined,
                search: opts.search,
                isAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                projectIds: (!opts.projectId && opts.expandedProjectIds?.length) ? opts.expandedProjectIds : undefined,
            },
            userId
        );
        facets = await _fetchFacets(facetWhere, !projectId);
    }

    return { ...filterResult, facets };
}

// ============================================================
//  PUBLIC API  (React cache + Next.js unstable_cache)
// ============================================================
export const getTasks = cache(async (opts: GetTasksOptions) => {
    const { workspaceId, projectId } = opts;

    // --- Auth + Permission Resolution ---
    const {
        permissions,
        isWorkspaceAdmin,
        authorizedProjectIds,
        fullAccessProjectIds,
        restrictedProjectIds
    } = await resolveTaskPermissions(workspaceId, projectId);

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

    return await unstable_cache(
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
});

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
export type GetTasksTask = NonNullable<GetTasksResponse>["tasks"][number];
