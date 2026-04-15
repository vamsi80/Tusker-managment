import { Prisma } from "@/generated/prisma";

export function getTaskSelect(view_mode: string = "list"): Prisma.TaskSelect {
    const isList = view_mode === "list" || view_mode === "default" || !view_mode;
    const isKanban = view_mode === "kanban";
    const isGantt = view_mode === "gantt";
    const isCalendar = view_mode === "calendar";
    const isSearch = view_mode === "search";
    const isSubtask = view_mode === "subtask";

    // 1. Core fields required everywhere
    const select: Prisma.TaskSelect = {
        id: true,
        name: true,
        taskSlug: true,
        status: true,
        dueDate: true,
        subtaskCount: true,
        completedSubtaskCount: true,
        tagId: true,
        description: true,
        startDate: true,
        days: true,

        // Always include basic assignee info
        assignee: {
            select: {
                workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } }
            }
        },

        createdAt: true,
        createdById: true,
        projectId: true,
        parentTaskId: true,
        isParent: true,
        assigneeId: true
    };

    // Include detailed createdBy only if NOT in Gantt view to save on payload/joins
    if (!isGantt) {
        select.createdBy = {
            select: {
                workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } }
            }
        };
    }

    // 2. Metadata: Tags & Comment Counts
    // Uniformly added to most views for UI consistency
    // Omit for Gantt and Subtasks to reduce payload bloat
    if (isList || isKanban || isSearch || isCalendar) {
        select._count = {
            select: {
                activities: true,
                subTasks: true
            }
        };
        select.tag = { select: { name: true } };
    }

    // 3. Project & Parent Context
    // Essential for workspace views and search results
    // Omit for Gantt and Subtasks to reduce payload bloat
    if (isKanban || isSearch || isList || isCalendar) {
        select.project = {
            select: { name: true, color: true }
        };
        select.parentTask = {
            select: { name: true }
        };
    }

    // 4. Extended Info: Description & Reviewer
    if (isList || isSearch || isCalendar || isGantt || isSubtask) {
        select.reviewer = {
            select: {
                workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } }
            }
        };
    }

    // 5. specialized view fields
    if (isList || isGantt || isCalendar || isSubtask) {
        select.position = true;
    }

    if (isGantt) {
        select.Task_TaskDependency_A = {
            select: { id: true }
        };
    }

    return select;
}


// Keep a default for simple migrations
export const TASK_CORE_SELECT = getTaskSelect("list");

// ============================================================
//  TYPE: Cursor for pagination
// ============================================================
export interface TaskCursor {
    id: string;
    createdAt: Date;
}

/**
 * Normalizes assignee filtering by checking both the dual keys (member PK and user UID).
 */
export function buildAssigneeFilter(memberIdOrUserId: string | string[]): Prisma.TaskWhereInput {
    const isMany = Array.isArray(memberIdOrUserId);
    const idFilter = isMany ? { in: memberIdOrUserId as string[] } : memberIdOrUserId;

    return {
        OR: [
            { assigneeId: idFilter as any },
            { assignee: { workspaceMember: { userId: idFilter as any } } },
        ],
    };
}

/**
 * Checks if a user is an assignee of a task OR any of its subtasks.
 */
export function buildParentAssigneeFilter(memberIdOrUserId: string | string[]): Prisma.TaskWhereInput {
    const leaf = buildAssigneeFilter(memberIdOrUserId);
    return {
        OR: [
            leaf,
            { subTasks: { some: leaf } }
        ],
    };
}

/**
 * Safely merge conditions into where.AND without blowing away existing clauses.
 */
export function appendAnd(where: Prisma.TaskWhereInput, ...conditions: Prisma.TaskWhereInput[]): void {
    const existing = where.AND
        ? (Array.isArray(where.AND) ? where.AND : [where.AND])
        : [];
    where.AND = [...existing, ...conditions] as any;
}

/**
 * Build a standard createdAt DESC cursor condition.
 */
export function buildCursorWhere(cursor: TaskCursor): Prisma.TaskWhereInput {
    return {
        OR: [
            { createdAt: { lt: cursor.createdAt } },
            { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
        ],
    };
}

// ============================================================
//  SORTING CONTRACT
// ============================================================
export const SORT_MAP: Record<string, { dbField: string; nulls?: "last" | "first" }> = {
    name: { dbField: "name" },
    status: { dbField: "status", nulls: "last" },
    dueDate: { dbField: "dueDate", nulls: "last" },
    startDate: { dbField: "startDate", nulls: "last" },
    createdAt: { dbField: "createdAt" },
    assignee: { dbField: "assigneeId", nulls: "last" },
    reviewer: { dbField: "reviewerId", nulls: "last" },
};

export function buildOrderBy(sorts?: Array<{ field: string; direction: "asc" | "desc" }>) {
    if (!sorts || sorts.length === 0) {
        return [{ createdAt: "desc" as const }, { id: "desc" as const }];
    }

    const { field, direction } = sorts[0];
    const def = SORT_MAP[field];

    if (!def) {
        throw new Error(`[buildOrderBy] Invalid sort field: "${field}"`);
    }

    const primary: any = def.nulls
        ? { [def.dbField]: { sort: direction, nulls: def.nulls } }
        : { [def.dbField]: direction };

    return [primary, { id: "desc" as const }];
}

export function buildSeekCondition(
    sorts: Array<{ field: string; direction: "asc" | "desc" }>,
    cursor: any
): Prisma.TaskWhereInput {
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
            return {
                AND: [{ [dbField]: null }, { id: { lt: lastId } }],
            };
        }

        const conditions: any[] = [
            { [dbField]: { [op]: lastFieldValue } },
            {
                AND: [{ [dbField]: lastFieldValue }, { id: { lt: lastId } }],
            },
        ];

        if (def.nulls === "last") {
            conditions.push({ [dbField]: null });
        }

        return { OR: conditions };
    } catch (err) {
        console.error("[buildSeekCondition] Error:", err);
        return {};
    }
}

// ============================================================
//  DATE UTILITIES
// ============================================================

export const toUTCDateOnly = (input: string | Date | undefined) => {
    if (!input) return undefined;
    const d = new Date(input);
    if (typeof input !== "string") {
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export const addOneDayUTC = (date: Date) => new Date(date.getTime() + 24 * 60 * 60 * 1000);

// ============================================================
//  QUERY BUILDER: Project Root (Parent Tasks Only)
//  INDEX USED: (projectId, isParent, status, createdAt DESC)
// ============================================================
export function buildProjectRootWhere(
    projectId: string,
    opts: {
        status?: string[];
        assigneeId?: string | string[];   // null = unfiltered (admin/lead sees all)
        cursor?: TaskCursor;
        userId?: string;
        isAdmin?: boolean;
        fullAccessProjectIds?: string[];
    }
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
        projectId,
        isParent: true,     // ← prefix match on index col 2
        parentTaskId: null, // redundant safety guard
    };

    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    const isRestricted = opts.userId && !opts.isAdmin && (!opts.fullAccessProjectIds || !opts.fullAccessProjectIds.includes(projectId));

    if (isRestricted && opts.userId) {
        appendAnd(where, buildParentAssigneeFilter(opts.userId));
    }

    if (opts.assigneeId) {
        appendAnd(where, buildParentAssigneeFilter(opts.assigneeId));
    }

    if (opts.cursor) {
        appendAnd(where, buildCursorWhere(opts.cursor));
    }

    return where;
}

// ============================================================
//  QUERY BUILDER: Subtask Expansion (Children of a Parent)
//  INDEX USED: (parentTaskId, createdAt)
// ============================================================
export function buildSubtaskExpansionWhere(
    parentTaskId: string | undefined,
    opts: {
        parentIds?: string[];
        assigneeId?: string | string[];  // member constraint or filter
        status?: string[];
        tagId?: string[];
        search?: string;
        dueAfter?: Date;
        dueBefore?: Date;
        cursor?: TaskCursor;
        userId?: string;
        isAdmin?: boolean;
        isRestrictedMember?: boolean; // explicitly pass this for subtasks
    }
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    if (parentTaskId) {
        where.parentTaskId = parentTaskId;
    } else if (opts.parentIds && opts.parentIds.length > 0) {
        where.parentTaskId = { in: opts.parentIds };
    }

    // Status filter
    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    // Tag filter
    if (opts.tagId && opts.tagId.length > 0) {
        where.tagId = { in: opts.tagId };
    }

    const assigneeClauses: Prisma.TaskWhereInput[] = [];

    // Assignee filter: Support both ProjectMemberId and User ID (relational)
    if (opts.isRestrictedMember && opts.userId) {
        appendAnd(where, buildAssigneeFilter(opts.userId));
    }

    if (opts.assigneeId) {
        appendAnd(where, buildAssigneeFilter(opts.assigneeId));
    }

    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    if (opts.tagId) {
        const tIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        where.tagId = { in: tIds };
    }

    // Date filters
    if (opts.dueAfter || opts.dueBefore) {
        where.dueDate = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: opts.dueBefore } : {}),
        };
    }

    // Search filter
    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { taskSlug: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
        ];
    }

    if (opts.cursor) {
        appendAnd(where, buildCursorWhere(opts.cursor));
    }

    return where;
}

// ============================================================
//  QUERY BUILDER: Workspace Filter Search ("Search Mode")
//  INDEX USED: (workspaceId, assigneeId, status, createdAt)
//              OR (projectId, assigneeId, status, createdAt)
// ============================================================
export interface WorkspaceFilterOpts {
    workspaceId: string;
    projectId?: string;         // narrows to a project — uses project index
    assigneeId?: string | string[];
    status?: string[];
    tagId?: string | string[];
    dueBefore?: Date;
    dueAfter?: Date;
    search?: string;
    cursor?: TaskCursor;
    isAdmin?: boolean;
    fullAccessProjectIds?: string[];
    restrictedProjectIds?: string[];
    projectIds?: string[];
    onlyParents?: boolean;
    excludeParents?: boolean;
    onlySubtasks?: boolean;
    includeSubTasks?: boolean;
    view_mode?: string;
}

/**
 * Isolates the permission-based filter logic.
 */
function buildAccessScopeWhere(opts: WorkspaceFilterOpts, userId: string): Prisma.TaskWhereInput {
    let fullIds = opts.fullAccessProjectIds ?? [];
    let restrictedIds = opts.restrictedProjectIds ?? [];

    if (opts.projectId) {
        fullIds = fullIds.filter(id => id === opts.projectId);
        restrictedIds = restrictedIds.filter(id => id === opts.projectId);
    } else if (opts.projectIds && opts.projectIds.length > 0) {
        fullIds = fullIds.filter(id => opts.projectIds!.includes(id));
        restrictedIds = restrictedIds.filter(id => opts.projectIds!.includes(id));
    }

    if (fullIds.length === 0 && restrictedIds.length === 0) {
        return { id: { in: [] } };
    }

    if (restrictedIds.length === 0) {
        return { projectId: { in: fullIds } };
    }

    if (fullIds.length === 0) {
        return {
            projectId: { in: restrictedIds },
            ...buildParentAssigneeFilter(userId)
        };
    }

    // Mixed access
    return {
        OR: [
            { projectId: { in: fullIds } },
            {
                projectId: { in: restrictedIds },
                ...buildParentAssigneeFilter(userId)
            }
        ]
    };
}

export function buildWorkspaceFilterWhere(
    opts: WorkspaceFilterOpts,
    userId: string
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
        workspaceId: opts.workspaceId,
    };

    // 1. Apply Access Control
    if (!opts.isAdmin) {
        appendAnd(where, buildAccessScopeWhere(opts, userId));
    } else if (opts.projectId) {
        where.projectId = opts.projectId;
    } else if (opts.projectIds && opts.projectIds.length > 0) {
        where.projectId = { in: opts.projectIds };
    }

    // 2. Apply Filters
    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    if (opts.tagId) {
        const tIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        where.tagId = { in: tIds };
    }

    if (opts.assigneeId) {
        appendAnd(where, buildParentAssigneeFilter(opts.assigneeId));
    }

    if (opts.dueAfter || opts.dueBefore) {
        where.dueDate = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: opts.dueBefore } : {}),
        };
    }

    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        appendAnd(where, {
            OR: [
                { name: { contains: q, mode: "insensitive" } },
                { taskSlug: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ]
        });
    }

    // 3. Apply Hierarchy/View Logic
    if (opts.onlyParents) {
        where.isParent = true;
        where.parentTaskId = null;
    } else if (opts.excludeParents || opts.onlySubtasks) {
        where.parentTaskId = { not: null };
    }

    // 4. Pagination
    if (opts.cursor) {
        appendAnd(where, buildCursorWhere(opts.cursor));
    }

    return where;
}
