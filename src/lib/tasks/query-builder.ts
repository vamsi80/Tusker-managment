import { Prisma } from "@/generated/prisma";

export function getTaskSelect(view_mode: string = "list", isMinimal: boolean = false): Prisma.TaskSelect {
    if (isMinimal) {
        return {
            id: true,
            name: true,
            taskSlug: true,
            isParent: true,
            projectId: true,
            createdAt: true, 
            // removed _count for absolute minimum weight
        };
    }

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
        startDate: true,
        days: true,
        assignee: {
            select: {
                workspaceMember: {
                    select: {
                        user: { select: { id: true, surname: true } }
                    }
                }
            }
        },

        createdAt: true,
        createdById: true,
        projectId: true, 
        parentTaskId: !isKanban,
        isParent: !isKanban, // Always false in Kanban subtask view
        assigneeId: !isKanban // Redundant with assignee object
    };

    if (isList) {
        select.description = true;
    }

    // Include detailed createdBy only if NOT in Gantt view to save on payload/joins
    if (!isGantt && !isKanban) {
        select.createdBy = {
            select: {
                workspaceMember: {
                    select: {
                        userId: true,
                        // Only need surname in list/search, not Kanban
                        user: { select: { id: true, surname: !isKanban } }
                    }
                }
            }
        };
    }

    // 2. Metadata: Tags & Comment Counts
    // Omit counts for Kanban and Gantt to save on payload/joins
    const includeCounts = (isList || isSearch || isCalendar) || (isKanban && false);

    if (includeCounts) {
        select._count = {
            select: {
                activities: true,
                subTasks: !isKanban
            }
        };
    }

    if (isList || isKanban || isSearch || isCalendar || isGantt) {
        if (!isGantt) {
            select.tag = { select: { name: true } };
        }
    }

    // 3. Project & Parent Context
    // Removed server-side joins for views to reduce payload size.
    // Client-side projectMap will be used for metadata resolution.
    if (isList || isSearch || isCalendar || isKanban) {
        select.parentTask = {
            select: {
                id: true,
                name: true,
            }
        };
    }

    // 4. Extended Info: Description & Reviewer
    if (isList || isSearch || isCalendar || isSubtask) {
        select.reviewer = {
            select: {
                workspaceMember: { select: { user: { select: { surname: true } } } }
            }
        };
    }

    // 5. specialized view fields
    if (isList || isGantt || isCalendar || isSubtask) {
        select.position = true;
    }

    if (isGantt) {
        select.updatedAt = true;
        select.subtaskCount = true;
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
export function buildParentAssigneeFilter(memberIdOrUserId: string | string[], onlySubtasks = false): Prisma.TaskWhereInput {
    const leaf = buildAssigneeFilter(memberIdOrUserId);
    if (onlySubtasks) return leaf;

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
    const createdAt = typeof cursor.createdAt === "string" ? new Date(cursor.createdAt) : cursor.createdAt;
    return {
        OR: [
            { createdAt: { lt: createdAt } },
            { AND: [{ createdAt: createdAt }, { id: { lt: cursor.id } }] },
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
    deadline: { dbField: "dueDate", nulls: "last" },
};

export function buildOrderBy(sorts?: Array<{ field: string; direction: "asc" | "desc" }>) {
    // Standard default for "Order of Uploading" is oldest-first (ASC)
    if (!sorts || sorts.length === 0) {
        return [{ createdAt: "asc" as const }, { id: "asc" as const }];
    }

    const { field, direction } = sorts[0];
    const def = SORT_MAP[field];

    if (!def) {
        throw new Error(`[buildOrderBy] Invalid sort field: "${field}"`);
    }

    const primary: any = def.nulls
        ? { [def.dbField]: { sort: direction, nulls: def.nulls } }
        : { [def.dbField]: direction };

    return [primary, { id: direction as "asc" | "desc" }];
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
        sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
        userId?: string;
        isAdmin?: boolean;
        fullAccessProjectIds?: string[];
        ids?: string[];
    }
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
        projectId,
    };

    if (opts.ids && opts.ids.length > 0) {
        where.id = { in: opts.ids };
    } else {
        where.parentTaskId = null;
    }

    if (opts.status && opts.status.length > 0) {
        appendAnd(where, {
            OR: [
                { status: { in: opts.status as any } },
                { subTasks: { some: { status: { in: opts.status as any } } } }
            ]
        });
    }

    const isRestricted = opts.userId && !opts.isAdmin && (!opts.fullAccessProjectIds || !opts.fullAccessProjectIds.includes(projectId));

    if (isRestricted && opts.userId) {
        appendAnd(where, buildParentAssigneeFilter(opts.userId));
    }

    if (opts.assigneeId) {
        appendAnd(where, buildParentAssigneeFilter(opts.assigneeId));
    }

    if (opts.cursor) {
        if (opts.sorts && opts.sorts.length > 0) {
            appendAnd(where, buildSeekCondition(opts.sorts, opts.cursor));
        } else {
            appendAnd(where, buildCursorWhere(opts.cursor));
        }
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
    ids?: string[];
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
    parentTaskId?: string;
    sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
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
            ...buildParentAssigneeFilter(userId, opts.onlySubtasks)
        };
    }

    // Mixed access
    return {
        OR: [
            { projectId: { in: fullIds } },
            {
                projectId: { in: restrictedIds },
                ...buildParentAssigneeFilter(userId, opts.onlySubtasks)
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

    if (opts.ids && opts.ids.length > 0) {
        where.id = { in: opts.ids };
    }

    // 1. Apply Access Control
    if (!opts.isAdmin) {
        appendAnd(where, buildAccessScopeWhere(opts, userId));
    } else if (opts.projectId) {
        where.projectId = opts.projectId;
    } else if (opts.projectIds && opts.projectIds.length > 0) {
        where.projectId = { in: opts.projectIds };
    }

    // 2. Apply Filters (Hierarchical for Milestone containers)
    if (opts.status && opts.status.length > 0) {
        // 🚀 CRITICAL: In Kanban or when excluding parents, we want STRICT status matching.
        // We do NOT want to pull in a Parent task just because its SubTask matches the status.
        if (opts.excludeParents || opts.view_mode === "kanban" || opts.onlySubtasks) {
            where.status = { in: opts.status as any };
        } else {
            appendAnd(where, {
                OR: [
                    { status: { in: opts.status as any } },
                    { subTasks: { some: { status: { in: opts.status as any } } } }
                ]
            });
        }
    }

    if (opts.tagId) {
        const tIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        where.tagId = { in: tIds };
    }

    if (opts.assigneeId) {
        appendAnd(where, buildParentAssigneeFilter(opts.assigneeId));
    }

    if (opts.parentTaskId) {
        where.parentTaskId = opts.parentTaskId;
    }

    if (opts.dueAfter || opts.dueBefore) {
        where.dueDate = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: opts.dueBefore } : {}),
        };
    }

    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        const searchMatches: Prisma.TaskWhereInput = {
            OR: [
                { name: { contains: q, mode: "insensitive" } },
                { taskSlug: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { parentTask: { name: { contains: q, mode: "insensitive" } } },
            ]
        };

        appendAnd(where, {
            OR: [
                searchMatches,
                { subTasks: { some: searchMatches } }
            ]
        });
    }

    // 3. Apply Hierarchy/View Logic (Ignore if specific IDs are requested)
    if (!opts.ids || opts.ids.length === 0) {
        if (opts.onlyParents) {
            where.isParent = true;
            // For Gantt view hierarchies, we might want all parents regardless of level.
            // But for standard root views, we stick to parentTaskId: null.
            if (opts.view_mode !== "gantt") {
                where.parentTaskId = null;
            }
        } else if (opts.excludeParents || opts.onlySubtasks || opts.view_mode === "kanban") {
            where.parentTaskId = { not: null };
            where.isParent = false;
        }
    }

    // 4. Pagination
    if (opts.cursor) {
        if (opts.sorts && opts.sorts.length > 0) {
            appendAnd(where, buildSeekCondition(opts.sorts, opts.cursor));
        } else {
            appendAnd(where, buildCursorWhere(opts.cursor));
        }
    }

    return where;
}
