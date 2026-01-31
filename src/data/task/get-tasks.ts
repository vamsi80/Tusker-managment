"use server";

import { cache } from "react";
import prisma from "@/lib/db";
import { getUserPermissions, getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { unstable_cache } from "next/cache";
import { TaskStatus } from "@/generated/prisma";
import { CacheTags } from "@/data/cache-tags";
import { TaskFilters } from "@/types/task-filters";
import { buildTaskFilter, buildSubTaskConditions } from "@/lib/tasks/filter-utils";

export type TaskViewType = "list" | "kanban" | "gantt" | "calendar";

/**
 * Enhanced Filters for tasks (Unified)
 */
export interface GetTasksOptions {
    workspaceId: string;
    projectId?: string;
    view?: TaskViewType;
    status?: string | string[];
    permissionStatus?: string | string[]; // Legacy alias for status
    page?: number;
    limit?: number;
    search?: string;
    assigneeId?: string | string[];
    tag?: string | string[]; // Legacy
    tagId?: string | string[];
    startDate?: string | Date; // flexible input
    endDate?: string | Date; // flexible input
    dueBefore?: string | Date;
    dueAfter?: string | Date;
    filterParentTaskId?: string;
    isPinned?: boolean;

    // PERFORMANCE FLAGS
    includeFacets?: boolean; // Whether to calculate sidebar counts (expensive)
}

/**
 * Helper to ensure array for consistent filtering
 */
const toArray = <T>(val: T | T[] | undefined): T[] | undefined => {
    if (val === undefined) return undefined;
    return Array.isArray(val) ? val : [val];
};

/**
 * Unified Task Data Fetching Function
 * 
 * Fetches tasks based on the current view context:
 * - List/Gantt: Fetches Parent Tasks (Hierarchical root)
 * - Kanban: Fetches Subtasks (Work items) with full context (Project, Parent)
 * 
 * Performance:
 * - Uses parallel Promise.all for independent queries
 * - Uses index-driven filtering
 * - Supports optional Facet calculation
 */
async function _getTasksInternal(
    workspaceId: string,
    workspaceMemberId: string,
    userId: string,
    isAdmin: boolean,
    leadProjectIds: string[],
    options: GetTasksOptions
) {
    const {
        projectId, view, page = 1, limit = 10,
        includeFacets = false
    } = options;

    const skip = (page - 1) * limit;

    // =================================================================
    // 1. NORMALIZE FILTERS
    // =================================================================
    const status = toArray(options.status || options.permissionStatus);
    const assigneeIds = toArray(options.assigneeId);
    const tagIds = toArray(options.tagId || options.tag);

    // Date normalization
    const toDate = (d: string | Date | undefined) => d ? new Date(d) : undefined;
    const startDate = toDate(options.startDate);
    const endDate = toDate(options.endDate);
    const dueAfter = toDate(options.dueAfter) || startDate;
    const dueBefore = toDate(options.dueBefore) || endDate;

    // Filter Object for buildTaskFilter utility
    const filterInput: TaskFilters = {
        workspaceId,
        projectId: projectId,
        status: status as any,
        assigneeId: assigneeIds,
        tagId: tagIds,
        search: options.search,
        dueAfter: dueAfter,
        dueBefore: dueBefore,
        isPinned: options.isPinned,
    };

    // =================================================================
    // 2. AUTHORIZATION & PROJECT SCOPE
    // =================================================================
    // We need to know which projects are accessible to build the query

    let authorizedProjectIds: string[] = [];

    if (projectId) {
        // Single Project Scope
        authorizedProjectIds = [projectId];
    } else {
        // Workspace Scope: Determine all accessible projects
        if (isAdmin) {
            // Admin has access to all projects in workspace
            const allProjects = await prisma.project.findMany({
                where: { workspaceId },
                select: { id: true }
            });
            authorizedProjectIds = allProjects.map(p => p.id);
        } else {
            // Member/Lead has access to projects they are part of
            const myProjects = await prisma.projectMember.findMany({
                where: {
                    workspaceMemberId,
                    hasAccess: true
                },
                select: { projectId: true }
            });
            authorizedProjectIds = myProjects.map(p => p.projectId);
        }
    }

    if (authorizedProjectIds.length === 0) {
        return {
            tasks: [],
            totalCount: 0,
            hasMore: false,
            facets: { status: {}, assignee: {}, tags: {}, projects: {} }
        };
    }

    // =================================================================
    // 3. BUILD WHERE CLAUSE
    // =================================================================

    const isKanban = view === 'kanban';

    // Helper: Build manual where clause for Kanban (Subtasks)
    // We cannot use buildTaskFilter because it wraps filters in `subTasks: { some: ... }`
    // which fails for Subtasks (as they are leaves).
    const buildKanbanWhere = (baseFilter: TaskFilters, pIds?: string[]) => {
        const kWhere: any = {
            workspaceId,
            parentTaskId: { not: null }, // Kanban = Subtasks
        };

        if (pIds) kWhere.projectId = { in: pIds };
        else if (baseFilter.projectId) kWhere.projectId = baseFilter.projectId;

        if (baseFilter.status) kWhere.status = { in: baseFilter.status };
        if (baseFilter.assigneeId) kWhere.assigneeTo = { in: baseFilter.assigneeId };
        if (baseFilter.tagId) kWhere.tagId = { in: baseFilter.tagId };

        if (baseFilter.isPinned !== undefined) kWhere.isPinned = baseFilter.isPinned;

        if (baseFilter.search) {
            kWhere.OR = [
                { name: { contains: baseFilter.search, mode: 'insensitive' } },
                { taskSlug: { contains: baseFilter.search, mode: 'insensitive' } }
            ];
        }
        return kWhere;
    };

    // Calculate Permissions
    const fullAccessIds = isAdmin
        ? authorizedProjectIds
        : leadProjectIds.filter(id => authorizedProjectIds.includes(id));

    const isMemberOnly = !isAdmin && fullAccessIds.length === 0;
    const isHybrid = !isAdmin && fullAccessIds.length > 0 && fullAccessIds.length < authorizedProjectIds.length;

    let mainWhere: any = {};

    if (isMemberOnly) {
        // Strict Member
        filterInput.assigneeId = [userId];

        if (isKanban) {
            // Kanban: Must be assigned directly
            mainWhere = buildKanbanWhere(filterInput, authorizedProjectIds);
        } else {
            // List: buildTaskFilter OK (checks subtask assignment)
            mainWhere = buildTaskFilter(filterInput, authorizedProjectIds);
            mainWhere.parentTaskId = options.filterParentTaskId || null;
        }

    } else if (isHybrid) {
        // Hybrid
        const memberOnlyIds = authorizedProjectIds.filter(id => !fullAccessIds.includes(id));

        if (isKanban) {
            // Manual Hybrid Construction for Kanban
            // Content Filter (no project scope yet)
            const contentFilter = { ...filterInput };
            if (!options.assigneeId) delete contentFilter.assigneeId;
            const contentWhere = buildKanbanWhere(contentFilter, undefined);

            const permissionGate = {
                OR: [
                    { projectId: { in: fullAccessIds } }, // Full Access
                    {
                        projectId: { in: memberOnlyIds },
                        assigneeTo: userId // Member Projects: Direct Assignment
                    }
                ]
            };
            mainWhere = { AND: [contentWhere, permissionGate] };

        } else {
            // List: Use standard logic
            const contentFilterInput = { ...filterInput };
            if (!options.assigneeId) delete contentFilterInput.assigneeId;

            const contentWhere = buildTaskFilter(contentFilterInput, undefined);
            const permissionGate = {
                OR: [
                    { projectId: { in: fullAccessIds } },
                    {
                        projectId: { in: memberOnlyIds },
                        subTasks: { some: { assigneeTo: userId } } // List: Child assigned
                    }
                ]
            };
            mainWhere = { AND: [contentWhere, permissionGate] };
            mainWhere.AND[0].parentTaskId = options.filterParentTaskId || null;
        }

    } else {
        // Admin / Full Lead
        if (isKanban) {
            mainWhere = buildKanbanWhere(filterInput, authorizedProjectIds);
        } else {
            mainWhere = buildTaskFilter(filterInput, authorizedProjectIds);
            mainWhere.parentTaskId = options.filterParentTaskId || null;
        }
    }

    // =================================================================
    // 4. FACET QUERIES (Optional)
    // =================================================================
    let facetQueries: Promise<any>[] = [];

    if (includeFacets) {
        const facetBaseWhere: any = {
            workspaceId,
            projectId: { in: authorizedProjectIds },
        };

        if (options.filterParentTaskId) {
            facetBaseWhere.parentTaskId = options.filterParentTaskId;
        } else if (isKanban) {
            facetBaseWhere.parentTaskId = { not: null };
        } else {
            facetBaseWhere.parentTaskId = null;
        }

        if (isMemberOnly) {
            // @ts-ignore
            facetBaseWhere.assigneeTo = userId;
        }

        const buildFacetWhere = (excludeKey: keyof TaskFilters) => {
            const f = { ...filterInput };
            delete f[excludeKey];
            return {
                ...facetBaseWhere,
                projectId: filterInput.projectId ? filterInput.projectId : facetBaseWhere.projectId,
                ...buildSubTaskConditions(f)
            };
        };

        facetQueries = [
            prisma.task.groupBy({ by: ['status'], where: buildFacetWhere('status'), _count: { status: true } }),
            prisma.task.groupBy({ by: ['assigneeTo'], where: buildFacetWhere('assigneeId'), _count: { assigneeTo: true } }),
            prisma.task.groupBy({ by: ['tagId'], where: buildFacetWhere('tagId'), _count: { tagId: true } }),
            prisma.task.groupBy({ by: ['projectId'], where: buildFacetWhere('projectId'), _count: { projectId: true } }),
        ];
    }

    // =================================================================
    // 5. EXECUTE QUERIES PARALLEL
    // =================================================================

    const [tasks, totalCount, ...facetResults] = await Promise.all([
        // 1. Data Query
        prisma.task.findMany({
            where: mainWhere,
            select: {
                id: true,
                name: true,
                status: true,
                taskSlug: true,
                description: true,
                startDate: true,
                dueDate: true,
                days: true,
                projectId: true,
                isPinned: true,
                pinnedAt: true,
                createdAt: true,
                updatedAt: true,
                position: true,
                createdById: true,
                reviewerId: true,
                assignee: {
                    select: { id: true, name: true, surname: true, image: true }
                },
                reviewer: {
                    select: { id: true, name: true, surname: true, image: true }
                },
                createdBy: {
                    select: { id: true, name: true, surname: true, image: true }
                },
                _count: {
                    select: { subTasks: true, reviewComments: true }
                },
                // Always select Relations
                parentTask: {
                    select: { id: true, name: true, taskSlug: true }
                },
                project: {
                    select: {
                        id: true, name: true, slug: true, color: true, workspaceId: true,
                        projectMembers: {
                            where: { projectRole: "PROJECT_MANAGER" },
                            take: 1,
                            select: {
                                workspaceMember: {
                                    select: { user: { select: { name: true, surname: true, image: true } } }
                                }
                            }
                        }
                    }
                },
                tag: { select: { id: true, name: true } }
            },
            orderBy: view === 'kanban'
                ? [{ isPinned: 'desc' }, { position: 'asc' }]
                : [{ isPinned: 'desc' }, { position: 'asc' }, { createdAt: 'desc' }],
            skip,
            take: limit
        }),

        // 2. Count Query
        prisma.task.count({ where: mainWhere }),

        // 3. Facets (if any)
        ...facetQueries
    ]);

    // =================================================================
    // 6. FORMAT RESULTS
    // =================================================================

    let facets = { status: {}, assignee: {}, tags: {}, projects: {} };

    if (includeFacets) {
        const [statusCounts, assigneeCounts, tagCounts, projectCounts] = facetResults;

        const formatFacet = (arr: any[], key: string) =>
            arr.reduce((acc, curr) => ({
                ...acc,
                [curr[key] || 'unassigned']: curr._count[key]
            }), {});

        facets = {
            status: formatFacet(statusCounts, 'status'),
            assignee: formatFacet(assigneeCounts, 'assigneeTo'),
            tags: formatFacet(tagCounts, 'tagId'),
            projects: formatFacet(projectCounts, 'projectId'),
        };
    }

    return {
        tasks,
        totalCount,
        hasMore: skip + tasks.length < totalCount,
        facets
    };
}

/**
 * Public API for Unified Task Fetching
 */
export const getTasks = cache(async (options: GetTasksOptions) => {
    const { workspaceId, projectId } = options;

    // Auth & Permissions
    let permissions;
    let leadProjectIds: string[] = [];
    let isWorkspaceAdmin = false;

    if (projectId) {
        permissions = await getUserPermissions(workspaceId, projectId);
        isWorkspaceAdmin = permissions.isWorkspaceAdmin;
        if (permissions.isProjectLead || permissions.isProjectManager) {
            leadProjectIds = [projectId];
        }
    } else {
        const wsPerms = await getWorkspacePermissions(workspaceId);
        permissions = wsPerms;
        isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;
        leadProjectIds = [...(wsPerms.leadProjectIds || []), ...(wsPerms.managedProjectIds || [])];
    }

    if (!permissions.workspaceMemberId) {
        return {
            tasks: [],
            totalCount: 0,
            hasMore: false,
            facets: { status: {}, assignee: {}, tags: {}, projects: {} }
        };
    }

    // Use Cache
    // Key uses a hash of all options to handle complex filters
    const filterHash = JSON.stringify(options);

    const roleKey = isWorkspaceAdmin ? 'admin' :
        ('isMember' in permissions && permissions.isMember) ? `member-${permissions.workspaceMember.userId}` :
            `access-${leadProjectIds.sort().join(',')}`;

    const cacheKey = `tasks-unified-${workspaceId}-${roleKey}-${filterHash}-v5`;
    const tag = projectId ? `project-tasks-${projectId}` : `workspace-tasks-${workspaceId}`;

    return await unstable_cache(
        () => _getTasksInternal(
            workspaceId,
            permissions.workspaceMemberId!,
            permissions.workspaceMember!.userId,
            isWorkspaceAdmin,
            leadProjectIds,
            options
        ),
        [cacheKey],
        {
            tags: [tag],
            revalidate: 30
        }
    )();
});

export type GetTasksResponse = Awaited<ReturnType<typeof getTasks>>;
