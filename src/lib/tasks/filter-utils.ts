import { Prisma, TaskStatus } from "@/generated/prisma";
import { TaskFilters } from "@/types/task-filters";

/**
 * Builds an optimized Prisma WHERE clause for Task filtering
 * 
 * This function constructs index-friendly queries that leverage:
 * - Composite indexes: (projectId, status), (status, createdAt)
 * - Single-column indexes: workspaceId, assigneeTo, tagId, isPinned
 * 
 * PostgreSQL will automatically use index intersection when beneficial.
 * 
 * @param filters - The filter criteria
 * @param authorizedProjectIds - Project IDs the user has access to (undefined = all projects)
 * @returns Prisma WHERE clause optimized for index usage
 */
export function buildTaskFilter(
    filters: TaskFilters,
    authorizedProjectIds?: string[]
): Prisma.TaskWhereInput {
    // console.log('🔍 [FILTER DEBUG] buildTaskFilter called with:', JSON.stringify(filters, null, 2));

    const where: Prisma.TaskWhereInput = {
        // ALWAYS filter by workspaceId first (most selective)
        workspaceId: filters.workspaceId,

        // CRITICAL: Only return parent tasks (subtasks are loaded on-demand)
        // This ensures the main table shows only top-level tasks
        // Subtasks are fetched separately via loadSubTasksAction when user expands a task
        parentTaskId: null,
    };

    // ============================================================
    // IMPORTANT: ALL FILTERS CHECK SUBTASKS
    // ============================================================
    // Parent tasks are just containers/identity
    // All actual work (status, assignee, tags, dates) is in subtasks
    // So we filter by subtask properties, not parent properties

    // Build subtask filter conditions
    const subtaskConditions = buildSubTaskConditions(filters);

    // ============================================================
    // PROJECT SCOPE (uses idx_task_project_id)
    // ============================================================
    if (filters.projectId) {
        // Single project filter
        where.projectId = filters.projectId;
    } else if (authorizedProjectIds && authorizedProjectIds.length > 0) {
        // Multi-project filter (non-admin users)
        where.projectId = { in: authorizedProjectIds };
    }

    // ============================================================
    // APPLY SUBTASK FILTERS
    // ============================================================
    // Show parent task if ANY subtask matches all the filter criteria
    if (Object.keys(subtaskConditions).length > 0) {
        where.subTasks = {
            some: subtaskConditions
        };
        // console.log('🔍 [FILTER DEBUG] Subtask conditions applied:', JSON.stringify(subtaskConditions, null, 2));
    }

    // ============================================================
    // PINNED FILTER - This can apply to parent task
    // ============================================================
    if (filters.isPinned !== undefined) {
        where.isPinned = filters.isPinned;
    }

    // console.log('🔍 [FILTER DEBUG] Final WHERE clause:', JSON.stringify(where, null, 2));
    return where;
}

/**
 * Builds the conditions for filtering subtasks directly
 */
export function buildSubTaskConditions(filters: TaskFilters): any {
    const conditions: any = {};

    // ============================================================
    // STATUS FILTER
    // ============================================================
    if (filters.status) {
        if (Array.isArray(filters.status) && filters.status.length > 0) {
            conditions.status = { in: filters.status };
        } else if (!Array.isArray(filters.status)) {
            conditions.status = filters.status;
        }
    }

    // ============================================================
    // ASSIGNEE FILTER
    // ============================================================
    if (filters.assigneeId) {
        const assigneeIds = Array.isArray(filters.assigneeId) && filters.assigneeId.length > 0
            ? filters.assigneeId
            : !Array.isArray(filters.assigneeId)
                ? [filters.assigneeId]
                : [];

        if (assigneeIds.length > 0) {
            conditions.assigneeTo = { in: assigneeIds };
        }
    }

    // ============================================================
    // TAG FILTER
    // ============================================================
    if (filters.tagId) {
        if (Array.isArray(filters.tagId) && filters.tagId.length > 0) {
            conditions.tagId = { in: filters.tagId };
        } else if (!Array.isArray(filters.tagId)) {
            conditions.tagId = filters.tagId;
        }
    }

    // ============================================================
    // DATE RANGE FILTERS
    // ============================================================
    if (filters.dueAfter || filters.dueBefore) {
        conditions.startDate = {};

        if (filters.dueAfter) {
            conditions.startDate.gte = filters.dueAfter;
        }

        if (filters.dueBefore) {
            conditions.startDate.lte = filters.dueBefore;
        }
    }

    // ============================================================
    // FULL-TEXT SEARCH
    // ============================================================
    if (filters.search && filters.search.trim().length > 0) {
        const searchTerm = filters.search.trim();

        conditions.OR = [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
            { taskSlug: { contains: searchTerm, mode: 'insensitive' } },
        ];
    }

    return conditions;
}

/**
 * Builds a WHERE clause for facet counting (excludes the facet being counted)
 * 
 * Example: When counting available statuses, we exclude the current status filter
 * so users can see "what other statuses exist in the filtered dataset"
 */
export function buildFacetFilter(
    filters: TaskFilters,
    excludeFacet: 'status' | 'assigneeId' | 'tagId',
    authorizedProjectIds?: string[]
): Prisma.TaskWhereInput {
    const facetFilters = { ...filters };

    // Remove the facet we're counting
    delete facetFilters[excludeFacet];

    return buildTaskFilter(facetFilters, authorizedProjectIds);
}
