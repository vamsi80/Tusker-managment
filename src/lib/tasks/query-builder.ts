import { Prisma } from "@/generated/prisma";

/**
 * Dynamic Task Selection
 * Fetches only what is needed for the specific view to save bandwidth.
 */
export function getTaskSelect(viewMode: string = "list"): Prisma.TaskSelect {
    const isList = viewMode === "list" || viewMode === "default" || !viewMode;
    const isKanban = viewMode === "kanban";
    const isGantt = viewMode === "gantt";
    const isCalendar = viewMode === "calendar";
    const isSearch = viewMode === "search";
    const isSubtask = viewMode === "subtask";

    /**
     * CORE FIELDS: Strictly what's needed for basic rendering & core logic (Dnd, Permissions).
     * We exclude heavy fields (description) and redundant IDs (assigneeTo) where possible.
     */
    const select: Prisma.TaskSelect = {
        id: true,
        name: true,
        taskSlug: true,
        status: true,
        dueDate: true,
        subtaskCount: true,
        completedSubtaskCount: true,
        tagId: true,

        // Relations: Minimal data only
        assignee: { select: { id: true, surname: true, image: true } },

        // Metadata for pagination & permissions & tree logic
        createdAt: true,        // Tiebreaker for pagination
        createdById: true,      // For "Can I Edit?" logic
        projectId: true,        // For "Which project permissions apply?"
        parentTaskId: true,     // For tree structure
        isParent: true,         // For tree structure
    };

    // 1. Comment Counts: Only for Views that show badge/indicators (Board and List)
    if (isKanban || isList) {
        select._count = {
            select: { reviewComments: true }
        };
        select.tag = { select: { id: true, name: true } };
    }

    // 2. Dates & Progress:
    // startDate is now exclusive to List view per user request (and Gantt/Calendar/Subtasks which require it)
    if (isList || isGantt || isCalendar || isSubtask) {
        select.startDate = true;
    }

    if (isGantt || isList || isKanban || isCalendar) {
        select.days = true;
    }

    // 3. Project & Parent Meta: Fetched only when context is ambiguous (Workspace view)
    // For subtasks, the batcher Uses these selects to fetch context ONCE and inject it.
    if (isKanban || isSearch || isList || isGantt || isSubtask) {
        select.project = {
            select: { id: true, name: true, color: true }
        };
        select.parentTask = {
            select: { id: true, name: true }
        };
    }

    // 4. Reviewer: Specifically for List & Subtask expansions (removed from Kanban per request)
    if (isList || isSubtask) {
        select.reviewer = {
            select: { id: true, surname: true }
        };
    }

    // 5. Description: Added to List and Search views for better context
    if (isList || isSearch || isSubtask) {
        select.description = true;
    }

    if (isSearch) {
        select.createdBy = {
            select: { id: true, surname: true }
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

// ============================================================
//  QUERY BUILDER: Project Root (Parent Tasks Only)
//  INDEX USED: (projectId, isParent, status, createdAt DESC)
// ============================================================
export function buildProjectRootWhere(
    projectId: string,
    opts: {
        status?: string[];
        assigneeId?: string;   // null = unfiltered (admin/lead sees all)
        cursor?: TaskCursor;
    }
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
        projectId,
        isParent: true,     // ← prefix match on index col 2
        parentTaskId: null, // redundant safety guard
    };

    // Index col 3: status — include only when provided to allow partial scan
    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    // Member permission: restrict to tasks where they are assigned
    // OR where they have a subtask assigned (use subTasks.some)
    if (opts.assigneeId) {
        where.OR = [
            { assigneeTo: opts.assigneeId },
            { subTasks: { some: { assigneeTo: opts.assigneeId } } },
        ];
    }

    // Cursor pagination: keyed on (createdAt DESC, id)
    if (opts.cursor) {
        const cursorCondition = {
            OR: [
                { createdAt: { lt: opts.cursor.createdAt } },
                { createdAt: opts.cursor.createdAt, id: { gt: opts.cursor.id } },
            ]
        };

        if (where.AND) {
            (where.AND as any[]).push(cursorCondition);
        } else {
            where.AND = [cursorCondition];
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

    // Assignee filter
    if (opts.assigneeId) {
        if (Array.isArray(opts.assigneeId)) {
            if (opts.assigneeId.length > 0) where.assigneeTo = { in: opts.assigneeId };
        } else {
            where.assigneeTo = opts.assigneeId;
        }
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
        const cursorCondition = {
            OR: [
                { createdAt: { lt: opts.cursor.createdAt } },
                { createdAt: opts.cursor.createdAt, id: { gt: opts.cursor.id } },
            ]
        };
        where.AND = [
            ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
            cursorCondition
        ];
    }

    return where;
}

// ============================================================
//  QUERY BUILDER: Workspace Filter Search ("Search Mode")
//  INDEX USED: (workspaceId, assigneeTo, status, createdAt)
//              OR (projectId, assigneeTo, status, createdAt)
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
    // Permission scopes — mutually exclusive flags
    isAdmin?: boolean;             // workspace admin: no project restriction
    fullAccessProjectIds?: string[];  // projects where user sees everything
    restrictedProjectIds?: string[];  // projects where user only sees assigned tasks
    projectIds?: string[];           // strictly narrow to these projects (e.g. expanded ones)
    // Hierarchy
    onlyParents?: boolean;
    excludeParents?: boolean;
    onlySubtasks?: boolean;
    includeSubTasks?: boolean;
}

export function buildWorkspaceFilterWhere(
    opts: WorkspaceFilterOpts,
    userId: string
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    // ─── Scope: which projects can these results come from? ─────────────
    if (opts.projectId) {
        // Single-project view — the caller already validated access
        where.projectId = opts.projectId;
    } else if (opts.isAdmin) {
        // Workspace admin: only scope to workspace, no project restriction
        where.workspaceId = opts.workspaceId;
        if (opts.projectIds && opts.projectIds.length > 0) {
            where.projectId = { in: opts.projectIds };
        }
    } else {
        // Non-admin: enforce the access model:
        where.workspaceId = opts.workspaceId;

        let fullIds = opts.fullAccessProjectIds ?? [];
        let restrictedIds = opts.restrictedProjectIds ?? [];

        // STRICT RESTRICTION: projectId IN projectIds
        // If specific projects are requested (e.g. expanded ones), 
        // we narrow the authorized sets so we NEVER query others.
        if (opts.projectIds && opts.projectIds.length > 0) {
            fullIds = fullIds.filter(id => opts.projectIds!.includes(id));
            restrictedIds = restrictedIds.filter(id => opts.projectIds!.includes(id));
        }

        if (fullIds.length === 0 && restrictedIds.length === 0) {
            // No access at all — return nothing
            where.id = { in: [] };
        } else if (restrictedIds.length === 0) {
            // Only full-access projects
            where.projectId = { in: fullIds };
        } else if (fullIds.length === 0) {
            // Only restricted projects
            where.projectId = { in: restrictedIds };

            if (opts.onlyParents) {
                // For hierarchy/gantt: see parent if assigned OR if any child is assigned
                where.OR = [
                    { assigneeTo: userId },
                    { subTasks: { some: { assigneeTo: userId } } }
                ];
            } else {
                // Flat list: only see directly assigned
                where.assigneeTo = userId;
            }
        } else {
            // Mixed: full-access OR (restricted AND assigned)
            const restrictedCondition: Prisma.TaskWhereInput = opts.onlyParents
                ? {
                    projectId: { in: restrictedIds },
                    OR: [
                        { assigneeTo: userId },
                        { subTasks: { some: { assigneeTo: userId } } }
                    ]
                }
                : { projectId: { in: restrictedIds }, assigneeTo: userId };

            where.AND = [
                {
                    OR: [
                        { projectId: { in: fullIds } },
                        restrictedCondition
                    ]
                }
            ];
        }
    }

    // ─── User-supplied assignee filter ─────────────────────────────────
    const assigneeFilters = opts.assigneeId
        ? (Array.isArray(opts.assigneeId) ? opts.assigneeId : [opts.assigneeId])
        : null;

    // Do not overwrite an assigneeTo already set by the restricted scope above
    if (assigneeFilters && assigneeFilters.length > 0 && !where.assigneeTo) {
        where.assigneeTo = { in: assigneeFilters };
    }

    // ─── Hierarchy ─────────────────────────────────────────────────────
    if (opts.onlyParents) {
        where.isParent = true;
        where.parentTaskId = null;
    } else if (opts.onlySubtasks) {
        where.parentTaskId = { not: null };
    } else if (opts.excludeParents) {
        where.isParent = false;
    }

    // ─── Status / Tag ───────────────────────────────────────────────────
    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    if (opts.tagId) {
        const tagIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        if (tagIds.length > 0) where.tagId = { in: tagIds };
    }

    // ─── Due date ───────────────────────────────────────────────────────
    if (opts.dueAfter || opts.dueBefore) {
        where.dueDate = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lt: opts.dueBefore } : {}),
        };
    }

    // ─── Full-text search ───────────────────────────────────────────────
    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        const searchClause = [
            { name: { contains: q, mode: "insensitive" as const } },
            { taskSlug: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
        ];
        // Merge with any existing AND to avoid overwriting scope clauses
        if (where.OR) {
            // Search conflicts with existing OR — wrap in AND 
            where.AND = [
                ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
                { OR: searchClause }
            ];
        } else {
            where.OR = searchClause;
        }
    }

    // ─── Cursor pagination ──────────────────────────────────────────────
    if (opts.cursor) {
        const cursorCondition = {
            OR: [
                { createdAt: { lt: opts.cursor.createdAt } },
                { createdAt: opts.cursor.createdAt, id: { gt: opts.cursor.id } },
            ]
        };
        where.AND = [
            ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
            cursorCondition
        ];
    }

    return where;
}
