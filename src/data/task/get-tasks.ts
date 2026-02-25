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
    buildOrderBy,
    SortConfig,
} from "@/lib/tasks/query-builder";
import {
    batchLoadUsers,
    batchLoadTags,
    batchLoadProjects,
    hydrateTasks,
} from "@/lib/tasks/batch-loader";

export type TaskViewType = "list" | "kanban" | "gantt" | "calendar";

// ============================================================
//  PUBLIC OPTIONS INTERFACE
// ============================================================
export interface GetTasksOptions {
    workspaceId: string;
    projectId?: string;
    hierarchyMode?: "parents" | "children" | "all";
    groupBy?: "status";
    adminScope?: boolean;

    // Filters
    status?: string | string[];
    permissionStatus?: string | string[]; // legacy alias
    assigneeId?: string | string[];
    tagId?: string | string[];
    /** @deprecated use tagId */
    tag?: string | string[];
    search?: string;
    dueAfter?: string | Date;
    dueBefore?: string | Date;
    /** @deprecated use dueAfter */
    startDate?: string | Date;
    /** @deprecated use dueBefore */
    endDate?: string | Date;
    isPinned?: boolean; // field removed from DB — accepted but ignored

    // Hierarchy
    filterParentTaskId?: string;
    onlyParents?: boolean;
    excludeParents?: boolean;
    onlySubtasks?: boolean;

    // Pagination — cursor preferred
    cursor?: TaskCursor;
    limit?: number;

    // Sorting
    sorts?: any[]; // Replace any with proper SortConfig if needed, but any[] is safer for now to avoid circular deps

    // UI flags
    includeFacets?: boolean;
    view_mode?: "default" | "search";
}

// ============================================================
//  HELPERS
// ============================================================
const toArray = <T>(v: T | T[] | undefined): T[] | undefined =>
    v === undefined ? undefined : Array.isArray(v) ? v : [v];

const toDate = (d: string | Date | undefined) => (d ? new Date(d) : undefined);

const ORDER_BY_CREATED_DESC = [{ createdAt: "desc" as const }, { id: "asc" as const }];

/**
 * Normalizes query options into a stable signature object for better cache hit ratios.
 */
function buildQuerySignature(
    workspaceId: string,
    projectId: string | undefined,
    tier: string,
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

    // Hierarchy flags
    if (opts.hierarchyMode) f.hm = opts.hierarchyMode;
    if (opts.groupBy) f.gb = opts.groupBy;
    if (opts.filterParentTaskId) f.pt = opts.filterParentTaskId;

    // 2. Sorting
    if (opts.sorts) f.srt = opts.sorts;

    // 3. Build root signature
    const effectiveProjectId = projectId && projectId !== "" ? projectId : undefined;

    const signature = {
        ws: workspaceId,
        p: effectiveProjectId ?? "all",
        tier,
        f,
        c: opts.cursor?.id ?? null,
        l: opts.limit ?? 20,
    };

    // 4. Hash the signature
    return crypto.createHash("sha256").update(JSON.stringify(signature)).digest("hex");
}

/**
 * Resolves effective permissions (tier, authorized projects, lead projects)
 */
export async function resolveTaskPermissions(workspaceId: string, projectIdInput?: string) {
    const projectId = projectIdInput && projectIdInput !== "" ? projectIdInput : undefined;
    let permissions: any;
    let leadProjectIds: string[] = [];
    let isWorkspaceAdmin = false;
    let authorizedProjectIds: string[] = [];

    if (projectId) {
        permissions = await getUserPermissions(workspaceId, projectId);
        isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        authorizedProjectIds = [projectId];
        if (permissions.isProjectLead || permissions.isProjectManager) {
            leadProjectIds = [projectId];
        }
    } else {
        const wsPerms = await getWorkspacePermissions(workspaceId);
        permissions = wsPerms;
        isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;
        leadProjectIds = [...(wsPerms.leadProjectIds ?? []), ...(wsPerms.managedProjectIds ?? [])];

        if (isWorkspaceAdmin) {
            authorizedProjectIds = [];
        } else {
            const myProjects = await prisma.projectMember.findMany({
                where: { workspaceMemberId: permissions.workspaceMemberId, hasAccess: true },
                select: { projectId: true },
            });
            authorizedProjectIds = myProjects.map(p => p.projectId);
        }
    }

    const fullAccessIds = isWorkspaceAdmin
        ? authorizedProjectIds
        : leadProjectIds.filter(id => authorizedProjectIds.includes(id));

    const tier: "admin" | "lead" | "member" = isWorkspaceAdmin ? "admin" : fullAccessIds.length > 0 ? "lead" : "member";

    return {
        permissions,
        isWorkspaceAdmin,
        leadProjectIds,
        authorizedProjectIds,
        fullAccessIds,
        tier
    };
}

// ============================================================
//  VIEW 1: PROJECT ROOT  (Parent Tasks — initial load)
//  Index:  (projectId, isParent, status, createdAt DESC)
// ============================================================
async function _fetchProjectRoot(
    projectId: string,
    workspaceId: string,
    userId: string,
    permissionMode: "admin" | "lead" | "member",
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 20;
    const status = toArray(opts.status);
    const assigneeIds = toArray(opts.assigneeId);

    // For members, always scope to their own tasks
    const assigneeFilter =
        permissionMode === "member"
            ? userId
            : assigneeIds && assigneeIds.length > 0
                ? assigneeIds[0] // single-assignee fast path
                : undefined;

    const where = buildProjectRootWhere(projectId, {
        status,
        assigneeId: assigneeFilter,
        cursor: opts.cursor,
    });

    // For multi-assignee filter (admin/lead), override
    if (permissionMode !== "member" && assigneeIds && assigneeIds.length > 1) {
        where.assigneeTo = { in: assigneeIds };
        delete where.OR; // clear cursor-OR if needed (reassigned below)
    }

    const countWhere = { ...where };
    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: TASK_CORE_SELECT,
            orderBy: buildOrderBy(opts.sorts),
            take: limit + 1,
        }),
        opts.cursor
            ? Promise.resolve(null as number | null)
            : prisma.task.count({ where: countWhere }),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const nextCursor: TaskCursor | null = hasMore
        ? {
            id: rawTasks[rawTasks.length - 1].id,
            createdAt: rawTasks[rawTasks.length - 1].createdAt,
            // Include sorted field value for stable keyset pagination
            ...(opts.sorts?.[0] ? { [opts.sorts[0].field]: (rawTasks[rawTasks.length - 1] as any)[opts.sorts[0].field] } : {})
        }
        : null;

    // Batch load related entities
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

    return {
        tasks,
        totalCount,
        hasMore,
        nextCursor,
    };
}

// ============================================================
//  VIEW 2: SUBTASK EXPANSION  (Children of a Parent)
//  Index: (parentTaskId, createdAt)
// ============================================================
async function _fetchSubtasks(
    parentTaskId: string,
    userId: string,
    permissionMode: "admin" | "lead" | "member",
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 30;
    const status = toArray(opts.status);

    const where = buildSubtaskExpansionWhere(parentTaskId, {
        status,
        assigneeId: permissionMode === "member" ? userId : undefined,
        cursor: opts.cursor,
    });

    const rawSubtasks = await prisma.task.findMany({
        where,
        select: TASK_CORE_SELECT,
        orderBy: buildOrderBy(opts.sorts),
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

    // No project batch needed — subtasks inherit parent's project
    const emptyProjectMap = new Map<string, any>();
    const tasks = hydrateTasks(rawSubtasks, userMap, tagMap, emptyProjectMap);

    return { tasks, hasMore, nextCursor };
}

// ============================================================
//  VIEW 3: WORKSPACE FILTER  (Search/My Tasks/Cross-project)
//  Index: (workspaceId, assigneeTo, status, createdAt)
//      OR (projectId, assigneeTo, status, createdAt)  — project-scoped
// ============================================================
async function _fetchWorkspaceFilter(
    workspaceId: string,
    userId: string,
    permissionMode: "admin" | "lead" | "member",
    authorizedProjectIds: string[],
    opts: GetTasksOptions
) {
    const limit = opts.limit ?? 20;
    const now = new Date();

    const rawStart = toDate(opts.dueAfter as any);
    const rawEnd = toDate(opts.dueBefore as any);
    if (rawStart) rawStart.setHours(0, 0, 0, 0);
    if (rawEnd) rawEnd.setHours(23, 59, 59, 999);

    const filterOpts: WorkspaceFilterOpts = {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: rawStart,
        dueBefore: rawEnd,
        search: opts.search,
        cursor: opts.cursor,
        authorizedProjectIds,
        adminScope: opts.adminScope,
        onlyParents: opts.onlyParents,
        excludeParents: opts.excludeParents,
        onlySubtasks: opts.onlySubtasks,
    };

    const where = buildWorkspaceFilterWhere(filterOpts, permissionMode, userId);

    const [rawTasks, totalCount] = await Promise.all([
        prisma.task.findMany({
            where,
            select: TASK_CORE_SELECT,
            orderBy: buildOrderBy(opts.sorts),
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
    // Only run facets if we have a reasonably specific scope (e.g. workspaceId)
    // to avoid accidental full-table scans if the query builder fails.
    if (!where.workspaceId && !where.projectId) return { status: {}, assignee: {}, tags: {}, projects: {} };

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
            [cur[key] || "unassigned"]: cur._count[key] ?? cur._count?.[key] ?? 0,
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
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    leadProjectIds: string[],
    authorizedProjectIds: string[],
    opts: GetTasksOptions
) {
    const { projectId, hierarchyMode, filterParentTaskId, includeFacets } = opts;

    // 1. Determine permission tier
    const fullAccessIds = isAdmin
        ? authorizedProjectIds
        : leadProjectIds.filter(id => authorizedProjectIds.includes(id));

    const permissionMode: "admin" | "lead" | "member" =
        isAdmin ? "admin" :
            fullAccessIds.length > 0 ? "lead" : "member";

    // 2. Identify strategy based on intent/filters
    const hasExplicitFilters =
        opts.assigneeId || opts.status || opts.tagId ||
        opts.search || opts.dueAfter || opts.dueBefore;

    const emptyFacets = { status: {}, assignee: {}, tags: {}, projects: {} };

    /**
     * STRATEGY A: Explicit Parent Task ID (Infinite scroll / row expansion)
     */
    if (filterParentTaskId) {
        const result = await _fetchSubtasks(filterParentTaskId, userId, permissionMode, opts);
        return { ...result, totalCount: null, facets: emptyFacets };
    }

    /**
     * STRATEGY B: Project Landing Page (Parents only, no filters)
     * Direct index scan on (projectId, isParent, status)
     */
    if (projectId && !hasExplicitFilters && (hierarchyMode === "parents" || !hierarchyMode)) {
        const result = await _fetchProjectRoot(projectId, workspaceId, userId, permissionMode, opts);
        return { ...result, facets: emptyFacets };
    }

    /**
     * STRATEGY C: Filtered / Search / Workspace-wide / Kanban / Subtasks-only
     * Cross-hierarchy query using Workspace filter builder
     */
    const filterResult = await _fetchWorkspaceFilter(
        workspaceId,
        userId,
        permissionMode,
        authorizedProjectIds,
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
                dueAfter: toDate(opts.dueAfter as any),
                dueBefore: toDate(opts.dueBefore as any),
                search: opts.search,
                authorizedProjectIds,
                adminScope: opts.adminScope,
            },
            permissionMode,
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
    const { workspaceId } = opts;
    const projectId = opts.projectId && opts.projectId !== "" ? opts.projectId : undefined;

    // --- Auth + Permission Resolution ---
    const {
        permissions,
        isWorkspaceAdmin,
        leadProjectIds,
        authorizedProjectIds,
        tier
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
    const sig = buildQuerySignature(workspaceId, projectId, tier, opts);
    const cacheKey = `tasks-v10-${workspaceId}-${tier}-${permissions.workspaceMember.userId}-${sig}`;

    const tags = projectId
        ? CacheTags.projectTasks(projectId, permissions.workspaceMember.userId)
        : CacheTags.workspaceTasks(workspaceId, permissions.workspaceMember.userId);

    return await unstable_cache(
        () => _getTasksInternal(
            workspaceId,
            permissions.workspaceMemberId!,
            permissions.workspaceMember!.userId,
            isWorkspaceAdmin,
            leadProjectIds,
            authorizedProjectIds,
            { ...opts, adminScope: isWorkspaceAdmin }
        ),
        [cacheKey],
        { tags, revalidate: 30 }
    )();
});

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
export type GetTasksTask = NonNullable<GetTasksResponse>["tasks"][number];
