import { Prisma, TaskStatus } from "@/generated/prisma";

export function getTaskSelect(view_mode: string = "list", isMinimal: boolean = false, extraFields?: string[], subtaskFilter?: Prisma.TaskWhereInput, isSubtaskFirst: boolean = false): Prisma.TaskSelect {
    const isList = view_mode === "list" || view_mode === "default" || !view_mode;
    const isKanban = view_mode === "kanban";
    const isGantt = view_mode === "gantt";
    const isCalendar = view_mode === "calendar";
    const isSearch = view_mode === "search";
    const isSubtask = view_mode === "subtask";

    if (isMinimal) {
        const select: Prisma.TaskSelect = {
            id: true,
            name: true,
            taskSlug: true,
            isParent: true,
            parentTaskId: true,
            projectId: true,
            workspaceId: true,
            createdAt: true,
            position: true,
            _count: {
                select: {
                    subTasks: subtaskFilter ? { where: subtaskFilter } : true
                }
            }
        };

        if (extraFields && extraFields.length > 0) {
            extraFields.forEach(field => {
                (select as Record<string, unknown>)[field] = true;
            });
        }

        return select;
    }

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
        reviewer: {
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
        workspaceId: true,
        parentTaskId: !isKanban,
        isParent: !isKanban, // Always false in Kanban subtask view
        position: true,
        assigneeId: !isKanban // Redundant with assignee object
    };

    if (extraFields && extraFields.includes("description")) {
        select.description = true;
    }

    // Include detailed createdBy only if NOT in Gantt view, subtask-first mode, or list view (creator not rendered in list)
    if (!isGantt && !isSubtaskFirst && !isList) {
        select.createdBy = {
            select: {
                workspaceMember: {
                    select: {
                        user: { select: { id: true, surname: true } }
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
                subTasks: subtaskFilter ? { where: subtaskFilter } : !isKanban
            }
        };
    }

    if (isList || isKanban || isSearch || isCalendar || isGantt || isSubtask) {
        if (!isGantt) {
            select.tags = { select: { id: true, name: true } };
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
                position: true,
            }
        };
    }

    // Select project fields for cross-project ordering and cursor pagination.
    // Kanban also needs name+color for card display.
    if (isKanban) {
        select.project = {
            select: { id: true, name: true, color: true, createdAt: true }
        };
    } else if (isList || isGantt) {
        select.project = {
            select: { id: true }
        };
    }

    // 5. specialized view fields
    if (isList || isGantt || isCalendar || isSubtask || isKanban) {
        select.position = true;
    }

    if (isList || isGantt || isCalendar || isSubtask || isKanban) {
        select.subtaskCount = true;
        select.completedSubtaskCount = true;
    }

    if (isGantt) {
        select.updatedAt = true;
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
    position?: number;
}

/**
 * Normalizes assignee filtering by checking both the dual keys (member PK and user UID).
 */
export function buildAssigneeFilter(memberIdOrUserId: string | string[]): Prisma.TaskWhereInput {
    const isMany = Array.isArray(memberIdOrUserId);
    const idFilter = isMany ? { in: memberIdOrUserId as string[] } : memberIdOrUserId;

    return {
        OR: [
            { assigneeId: idFilter as unknown as Prisma.StringFilter | string },
            { assignee: { workspaceMember: { userId: idFilter as unknown as Prisma.StringFilter | string } } },
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
    where.AND = [...existing, ...conditions] as Prisma.TaskWhereInput[];
}

/**
 * Build a cursor condition that respects the query sort direction.
 * direction="asc"  → gt (load next/newer page when sorted oldest-first)
 * direction="desc" → lt (load next/older page when sorted newest-first)
 */
export function buildCursorWhere(cursor: TaskCursor, direction: "asc" | "desc" = "asc"): Prisma.TaskWhereInput {
    const createdAt = typeof cursor.createdAt === "string" ? new Date(cursor.createdAt) : cursor.createdAt;
    const op = direction === "asc" ? "gt" : "lt";
    return {
        OR: [
            { createdAt: { [op]: createdAt } },
            { AND: [{ createdAt: createdAt }, { id: { [op]: cursor.id } }] },
        ],
    };
}

export interface KanbanCursorInput {
    id: string;
    projectCreatedAt?: Date | string | null;
    projectId?: string | null;
    parentTaskPosition?: number | null;
    parentTaskId?: string | null;
    position?: number | null;
}

export function buildKanbanCursorWhere(cursor: KanbanCursorInput): Prisma.TaskWhereInput {
    const { projectCreatedAt, parentTaskId, id } = cursor;
    const position = cursor.position ?? undefined;
    const parentTaskPosition = cursor.parentTaskPosition ?? undefined;

    // Project-level seek conditions (reused for both levels)
    const projectLevelSeek: Prisma.TaskWhereInput =
        parentTaskId !== null && parentTaskId !== undefined
            ? // Subtask: compound seek on parentTask.position, then own position
              {
                  OR: [
                      { parentTask: { position: { gt: parentTaskPosition } } },
                      { AND: [{ parentTask: { position: parentTaskPosition } }, { position: { gt: position } }] },
                      { AND: [{ parentTask: { position: parentTaskPosition } }, { position: position }, { id: { gt: id } }] },
                  ],
              }
            : // Flat root: seek by own position
              {
                  OR: [
                      { parentTaskId: null, position: { gt: position } },
                      { AND: [{ parentTaskId: null }, { position: position }, { id: { gt: id } }] },
                  ],
              };

    if (projectCreatedAt) {
        // Workspace-level: seek across projects ordered by project.createdAt
        const projDate = new Date(projectCreatedAt);
        return {
            OR: [
                // Any task in a later-created project
                { project: { createdAt: { gt: projDate } } },
                // Same project, but later in task ordering
                { AND: [{ project: { createdAt: projDate } }, projectLevelSeek] },
            ],
        };
    }

    return projectLevelSeek;
}

/**
 * Cross-project seek condition for list/gantt at workspace level.
 * ORDER BY: project.createdAt asc, position asc, id asc
 */
export function buildWorkspaceListCursorWhere(cursor: KanbanCursorInput): Prisma.TaskWhereInput {
    const { projectCreatedAt, id } = cursor;
    const position = cursor.position ?? undefined;
    if (!projectCreatedAt) {
        return {
            OR: [
                { position: { gt: position } },
                { AND: [{ position: position }, { id: { gt: id } }] },
            ],
        };
    }
    const projDate = new Date(projectCreatedAt);
    return {
        OR: [
            { project: { createdAt: { gt: projDate } } },
            { AND: [{ project: { createdAt: projDate } }, { position: { gt: position } }] },
            { AND: [{ project: { createdAt: projDate } }, { position: position }, { id: { gt: id } }] },
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
    position: { dbField: "position", nulls: "last" },
};

export function buildOrderBy(sorts?: Array<{ field: string; direction: "asc" | "desc" }>, view_mode?: string, projectId?: string) {
    // Default task list order is newest-first so recently created parent tasks appear first.
    if (!sorts || sorts.length === 0) {
        if (view_mode === "kanban") {
            if (!projectId) {
                // Workspace kanban: group by project (oldest first), then by parent position, then subtask position.
                return [
                    { project: { createdAt: "asc" as const } },
                    { parentTask: { position: "asc" as const } },
                    { position: "asc" as const },
                    { id: "asc" as const },
                ];
            }
            // Project kanban: group all subtasks by their parent's position first, then by subtask position.
            return [
                { parentTask: { position: "asc" as const } },
                { position: "asc" as const },
                { id: "asc" as const },
            ];
        }
        if (view_mode === "list" || view_mode === "gantt") {
            if (!projectId) {
                // Workspace: oldest project first, then task position within each project
                return [
                    { project: { createdAt: "asc" as const } },
                    { position: "asc" as const },
                    { id: "asc" as const },
                ];
            }
            // Project level: tasks in position order
            return [{ position: "asc" as const }, { id: "asc" as const }];
        }
        return [{ createdAt: "desc" as const }, { id: "desc" as const }];
    }

    const { field, direction } = sorts[0] || {};
    if (!field) {
        return [{ createdAt: "desc" as const }, { id: "desc" as const }];
    }
    const def = SORT_MAP[field];

    if (!def) {
        console.warn(`[buildOrderBy] Invalid sort field: "${field}". Falling back to default.`);
        return [{ createdAt: "desc" as const }, { id: "desc" as const }];
    }

    const primary = (def.nulls
        ? { [def.dbField]: { sort: direction, nulls: def.nulls } }
        : { [def.dbField]: direction }) as Prisma.TaskOrderByWithRelationInput;

    return [primary, { id: direction as "asc" | "desc" }];
}

export function buildSeekCondition(
    sorts: Array<{ field: string; direction: "asc" | "desc" }>,
    cursor: TaskCursor
): Prisma.TaskWhereInput {
    try {
        if (!sorts?.length || !cursor) return {};

        const { field, direction } = sorts[0];
        const def = SORT_MAP[field];
        if (!def) return {};

        const dbField = def.dbField;
        const lastFieldValue = (cursor as unknown as Record<string, unknown>)[dbField];
        const lastId = cursor.id;

        if (lastId === undefined || lastId === null) return {};

        const op = direction === "asc" ? "gt" : "lt";

        if (lastFieldValue === null || lastFieldValue === undefined) {
            return {
                AND: [{ [dbField]: null } as Prisma.TaskWhereInput, { id: { [op]: lastId } }],
            };
        }

        const conditions: Prisma.TaskWhereInput[] = [
            { [dbField]: { [op]: lastFieldValue } } as Prisma.TaskWhereInput,
            {
                // ID tiebreaker must also respect direction so page boundaries are stable
                AND: [{ [dbField]: lastFieldValue } as Prisma.TaskWhereInput, { id: { [op]: lastId } }],
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
        tagId?: string | string[];
        search?: string;
        dueAfter?: Date;
        dueBefore?: Date;
        dueDateType?: string;
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
                { status: { in: opts.status as unknown as TaskStatus[] } },
                { subTasks: { some: { status: { in: opts.status as unknown as TaskStatus[] } } } }
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

    if (opts.tagId) {
        const tIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        appendAnd(where, {
            OR: [
                { tags: { some: { id: { in: tIds } } } },
                { subTasks: { some: { tags: { some: { id: { in: tIds } } } } } }
            ]
        });
    }

    if (opts.dueAfter || opts.dueBefore) {
        let dateFilter: Prisma.DateTimeFilter = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: new Date(new Date(opts.dueBefore).getTime() + 24 * 60 * 60 * 1000) } : {}),
        };

        appendAnd(where, {
            OR: [
                { dueDate: dateFilter },
                { subTasks: { some: { dueDate: dateFilter } } }
            ]
        });
    }

    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        const searchMatches: Prisma.TaskWhereInput = {
            OR: [
                { name: { contains: q, mode: "insensitive" } },
                { taskSlug: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
            ]
        };
        appendAnd(where, {
            OR: [
                searchMatches,
                { subTasks: { some: searchMatches } }
            ]
        });
    }

    if (opts.cursor) {
        if (opts.sorts && opts.sorts.length > 0) {
            appendAnd(where, buildSeekCondition(opts.sorts, opts.cursor));
        } else {
            // Position-based ordering: seek by position then id
            appendAnd(where, buildWorkspaceListCursorWhere(opts.cursor));
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
        dueDateType?: string;
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
        where.status = { in: opts.status as unknown as TaskStatus[] };
    }

    // Tag filter
    if (opts.tagId && opts.tagId.length > 0) {
        where.tags = { some: { id: { in: opts.tagId } } };
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
        where.status = { in: opts.status as unknown as TaskStatus[] };
    }

    if (opts.tagId) {
        const tIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        where.tags = { some: { id: { in: tIds } } };
    }

    // Date filters
    if (opts.dueAfter || opts.dueBefore) {
        const dateFilter: Prisma.DateTimeFilter = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: new Date(new Date(opts.dueBefore).getTime() + 24 * 60 * 60 * 1000) } : {}),
        };
        where.dueDate = dateFilter;
    }

    // Search filter
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

    if (opts.cursor) {
        const cursor = opts.cursor;
        if (typeof cursor.position === "number") {
            appendAnd(where, {
                OR: [
                    { position: { gt: cursor.position } },
                    {
                        AND: [
                            { position: cursor.position },
                            { id: { gt: cursor.id } }
                        ]
                    }
                ]
            });
        } else {
            // Default orderBy is DESC (newest-first) → cursor must use "desc" to get older tasks (lt)
            appendAnd(where, buildCursorWhere(opts.cursor, "desc"));
        }
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
    dueDateType?: string;
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

    // Helper to check for non-empty filter arrays
    const cleanArray = (arr: unknown) => (Array.isArray(arr) ? arr.filter(v => v !== null && v !== undefined && v !== "") : (arr ? [arr] : []));

    // 2. Determine if any explicit filters are active
    const hasStatus = cleanArray(opts.status).length > 0;
    const hasAssignee = cleanArray(opts.assigneeId).length > 0;
    const hasTag = cleanArray(opts.tagId).length > 0;
    const hasSearch = opts.search && opts.search.trim().length > 0;
    const hasDate = !!(opts.dueAfter || opts.dueBefore);
    const hasIds = opts.ids && opts.ids.length > 0;

    const hasExplicitFilters = hasStatus || hasAssignee || hasTag || hasSearch || hasDate || hasIds;

    // 2. Apply Filters
    if (hasStatus) {
        if (opts.excludeParents || opts.view_mode === "kanban" || opts.onlySubtasks) {
            where.status = { in: opts.status as unknown as TaskStatus[] };
        } else {
            appendAnd(where, {
                OR: [
                    { status: { in: opts.status as unknown as TaskStatus[] } },
                    { subTasks: { some: { status: { in: opts.status as unknown as TaskStatus[] } } } }
                ]
            });
        }
    }

    if (hasTag) {
        const rawIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        const tIds = rawIds.filter((id): id is string => !!id);
        where.tags = { some: { id: { in: tIds } } };
    }

    if (hasAssignee) {
        const useStrictFilter = true; 
        appendAnd(where, buildParentAssigneeFilter(opts.assigneeId!, useStrictFilter));
    }

    if (opts.parentTaskId) {
        where.parentTaskId = opts.parentTaskId;
    }

    if (hasDate) {
        const dateFilter: Prisma.DateTimeFilter = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: new Date(new Date(opts.dueBefore).getTime() + 24 * 60 * 60 * 1000) } : {}),
        };
        where.dueDate = dateFilter;
    }

    if (hasSearch) {
        const q = opts.search!.trim();
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
    if (!hasIds) {
        if (opts.onlyParents) {
            where.isParent = true;
            if (opts.view_mode !== "gantt") {
                where.parentTaskId = null;
            }
        } else if (opts.excludeParents || opts.onlySubtasks || opts.view_mode === "kanban") {
            if (opts.view_mode === "kanban") {
                // Kanban: exclude only top-level containers (parentTaskId=null AND isParent=true).
                // Show flat roots, true subtasks, and intermediate parents that have their own parent.
                where.NOT = { AND: [{ parentTaskId: null }, { isParent: true }] };
            } else {
                if (!opts.parentTaskId) {
                    where.parentTaskId = { not: null };
                }
                where.isParent = false;
            }
        } else if (opts.view_mode !== "gantt") {
            // 🚀 DEFAULT: Hierarchical root view
            // If no explicit filter is applied, only show root parents at the top level.
            if (!hasExplicitFilters) {
                where.parentTaskId = null;
                where.isParent = true;
            }
        }
    }

    // 4. Pagination
    if (opts.cursor) {
        if (opts.view_mode === "kanban") {
            appendAnd(where, buildKanbanCursorWhere(opts.cursor));
        } else if ((opts.view_mode === "list" || opts.view_mode === "gantt") && !opts.projectId) {
            // Workspace list/gantt: seek across project boundaries
            appendAnd(where, buildWorkspaceListCursorWhere(opts.cursor));
        } else if (opts.sorts && opts.sorts.length > 0) {
            appendAnd(where, buildSeekCondition(opts.sorts, opts.cursor));
        } else {
            appendAnd(where, buildCursorWhere(opts.cursor, "desc"));
        }
    }

    return where;
}
