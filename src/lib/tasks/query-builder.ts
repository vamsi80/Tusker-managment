import { Prisma } from "@/generated/prisma";

// ============================================================
//  SHARED TASK SELECT — used by all views for type consistency
// ============================================================
//  NOTE: We intentionally exclude heavy relations (project.projectMembers)
//  from the core select. Batch-load those separately if needed.
export const TASK_CORE_SELECT = {
    id: true,
    name: true,
    taskSlug: true,
    description: true,
    status: true,
    startDate: true,
    dueDate: true,
    days: true,
    projectId: true,
    workspaceId: true,
    parentTaskId: true,
    isParent: true,
    createdAt: true,
    updatedAt: true,
    createdById: true,
    assigneeTo: true,    // FK — batch load User separately
    reviewerId: true,    // FK — batch load User separately
    tagId: true,         // FK — batch load Tag separately
    parentTask: {
        select: {
            id: true,
            name: true,
            taskSlug: true,
        }
    },
    _count: {
        select: {
            subTasks: true,
            reviewComments: true,
        }
    }
} satisfies Prisma.TaskSelect;

// ============================================================
//  TYPE: Cursor for pagination
// ============================================================
export interface TaskCursor {
    id: string;
    createdAt: Date;
    [key: string]: any; // Support secondary fields for sorting
}

// ============================================================
//  SORT BUILDER
// ============================================================
export interface SortConfig {
    field: string;
    direction: "asc" | "desc";
}

export function buildOrderBy(sorts?: SortConfig[]): Prisma.TaskOrderByWithRelationInput[] {
    const defaultOrder: Prisma.TaskOrderByWithRelationInput[] = [{ createdAt: "desc" }, { id: "asc" }];

    if (!sorts || sorts.length === 0) {
        return defaultOrder;
    }

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [];
    const whitelist = ["name", "status", "startDate", "dueDate", "assignee", "tags"];

    sorts.forEach(s => {
        if (!whitelist.includes(s.field)) return;

        switch (s.field) {
            case "name":
                orderBy.push({ name: s.direction });
                break;
            case "status":
                orderBy.push({ status: s.direction });
                break;
            case "startDate":
                orderBy.push({ startDate: s.direction });
                break;
            case "dueDate":
                orderBy.push({ dueDate: s.direction });
                break;
            case "assignee":
                // Sorting by FK for performance at scale
                orderBy.push({ assigneeTo: s.direction });
                break;
            case "tags":
                orderBy.push({ tagId: s.direction });
                break;
        }
    });

    // Always append ID for stable sorting
    orderBy.push({ id: "asc" });
    return orderBy;
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
    parentTaskId: string,
    opts: {
        assigneeId?: string;  // member constraint
        status?: string[];
        cursor?: TaskCursor;
    }
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {
        parentTaskId,           // ← index prefix col 1
        isParent: false,
    };

    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    if (opts.assigneeId) {
        where.assigneeTo = opts.assigneeId;
    }

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
    authorizedProjectIds?: string[];  // permission scope
    adminScope?: boolean;             // if true, skip projectId IN list
    onlyParents?: boolean;            // restricts to isParent: true
    excludeParents?: boolean;         // restricts to isParent: false
    onlySubtasks?: boolean;           // restricts to parentTaskId: { not: null }
    sorts?: SortConfig[];             // items to sort by
}

export function buildWorkspaceFilterWhere(
    opts: WorkspaceFilterOpts,
    permissionMode: "admin" | "lead" | "member",
    userId: string
): Prisma.TaskWhereInput {
    const where: Prisma.TaskWhereInput = {};

    // Tier 1: Narrowest scope first (index prefix selection)
    if (opts.projectId) {
        where.projectId = opts.projectId;
    } else {
        where.workspaceId = opts.workspaceId;
        if (!opts.adminScope && opts.authorizedProjectIds) {
            where.projectId = { in: opts.authorizedProjectIds };
        }
    }

    // Member permission: always restrict to own tasks in filter mode
    const assigneeFilters = opts.assigneeId
        ? (Array.isArray(opts.assigneeId) ? opts.assigneeId : [opts.assigneeId])
        : null;

    if (permissionMode === "member") {
        // Intersect: must be assigned to member AND match UI filter
        where.assigneeTo = assigneeFilters && assigneeFilters.length > 0
            ? { in: assigneeFilters.filter(a => a === userId) }
            : userId;
    } else if (assigneeFilters && assigneeFilters.length > 0) {
        where.assigneeTo = { in: assigneeFilters };
    }

    // In search/filter mode: return ALL levels (parent + subtask)
    // UNLESS onlyParents is specifically requested.
    if (opts.onlyParents) {
        where.isParent = true;
        where.parentTaskId = null;
    } else if (opts.onlySubtasks) {
        where.parentTaskId = { not: null };
    } else if (opts.excludeParents) {
        where.isParent = false;
    }
    // so the query uses (workspaceId, assigneeTo, status, createdAt)

    if (opts.status && opts.status.length > 0) {
        where.status = { in: opts.status as any };
    }

    if (opts.tagId) {
        const tagIds = Array.isArray(opts.tagId) ? opts.tagId : [opts.tagId];
        if (tagIds.length > 0) where.tagId = { in: tagIds };
    }

    if (opts.dueBefore || opts.dueAfter) {
        where.dueDate = {
            ...(opts.dueAfter ? { gte: opts.dueAfter } : {}),
            ...(opts.dueBefore ? { lte: opts.dueBefore } : {}),
            not: null,
        };
    }

    if (opts.search && opts.search.trim().length > 0) {
        const q = opts.search.trim();
        where.OR = [
            { name: { contains: q, mode: "insensitive" } },
            { taskSlug: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
        ];
    }

    if (opts.cursor) {
        const sorts = opts.sorts || [];
        const primarySort = sorts[0];

        if (!primarySort) {
            // Default logic: (createdAt DESC, id ASC)
            const cursorCondition = {
                OR: [
                    { createdAt: { lt: opts.cursor.createdAt } },
                    { createdAt: opts.cursor.createdAt, id: { gt: opts.cursor.id } },
                ]
            };
            if (where.AND) { (where.AND as any[]).push(cursorCondition); }
            else { where.AND = [cursorCondition]; }
        } else {
            // Complex sorting cursor logic:
            const field = primarySort.field === "assignee" ? "assigneeTo" : primarySort.field === "tags" ? "tagId" : primarySort.field;
            const dir = primarySort.direction;
            const op = dir === "asc" ? "gt" : "lt";
            const val = opts.cursor[field];

            if (val !== undefined) {
                const cursorCondition = {
                    OR: [
                        { [field]: { [op]: val } },
                        { [field]: val, id: { gt: opts.cursor.id } },
                    ]
                };
                if (where.AND) { (where.AND as any[]).push(cursorCondition); }
                else { where.AND = [cursorCondition]; }
            } else {
                // Fallback to default if field missing in cursor
                const cursorCondition = {
                    OR: [
                        { createdAt: { lt: opts.cursor.createdAt } },
                        { createdAt: opts.cursor.createdAt, id: { gt: opts.cursor.id } },
                    ]
                };
                if (where.AND) { (where.AND as any[]).push(cursorCondition); }
                else { where.AND = [cursorCondition]; }
            }
        }
    }

    return where;
}
