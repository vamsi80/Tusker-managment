import { Prisma } from "@/generated/prisma";

export function getTaskSelect(viewMode: string = "list"): Prisma.TaskSelect {
    const isList = viewMode === "list" || viewMode === "default" || !viewMode;
    const isKanban = viewMode === "kanban";
    const isGantt = viewMode === "gantt";
    const isCalendar = viewMode === "calendar";
    const isSearch = viewMode === "search";
    const isSubtask = viewMode === "subtask";

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

        // Always include basic assignee info
        assignee: {
            select: {
                id: true,
                workspaceMember: { select: { user: { select: { name: true, surname: true } } } }
            }
        },

        createdAt: true,
        createdById: true,
        projectId: true,
        parentTaskId: true,
        isParent: true,
        assigneeId: true,
    };

    // 2. Metadata: Tags & Comment Counts
    // Uniformly added to most views for UI consistency
    if (isKanban || isList || isSearch || isGantt || isCalendar || isSubtask) {
        select._count = {
            select: {
                reviewComments: true,
                subTasks: true
            }
        };
        select.tag = { select: { id: true, name: true } };
    }

    // 3. Project & Parent Context
    // Essential for workspace views and search results
    if (isKanban || isSearch || isList || isGantt || isSubtask || isCalendar) {
        select.project = {
            select: { id: true, name: true, color: true }
        };
        select.parentTask = {
            select: { id: true, name: true }
        };
    }

    // 4. Extended Info: Description & Reviewer
    // Uniformly included for better context across all views except minimal kanban nodes if needed
    // But per user request to "make everything unique/consistent", we include them broadly.
    if (isList || isSearch || isSubtask || isGantt || isCalendar) {
        select.description = true;
        select.reviewer = {
            select: {
                id: true,
                workspaceMember: { select: { user: { select: { name: true, surname: true } } } }
            }
        };
    }

    // 5. specialized view fields
    if (isList || isGantt || isCalendar || isSubtask) {
        select.startDate = true;
        select.days = true;
    }

    if (isSearch) {
        select.createdBy = {
            select: {
                id: true,
                workspaceMember: { select: { user: { select: { name: true, surname: true, image: true, email: true } } } }
            }
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
        assigneeId?: string | string[];   // null = unfiltered (admin/lead sees all)
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

    // Visibility scope for restricted users
    if (opts.assigneeId) {
        const assigneeVal = Array.isArray(opts.assigneeId) ? { in: opts.assigneeId } : opts.assigneeId;
        where.OR = [
            { assignee: { workspaceMember: { userId: assigneeVal } } },
            { subTasks: { some: { assignee: { workspaceMember: { userId: assigneeVal } } } } }
        ];
    }

    // Cursor pagination: keyed on (createdAt DESC, id)
    if (opts.cursor) {
        const cursorCondition = {
            OR: [
                { createdAt: { lt: opts.cursor.createdAt } },
                { createdAt: opts.cursor.createdAt, id: { lt: opts.cursor.id } },
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

    // Assignee filter: Support both ProjectMemberId and User ID (relational)
    if (opts.assigneeId) {
        const assigneeVal = Array.isArray(opts.assigneeId) ? { in: opts.assigneeId } : opts.assigneeId;
        const assigneeFilter: Prisma.TaskWhereInput = {
            OR: [
                { assigneeId: assigneeVal },
                { assignee: { workspaceMember: { userId: (Array.isArray(opts.assigneeId) ? { in: opts.assigneeId } : opts.assigneeId) as any } } }
            ]
        };

        if (where.AND) {
            where.AND = [
                ...(Array.isArray(where.AND) ? where.AND : [where.AND]),
                assigneeFilter
            ];
        } else {
            where.AND = [assigneeFilter];
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
                { createdAt: opts.cursor.createdAt, id: { lt: opts.cursor.id } },
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
    viewMode?: string;
}

export function buildWorkspaceFilterWhere(
    opts: WorkspaceFilterOpts,
    userId: string
): Prisma.TaskWhereInput {
    const viewMode = opts.viewMode || "list";
    const isList = viewMode === "list" || viewMode === "default";
    const isKanban = viewMode === "kanban";
    const isGantt = viewMode === "gantt";
    const isSearch = viewMode === "search";
    const isCalendar = viewMode === "calendar";

    const where: Prisma.TaskWhereInput = {};

    // ─── Scope: which projects can these results come from? ─────────────
    if (opts.isAdmin) {
        // Workspace admin: scope to workspace and optionally narrow to projectId or projectIds
        where.workspaceId = opts.workspaceId;
        if (opts.projectId) {
            where.projectId = opts.projectId;
        } else if (opts.projectIds && opts.projectIds.length > 0) {
            where.projectId = { in: opts.projectIds };
        }
    } else {
        // Non-admin: enforce the access model:
        where.workspaceId = opts.workspaceId;

        let fullIds = opts.fullAccessProjectIds ?? [];
        let restrictedIds = opts.restrictedProjectIds ?? [];

        // Narrow authorized sets based on requested projectId or projectIds
        if (opts.projectId) {
            // Already scoped to this project by the caller in resolveTaskPermissions
            // but we ensure consistency here
            fullIds = fullIds.filter(id => id === opts.projectId);
            restrictedIds = restrictedIds.filter(id => id === opts.projectId);
        } else if (opts.projectIds && opts.projectIds.length > 0) {
            // Filter global lists by requested project set
            fullIds = fullIds.filter(id => opts.projectIds!.includes(id));
            restrictedIds = restrictedIds.filter(id => opts.projectIds!.includes(id));
        }

        if (fullIds.length === 0 && restrictedIds.length === 0) {
            // No access at all — return nothing
            where.id = { in: [] };
        } else if (restrictedIds.length === 0) {
            // Only full-access projects (e.g. they are a lead everywhere they are member)
            where.projectId = { in: fullIds };
        } else if (fullIds.length === 0) {
            // Only restricted projects
            where.projectId = { in: restrictedIds };

            if (opts.onlyParents) {
                // For hierarchy/gantt: see parent if assigned OR if any child is assigned
                where.OR = [
                    { assignee: { workspaceMember: { userId: userId } } },
                    { subTasks: { some: { assignee: { workspaceMember: { userId: userId } } } } }
                ];
            } else {
                // Flat list: only see directly assigned
                where.assignee = { workspaceMember: { userId: userId } };
            }
        } else {
            // Mixed: full-access OR (restricted AND assigned)
            const restrictedCondition: Prisma.TaskWhereInput = opts.onlyParents
                ? {
                    projectId: { in: restrictedIds },
                    OR: [
                        { assignee: { workspaceMember: { userId: userId } } },
                        { subTasks: { some: { assignee: { workspaceMember: { userId: userId } } } } }
                    ]
                }
                : { projectId: { in: restrictedIds }, assignee: { workspaceMember: { userId: userId } } };

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

    // ─── Apply User Filters (Safely merge with security scope) ────────
    const applyFilter = (key: keyof Prisma.TaskWhereInput, values: any) => {
        if (!values || (Array.isArray(values) && values.length === 0)) return;
        const filterVal = Array.isArray(values) ? { in: values } : values;

        if (where[key]) {
            // Merge into AND to avoid overwriting restricted scope
            where.AND = [
                ...(Array.isArray(where.AND) ? where.AND : (where.AND ? [where.AND] : [])),
                { [key]: filterVal }
            ];
        } else {
            (where as any)[key] = filterVal;
        }

    };

    applyFilter('status', opts.status);
    applyFilter('tagId', opts.tagId);

    // Filter by assignee: handle both direct ProjectMemberId (if selected from list) 
    // and userId (if passed as restricted scope)
    if (opts.assigneeId) {
        const assigneeVal = Array.isArray(opts.assigneeId) ? { in: opts.assigneeId } : opts.assigneeId;
        const assigneeFilter: Prisma.TaskWhereInput = {
            OR: [
                { assigneeId: assigneeVal },
                { assignee: { workspaceMember: { userId: (Array.isArray(opts.assigneeId) ? { in: opts.assigneeId } : opts.assigneeId) as any } } }
            ]
        };

        if (where.AND) {
            where.AND = [
                ...(Array.isArray(where.AND) ? where.AND : [where.AND]),
                assigneeFilter
            ];
        } else {
            where.AND = [assigneeFilter];
        }
    }

    const hasFilters = !!(
        (opts.status && opts.status.length > 0) ||
        (opts.assigneeId) ||
        (opts.tagId) ||
        (opts.search && opts.search.trim().length > 0) ||
        opts.dueAfter ||
        opts.dueBefore
    );

    if (opts.onlyParents) {
        where.isParent = true;
        where.parentTaskId = null;
    } else if (opts.excludeParents) {
        where.parentTaskId = { not: null };
    } else if (isKanban) {
        // Show all tasks (parents or subtasks) in Kanban that match the status
        // unless explicitly excluded
    } else if (isList || isGantt || isCalendar) {
        // Default to hierarchy only if NO filters are active
        if (!hasFilters) {
            where.isParent = true;
            where.parentTaskId = null;
        }
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
                { createdAt: opts.cursor.createdAt, id: { lt: opts.cursor.id } },
            ]
        };
        where.AND = [
            ...(where.AND ? (Array.isArray(where.AND) ? where.AND : [where.AND]) : []),
            cursorCondition
        ];
    }

    return where;
}
