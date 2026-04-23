import "server-only";

import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { recordActivity } from "@/lib/audit";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";
import { parseIST } from "@/lib/utils";
import { getSubTasksByParentIds } from "@/data/task/get-subtasks-batch";
import { logger } from "@/lib/logger";
import {
  getTaskSelect,
  TaskCursor,
  buildProjectRootWhere,
  buildSubtaskExpansionWhere,
  buildWorkspaceFilterWhere,
  WorkspaceFilterOpts,
  buildOrderBy,
  buildSeekCondition,
  toUTCDateOnly,
  addOneDayUTC,
  SORT_MAP,
} from "@/lib/tasks/query-builder";

export type TaskStatus =
  | "TO_DO"
  | "IN_PROGRESS"
  | "CANCELLED"
  | "REVIEW"
  | "HOLD"
  | "COMPLETED";

const toArray = <T>(v: T | T[] | undefined): T[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

interface CreateTaskParams {
  name: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  permissions: any;
  tagIds?: string[];
}

interface CreateSubTaskParams {
  name: string;
  description?: string;
  projectId: string;
  workspaceId: string;
  parentTaskId: string;
  userId: string;
  permissions: any;
  assigneeUserId?: string | null;
  reviewerUserId?: string | null;
  tagIds?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  days?: number;
  status?: TaskStatus;
}

export class TasksService {
  /**
   * Create a base task (Parent/Identity task)
   */
  static async createTask({
    name,
    projectId,
    workspaceId,
    userId,
    permissions,
    tagIds,
  }: CreateTaskParams) {
    const canSucceed =
      permissions.isWorkspaceAdmin || permissions.canCreateSubTask;
    if (!canSucceed) {
      throw AppError.Forbidden("You don't have permission to create tasks.");
    }

    let projectMember = permissions.projectMember;

    // Auto-join admin if not in project
    if (!projectMember && permissions.isWorkspaceAdmin) {
      projectMember = await prisma.projectMember.create({
        data: {
          projectId,
          workspaceMemberId: permissions.workspaceMemberId!,
          projectRole: "PROJECT_MANAGER",
          hasAccess: true,
        },
      });
    }

    if (!projectMember) {
      throw AppError.Forbidden("You must be a project member to create tasks.");
    }

    // Generate slug
    const { generateUniqueSlug } = await import("@/lib/slug-generator");
    const slug = await generateUniqueSlug(name, "task");

    const newTask = await prisma.task.create({
      data: {
        name,
        taskSlug: slug,
        projectId,
        workspaceId,
        createdById: projectMember.id,
        isParent: true, // Mark as parent identity
        tags: tagIds && tagIds.length > 0 ? { connect: tagIds.map(id => ({ id })) } : undefined,
      },
      include: {
        _count: { select: { subTasks: true } },
      },
    });

    // Record Activity
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { slug: true },
      });
      await recordActivity({
        userId,
        userName: permissions.userSurname,
        workspaceId,
        action: "TASK_CREATED",
        entityType: "TASK",
        entityId: newTask.id,
        newData: { ...newTask, projectSlug: project?.slug },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(newTask.id),
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Task activity failed:", e);
    }

    return newTask;
  }

  /**
   * List tasks with unified filtering and permissions
   */
  static async listTasks(opts: any, userId: string) {
    const { workspaceId, projectId } = opts;

    if (opts.cursor && typeof opts.cursor.createdAt === "string") {
      opts.cursor.createdAt = new Date(opts.cursor.createdAt);
    }

    const {
      isWorkspaceAdmin,
      fullAccessProjectIds,
      restrictedProjectIds,
      authorizedProjectIds,
    } = await this.resolveTaskPermissions(workspaceId, projectId, userId);

    if (!isWorkspaceAdmin && authorizedProjectIds.length === 0) {
      return {
        tasks: [],
        totalCount: 0,
        hasMore: false,
        nextCursor: null,
        facets: { status: {}, assignee: {}, tags: {}, projects: {} },
      };
    }

    const result = await this._getTasksInternal(
      workspaceId,
      userId,
      isWorkspaceAdmin,
      fullAccessProjectIds,
      restrictedProjectIds,
      opts,
    );

    this.stripParentMetadata(result);
    console.log(
      `[TasksService] Final Result: ${result.tasks.length} roots, ${result.totalCount} total`,
    );
    return result;
  }

  public static mapToLegacyMetadata(task: any) {
    if (!task) return task;
    const toLegacy = (obj: any) => {
      const user = obj?.workspaceMember?.user || obj?.user || obj;
      if (!user?.id && !user?.surname) return obj;

      const userData = {
        id: user.id,
        surname: user.surname,
      };

      return {
        ...userData, // Support for flat access (assignee.surname)
        workspaceMember: {
          user: userData, // Support for legacy access (assignee.workspaceMember.user.surname)
        },
      };
    };

    if (task.assignee) task.assignee = toLegacy(task.assignee);
    if (task.reviewer) task.reviewer = toLegacy(task.reviewer);
    if (task.createdBy) task.createdBy = toLegacy(task.createdBy);

    if (task._count) {
      task.subtaskCount = task._count.subTasks;
      delete task._count;
    }

    if (!task.isParent) {
      delete task.subTasks;
      delete task.subtaskCount;
    } else if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks = task.subTasks.map((st: any) =>
        this.mapToLegacyMetadata(st),
      );
    }

    return task;
  }

  public static mapToFlatMetadata(task: any) {
    if (!task) return task;
    const flatten = (obj: any) => {
      const user = obj?.workspaceMember?.user || obj?.user || obj;
      // 🛡️ Guard: If we don't have an ID, we can't flatten to a valid user object
      if (!user?.id) return obj;
      return {
        id: user.id,
        surname: user.surname || "",
      };
    };

    if (task.assignee) task.assignee = flatten(task.assignee);
    if (task.reviewer) task.reviewer = flatten(task.reviewer);
    if (task.createdBy) task.createdBy = flatten(task.createdBy);

    if (task._count) {
      task.subtaskCount = task._count.subTasks;
      delete task._count;
    }

    if (!task.isParent) {
      delete task.subTasks;
      delete task.subtaskCount;
    } else if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks = task.subTasks.map((st: any) =>
        this.mapToFlatMetadata(st),
      );
    }

    return task;
  }

  private static stripParentMetadata(result: any) {
    if (!result) return;

    const processTask = (task: any) => {
      this.mapToFlatMetadata(task);

      if (task?.isParent) {
        // Strict Allowed-list for Parent tasks to minimize payload weight
        const allowedFields = ["id", "name", "taskSlug", "isParent", "projectId", "subTasks", "subtaskCount", "createdAt"];
        Object.keys(task).forEach(key => {
          if (!allowedFields.includes(key)) {
            delete task[key];
          }
        });
      }
    };

    if (result.tasks && Array.isArray(result.tasks)) {
      result.tasks.forEach(processTask);
    }

    if (result.tasksByStatus) {
      Object.keys(result.tasksByStatus).forEach((status) => {
        const colData = result.tasksByStatus[status];
        const colTasks = Array.isArray(colData)
          ? colData
          : colData?.tasks || [];
        colTasks.forEach(processTask);
      });
    }
  }

  public static async resolveTaskPermissions(
    workspaceId: string,
    projectId?: string,
    userId?: string,
  ) {
    const { getUserPermissions, getWorkspacePermissions } =
      await import("@/data/user/get-user-permissions");

    if (projectId) {
      const permissions = await getUserPermissions(
        workspaceId,
        projectId,
        userId,
      );
      const hasFullAccess =
        permissions.isWorkspaceAdmin ||
        permissions.isProjectLead ||
        permissions.isProjectManager;

      return {
        permissions,
        isWorkspaceAdmin: permissions.isWorkspaceAdmin,
        authorizedProjectIds: [projectId],
        fullAccessProjectIds: hasFullAccess ? [projectId] : [],
        restrictedProjectIds: hasFullAccess ? [] : [projectId],
      };
    } else {
      const wsPerms = await getWorkspacePermissions(workspaceId, userId);
      const isWorkspaceAdmin = wsPerms.isWorkspaceAdmin;
      const authorizedProjectIds = isWorkspaceAdmin
        ? []
        : [
          ...(wsPerms.leadProjectIds || []),
          ...(wsPerms.managedProjectIds || []),
          ...(wsPerms.memberProjectIds || []),
          ...(wsPerms.viewerProjectIds || []),
        ];

      const fullAccessProjectIds = [
        ...(wsPerms.leadProjectIds ?? []),
        ...(wsPerms.managedProjectIds ?? []),
      ];

      const restrictedProjectIds = authorizedProjectIds.filter(
        (id) => !fullAccessProjectIds.includes(id),
      );

      return {
        permissions: wsPerms,
        isWorkspaceAdmin,
        authorizedProjectIds,
        fullAccessProjectIds,
        restrictedProjectIds,
      };
    }
  }

  private static async _getTasksInternal(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: any,
  ) {
    if (opts.startDate && !opts.dueAfter) opts.dueAfter = opts.startDate;
    if (opts.endDate && !opts.dueBefore) opts.dueBefore = opts.endDate;

    const startTime = performance.now();
    const { projectId, hierarchyMode, filterParentTaskId } = opts;
    let strategy = "NONE";

    try {
      const toArray = <T>(v: T | T[] | undefined): T[] | undefined =>
        v === undefined ? undefined : Array.isArray(v) ? v : [v];

      const isMinimal =
        opts.hierarchyMode === "parents" && !opts.includeSubTasks;

      const hasExplicitFilters = !!(
        (opts.status && toArray(opts.status)?.length) ||
        (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
        (opts.tagId && toArray(opts.tagId)?.length) ||
        (opts.search && opts.search.trim().length > 0) ||
        opts.dueAfter ||
        opts.dueBefore ||
        (opts.sorts && opts.sorts.length > 0)
      );

      const emptyFacets = {
        status: {} as Record<string, number>,
        assignee: {} as Record<string, number>,
        tags: {} as Record<string, number>,
        projects: {} as Record<string, number>,
      };

      if (
        !projectId &&
        !hasExplicitFilters &&
        !opts.expandedProjectIds?.length &&
        hierarchyMode !== "parents"
      ) {
        strategy = "SAFETY_GUARD";
        return {
          tasks: [],
          totalCount: 0,
          hasMore: false,
          nextCursor: null,
          facets: emptyFacets,
        };
      }

      if (filterParentTaskId) {
        strategy = "SUBTASK_EXPANSION";
        const result = await this._fetchSubtasks(
          filterParentTaskId,
          userId,
          isAdmin,
          fullAccessProjectIds,
          restrictedProjectIds,
          { ...opts, isMinimal },
        );
        return { ...result, totalCount: null, facets: emptyFacets };
      }

      if (
        projectId &&
        !hasExplicitFilters &&
        !opts.excludeParents &&
        !opts.onlySubtasks &&
        (hierarchyMode === "parents" ||
          hierarchyMode === "subtasks" ||
          !hierarchyMode)
      ) {
        strategy = opts.includeSubTasks
          ? "RECURSIVE_HIERARCHY"
          : "PROJECT_ROOT";
        const result = await this._fetchProjectRoot(
          projectId,
          workspaceId,
          userId,
          isAdmin,
          fullAccessProjectIds,
          restrictedProjectIds,
          opts,
        );

        if (opts.includeSubTasks && result.tasks.length > 0) {
          const parentIds = result.tasks
            .filter((t: any) => t.isParent)
            .map((t: any) => t.id);
          if (parentIds.length > 0) {
            const hasFullAccess =
              isAdmin ||
              (projectId ? fullAccessProjectIds.includes(projectId) : false);

            const subtasks = await prisma.task.findMany({
              where: buildSubtaskExpansionWhere(undefined, {
                parentIds,
                status: toArray(opts.status),
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                userId,
                isAdmin,
                isRestrictedMember: !hasFullAccess,
              }),
              select: getTaskSelect(opts.view_mode, false), // Subtasks are never minimal in expansion
              orderBy: buildOrderBy(opts.sorts),
              take: 200, // focus on performance: fetch subtasks for initial roots with a safe cap
            });

            // Use a map for O(n) grouping instead of O(n^2) nested filtering
            const subtaskMap = new Map<string, any[]>();
            subtasks.forEach((st) => {
              const pid = st.parentTaskId;
              if (pid) {
                if (!subtaskMap.has(pid)) subtaskMap.set(pid, []);
                subtaskMap.get(pid)!.push(st);
              }
            });

            result.tasks.forEach((parent: any) => {
              if (parent.isParent) {
                parent.subTasks = subtaskMap.get(parent.id) || [];
              } else {
                parent.subTasks = [];
              }
            });
          }
        }

        return { ...result, facets: (result as any).facets || emptyFacets };
      }

      const isSorting = opts.sorts && opts.sorts.length > 0;

      if (
        (!isSorting || opts.view_mode === "gantt") &&
        !opts.onlySubtasks &&
        !opts.excludeParents &&
        (hasExplicitFilters ||
          hierarchyMode === "parents" ||
          hierarchyMode === "subtasks" ||
          hierarchyMode === "recursive")
      ) {
        strategy = opts.includeSubTasks
          ? "FILTERED_RECURSIVE_HIERARCHY"
          : "FILTERED_HIERARCHY";
        const result = await this._fetchFilteredHierarchy(
          workspaceId,
          userId,
          isAdmin,
          fullAccessProjectIds,
          restrictedProjectIds,
          opts,
        );

        return { ...result, facets: (result as any).facets || emptyFacets };
      }

      if (opts.groupBy === "status") {
        const targetStatuses = toArray(opts.status);
        // Default to 5 per status for initial parallel load,
        // handleLoadMore will explicitly request 10.
        const perStatusLimit =
          opts.limit ?? (opts.view_mode === "kanban" ? 5 : 15);

        // --- STRATEGY A: SINGLE STATUS PAGINATION (Load More) ---
        // If the user specifies exactly one status, we treat this as a pagination request for one column.
        if (targetStatuses && targetStatuses.length === 1) {
          strategy = "KANBAN_PAGINATED_STATUS";
          const status = targetStatuses[0];

          const where = buildWorkspaceFilterWhere(
            {
              workspaceId,
              ids: opts.ids,
              projectId: opts.projectId,
              assigneeId: toArray(opts.assigneeId),
              tagId: toArray(opts.tagId),
              search: opts.search,
              dueAfter: opts.dueAfter,
              dueBefore: opts.dueBefore
                ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
                : undefined,
              isAdmin,
              fullAccessProjectIds,
              restrictedProjectIds,
              status: [status as any],
              cursor: opts.cursor,
              onlyParents:
                opts.onlyParents ||
                (!hasExplicitFilters && hierarchyMode === "parents"),
              onlySubtasks:
                opts.onlySubtasks ||
                (!hasExplicitFilters && hierarchyMode === "children"),
              excludeParents: opts.excludeParents,
              view_mode: opts.view_mode,
            },
            userId,
          );

          const tasks = await prisma.task.findMany({
            where,
            take: perStatusLimit + 1,
            select: getTaskSelect(opts.view_mode, isMinimal),
            orderBy: buildOrderBy(opts.sorts),
          });

          const trueHasMore = tasks.length > perStatusLimit;
          if (trueHasMore) tasks.pop();

          // Handle Subtask Expansion
          if (opts.includeSubTasks && tasks.length > 0) {
            const parentIds = tasks.filter((t) => t.isParent).map((t) => t.id);
            if (parentIds.length > 0) {
              const subtasks = await prisma.task.findMany({
                where: buildSubtaskExpansionWhere(undefined, {
                  parentIds,
                  status: [status as any],
                  assigneeId: toArray(opts.assigneeId),
                  tagId: toArray(opts.tagId),
                  search: opts.search,
                  userId,
                  isAdmin,
                }),
                select: getTaskSelect(opts.view_mode, false), // subtasks never minimal
                orderBy: buildOrderBy(opts.sorts),
              });
              tasks.forEach((parent: any) => {
                if (parent.isParent) {
                  parent.subTasks = subtasks.filter(
                    (st) => st.parentTaskId === parent.id,
                  );
                } else {
                  parent.subTasks = [];
                }
              });
            }
          }

          const primarySort = opts.sorts?.[0];
          const lastTask =
            tasks.length > 0 ? (tasks[tasks.length - 1] as any) : null;
          const nextCursor: any =
            trueHasMore && lastTask
              ? primarySort && SORT_MAP[primarySort.field]
                ? {
                  id: lastTask.id,
                  [SORT_MAP[primarySort.field].dbField]:
                    lastTask[SORT_MAP[primarySort.field].dbField],
                }
                : { id: lastTask.id, createdAt: lastTask.createdAt }
              : null;

          const totalCount = await prisma.task.count({ where });

          return {
            tasks,
            totalCount: tasks.length,
            hasMore: trueHasMore,
            nextCursor,
            facets: {
              ...emptyFacets,
              status: { [status]: totalCount },
            },
          };
        }

        // --- STRATEGY B: PARALLEL ALL (Initial Load / Filter) ---
        strategy = "KANBAN_OPTIMIZED_PARALLEL";

        // 1. Get counts for all statuses (efficient)
        const countWhere = JSON.parse(
          JSON.stringify(
            buildWorkspaceFilterWhere(
              {
                workspaceId,
                ids: opts.ids,
                projectId: opts.projectId,
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                dueAfter: toUTCDateOnly(opts.dueAfter),
                dueBefore: opts.dueBefore
                  ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
                  : undefined,
                isAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                onlyParents:
                  opts.onlyParents ||
                  (!hasExplicitFilters && hierarchyMode === "parents"),
                onlySubtasks:
                  opts.onlySubtasks ||
                  (!hasExplicitFilters && hierarchyMode === "children"),
                excludeParents: opts.excludeParents,
                view_mode: opts.view_mode,
              },
              userId,
            ),
          ),
        );

        const countsResult = await prisma.task.groupBy({
          by: ["status"],
          where: countWhere,
          _count: true,
        });

        const statusCounts: Record<string, number> = {};
        countsResult.forEach((c) => {
          if (c.status) statusCounts[c.status] = c._count;
        });

        // 2. Define the statuses we care about
        const allStatuses = [
          "TO_DO",
          "IN_PROGRESS",
          "REVIEW",
          "HOLD",
          "COMPLETED",
          "CANCELLED",
        ];

        // 3. Fetch tasks for each status in parallel
        const statusTasksResults = await Promise.all(
          allStatuses.map(async (status) => {
            const statusWhere = buildWorkspaceFilterWhere(
              {
                workspaceId,
                ids: opts.ids,
                projectId: opts.projectId,
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                dueAfter: opts.dueAfter,
                dueBefore: opts.dueBefore
                  ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
                  : undefined,
                isAdmin,
                fullAccessProjectIds,
                restrictedProjectIds,
                status: [status as any],
                onlyParents:
                  opts.onlyParents ||
                  (!hasExplicitFilters && hierarchyMode === "parents"),
                onlySubtasks:
                  opts.onlySubtasks ||
                  (!hasExplicitFilters && hierarchyMode === "children"),
                excludeParents: opts.excludeParents,
                view_mode: opts.view_mode,
              },
              userId,
            );

            return prisma.task.findMany({
              where: statusWhere,
              take: perStatusLimit + 1,
              select: getTaskSelect(opts.view_mode, isMinimal),
              orderBy: buildOrderBy(opts.sorts),
            });
          }),
        );

        const tasks = statusTasksResults.flat();

        // 4. Handle Subtask Expansion
        if (opts.includeSubTasks && tasks.length > 0) {
          const parentIds = tasks.filter((t) => t.isParent).map((t) => t.id);
          if (parentIds.length > 0) {
            const subtasks = await prisma.task.findMany({
              where: buildSubtaskExpansionWhere(undefined, {
                parentIds,
                status: toArray(opts.status),
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                userId,
                isAdmin,
              }),
              select: getTaskSelect(opts.view_mode),
              orderBy: buildOrderBy(opts.sorts),
            });
            tasks.forEach((parent: any) => {
              if (parent.isParent) {
                parent.subTasks = subtasks.filter(
                  (st) => st.parentTaskId === parent.id,
                );
              } else {
                parent.subTasks = [];
              }
            });
          }
        }

        if (opts.view_mode === "kanban") {
          const tasksByStatus: Record<
            string,
            { tasks: any[]; nextCursor: any; hasMore: boolean }
          > = {};

          const primarySort = opts.sorts?.[0];

          statusTasksResults.forEach((statusTasks, idx) => {
            const status = allStatuses[idx];
            const hasMore = statusTasks.length > perStatusLimit;
            if (hasMore) statusTasks.pop();

            const lastTask =
              statusTasks.length > 0
                ? (statusTasks[statusTasks.length - 1] as any)
                : null;
            const nextCursor: any =
              hasMore && lastTask
                ? primarySort && SORT_MAP[primarySort.field]
                  ? {
                    id: lastTask.id,
                    [SORT_MAP[primarySort.field].dbField]:
                      lastTask[SORT_MAP[primarySort.field].dbField],
                  }
                  : { id: lastTask.id, createdAt: lastTask.createdAt }
                : null;

            tasksByStatus[status] = {
              tasks: statusTasks,
              nextCursor,
              hasMore,
            };
          });

          return {
            tasks: [], // Added for consistent return shape and to fix type union issues
            tasksByStatus,
            totalCount: Object.values(statusCounts).reduce(
              (acc, c) => acc + c,
              0,
            ),
            hasMore: false,
            nextCursor: null,
            facets: {
              ...emptyFacets,
              status: statusCounts,
            },
          };
        }

        return {
          tasks,
          totalCount: tasks.length,
          hasMore: false, // Initial parallel load doesn't provide a global cursor
          nextCursor: null,
          facets: {
            ...emptyFacets,
            status: statusCounts,
          },
        };
      }

      strategy = "WORKSPACE_FLAT_FILTER";
      const filterResult = await this._fetchWorkspaceFilter(
        workspaceId,
        userId,
        isAdmin,
        fullAccessProjectIds,
        restrictedProjectIds,
        {
          ...opts,
          onlyParents:
            !hasExplicitFilters &&
            (opts.onlyParents || hierarchyMode === "parents"),
          excludeParents: opts.excludeParents,
          onlySubtasks:
            !hasExplicitFilters &&
            (isSorting || opts.onlySubtasks || hierarchyMode === "children"),
        },
      );

      return filterResult;
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 50) {
        logger.serverPerf("LIST_TASKS_SERVICE", duration, {
          strategy,
          workspaceId,
          projectId: opts.projectId,
          groupBy: opts.groupBy,
          search: !!opts.search,
        });
      }
    }
  }

  private static async _fetchProjectRoot(
    projectId: string,
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: any,
  ) {
    const limit = opts.limit ?? 50;

    const where = buildProjectRootWhere(projectId, {
      status: toArray(opts.status),
      assigneeId: toArray(opts.assigneeId),
      cursor: opts.cursor,
      sorts: opts.sorts,
      userId,
      isAdmin,
      fullAccessProjectIds,
      ids: opts.ids,
    });

    const primarySortField = opts.sorts?.[0]?.field || "createdAt";
    const dbField = SORT_MAP[primarySortField]?.dbField || "createdAt";

    const [rawTasks] = await Promise.all([
      prisma.task.findMany({
        where,
        select: getTaskSelect(opts.view_mode, true, [dbField]), // TRUE for minimal parent select, include sort field
        orderBy: buildOrderBy(opts.sorts),
      }),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const lastTask = rawTasks[rawTasks.length - 1] as any;

    const nextCursor: any = hasMore
      ? {
        id: lastTask.id,
        [dbField]: lastTask[dbField],
      }
      : null;

    return {
      tasks: rawTasks,
      totalCount: null,
      hasMore,
      nextCursor,
      facets: { status: {}, assignee: {}, tags: {}, projects: {} },
    };
  }

  private static async _fetchSubtasks(
    parentTaskId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: any,
  ) {
    const limit = opts.limit ?? 30;

    let isRestrictedMember = false;
    if (!isAdmin) {
      const parent = await prisma.task.findUnique({
        where: { id: parentTaskId },
        select: { projectId: true },
      });
      const parentProjectId = parent?.projectId;
      if (parentProjectId && restrictedProjectIds.includes(parentProjectId)) {
        isRestrictedMember = true;
      }
    }

    const where = buildSubtaskExpansionWhere(parentTaskId, {
      status: toArray(opts.status),
      assigneeId: toArray(opts.assigneeId),
      tagId: toArray(opts.tagId),
      search: opts.search,
      dueAfter: toUTCDateOnly(opts.dueAfter),
      dueBefore: opts.dueBefore
        ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
        : undefined,
      cursor: opts.cursor,
      userId,
      isAdmin,
      isRestrictedMember,
    });

    const rawSubtasks = await prisma.task.findMany({
      where: {
        OR: [{ id: parentTaskId }, where],
      },
      select: getTaskSelect(
        opts.view_mode,
        opts.view_mode === "gantt" || opts.isMinimal,
      ),
      orderBy: buildOrderBy(opts.sorts),
      take: limit + 5, // Extra buffer for the parent and potential overlap
    });

    const hasMore = rawSubtasks.length > limit;
    if (hasMore) rawSubtasks.pop();

    const nextCursor: TaskCursor | null = hasMore
      ? {
        id: rawSubtasks[rawSubtasks.length - 1].id,
        createdAt: rawSubtasks[rawSubtasks.length - 1].createdAt,
      }
      : null;

    return {
      tasks: rawSubtasks,
      totalCount: null,
      hasMore,
      nextCursor,
      facets: { status: {}, assignee: {}, tags: {}, projects: {} },
    };
  }

  private static async _fetchFilteredHierarchy(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: any,
  ) {
    const limit = opts.limit ?? 50;

    const hasExplicitFilters = !!(
      (opts.status && toArray(opts.status)?.length) ||
      (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
      (opts.tagId && toArray(opts.tagId)?.length) ||
      (opts.search && opts.search.trim().length > 0) ||
      opts.dueAfter ||
      opts.dueBefore
    );

    const matchWhere = buildWorkspaceFilterWhere(
      {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: toUTCDateOnly(opts.dueAfter),
        dueBefore: opts.dueBefore
          ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
          : undefined,
        search: opts.search,
        isAdmin,
        fullAccessProjectIds,
        restrictedProjectIds,
        projectIds:
          !opts.projectId && opts.expandedProjectIds?.length
            ? opts.expandedProjectIds
            : undefined,
        includeSubTasks: opts.includeSubTasks,
        onlyParents: !hasExplicitFilters && opts.hierarchyMode === "parents",
        onlySubtasks: !hasExplicitFilters && opts.hierarchyMode === "children",
        view_mode: opts.view_mode,
        ids: opts.ids,
      },
      userId,
    );

    const expansionMatchWhere = { ...matchWhere };
    delete (expansionMatchWhere as any).isParent;
    delete (expansionMatchWhere as any).parentTaskId;

    const primarySortFieldForSelect = opts.sorts?.[0]?.field || "createdAt";
    const dbFieldForSelect = SORT_MAP[primarySortFieldForSelect]?.dbField || "createdAt";

    const rawMatches = await prisma.task.findMany({
      where: buildWorkspaceFilterWhere(
        {
          ...opts,
          workspaceId,
          projectId: opts.projectId,
          assigneeId: toArray(opts.assigneeId),
          status: toArray(opts.status),
          tagId: toArray(opts.tagId),
          dueAfter: toUTCDateOnly(opts.dueAfter),
          dueBefore: opts.dueBefore
            ? addOneDayUTC(toUTCDateOnly(opts.dueBefore)!)
            : undefined,
          isAdmin,
          fullAccessProjectIds,
          restrictedProjectIds,
          projectIds:
            !opts.projectId && opts.expandedProjectIds?.length
              ? opts.expandedProjectIds
              : undefined,
          includeSubTasks: opts.includeSubTasks,
          onlyParents: !hasExplicitFilters && opts.hierarchyMode === "parents",
          onlySubtasks:
            !hasExplicitFilters && opts.hierarchyMode === "children",
          cursor: opts.cursor,
        },
        userId,
      ),
      select: getTaskSelect(
        opts.view_mode,
        opts.view_mode === "gantt" || opts.isMinimal,
        dbFieldForSelect ? [dbFieldForSelect] : []
      ),
      take: limit + 1,
      orderBy: buildOrderBy(opts.sorts),
    });

    const hasMore = rawMatches.length > limit;
    const matches = rawMatches.slice(0, limit);

    if (matches.length === 0) {
      return { tasks: [], totalCount: 0, hasMore: false, nextCursor: null };
    }

    const taskMap = new Map<string, any>();
    // For Gantt mode, we strictly honor includeSubTasks even if filters are active to prevent N+1 bloat
    const shouldHaveSubTasks =
      opts.view_mode === "gantt"
        ? opts.includeSubTasks
        : opts.includeSubTasks || hasExplicitFilters;

    matches.forEach((t) =>
      taskMap.set(t.id, {
        ...t,
        subTasks: shouldHaveSubTasks && t.isParent ? [] : undefined,
      }),
    );

    const maxDepth = hasExplicitFilters ? 3 : 1;
    let currentGeneration = [...matches];
    const expandedParentIds = new Set<string>();

    for (let i = 0; i < maxDepth; i++) {
      const missingParentIds = currentGeneration
        .filter((t) => t.parentTaskId && !taskMap.has(t.parentTaskId))
        .map((t) => t.parentTaskId!);

      const parentIdsToExpand = opts.includeSubTasks
        ? currentGeneration
          .filter((t) => (t as any).isParent && !expandedParentIds.has(t.id))
          .map((t) => t.id)
        : [];

      parentIdsToExpand.forEach((id) => expandedParentIds.add(id));

      if (missingParentIds.length === 0 && parentIdsToExpand.length === 0)
        break;

      const orConditions: any[] = [];
      if (missingParentIds.length > 0) {
        orConditions.push({ id: { in: missingParentIds } });
      }
      if (parentIdsToExpand.length > 0) {
        orConditions.push({
          AND: [
            { parentTaskId: { in: parentIdsToExpand } },
            expansionMatchWhere,
          ],
        });
      }
      const extraTasks = await prisma.task.findMany({
        where: { OR: orConditions },
        select: getTaskSelect(opts.view_mode),
        orderBy: buildOrderBy(opts.sorts),
        take: opts.view_mode === "gantt" ? 2000 : 500,
      });

      if (extraTasks.length === 0) break;

      const newEntries: any[] = [];
      extraTasks.forEach((t) => {
        if (!taskMap.has(t.id)) {
          const entry = { ...t, subTasks: shouldHaveSubTasks ? [] : undefined };
          taskMap.set(t.id, entry);
          newEntries.push(entry);
        }
      });
      currentGeneration = newEntries;
      if (taskMap.size > (opts.view_mode === "gantt" ? 5000 : 1000)) break;
    }

    const rootTasks: any[] = [];
    const nestedIds = new Set<string>();
    const allTasks = Array.from(taskMap.values());

    // 🌳 Building Tree: ONLY if subtasks are explicitly requested or filters are forcing expansion
    if (shouldHaveSubTasks) {
      allTasks.forEach((task) => {
        if (task.parentTaskId && taskMap.has(task.parentTaskId)) {
          const parent = taskMap.get(task.parentTaskId);
          if (!parent.subTasks) parent.subTasks = [];
          if (!parent.subTasks.some((st: any) => st.id === task.id)) {
            parent.subTasks.push(task);
            nestedIds.add(task.id);
          }
        }
      });
    }

    allTasks.forEach((task) => {
      if (!nestedIds.has(task.id)) {
        rootTasks.push(task);
      }
    });

    const sortedRoots = rootTasks.sort((a, b) => {
      const aIdx = matches.findIndex((m) => m.id === a.id);
      const bIdx = matches.findIndex((m) => m.id === b.id);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;

      const timeDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
    });

    const primarySortField = opts.sorts?.[0]?.field || "createdAt";
    const dbField = SORT_MAP[primarySortField]?.dbField || "createdAt";
    const lastMatch = matches[matches.length - 1] as any;

    const nextCursor: any =
      hasMore && matches.length > 0
        ? {
          id: lastMatch.id,
          [dbField]: lastMatch[dbField],
        }
        : null;

    const projectFacets: Record<string, number> = {};
    if (opts.includeFacets) {
      const facetWhere = JSON.parse(JSON.stringify(matchWhere));
      const counts = await prisma.task.groupBy({
        by: ["projectId"],
        where: facetWhere,
        _count: { id: true },
      });
      counts.forEach((c) => {
        if (c.projectId)
          projectFacets[c.projectId] =
            (projectFacets[c.projectId] || 0) + (c._count as any).id;
      });
    }

    return {
      tasks: sortedRoots,
      totalCount: matches.length,
      hasMore,
      nextCursor,
      facets: { status: {}, assignee: {}, tags: {}, projects: projectFacets },
    };
  }

  private static async _fetchWorkspaceFilter(
    workspaceId: string,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    opts: any,
  ) {
    const limit = opts.limit ?? 50;

    const start = toUTCDateOnly(opts.dueAfter);
    const end = toUTCDateOnly(opts.dueBefore);
    const isSorting = opts.sorts && opts.sorts.length > 0;

    const filterOpts: WorkspaceFilterOpts = {
      workspaceId,
      projectId: opts.projectId,
      assigneeId: toArray(opts.assigneeId),
      status: toArray(opts.status),
      tagId: toArray(opts.tagId),
      dueAfter: start,
      dueBefore: end ? addOneDayUTC(end) : undefined,
      search: opts.search,
      cursor: isSorting ? undefined : opts.cursor,
      isAdmin,
      fullAccessProjectIds,
      restrictedProjectIds,
      projectIds:
        !opts.projectId && opts.expandedProjectIds?.length
          ? opts.expandedProjectIds
          : undefined,
      onlyParents: isSorting ? false : opts.onlyParents,
      excludeParents: opts.excludeParents,
      onlySubtasks: isSorting ? true : opts.onlySubtasks,
      view_mode: opts.view_mode,
      ids: opts.ids,
    };

    let where = buildWorkspaceFilterWhere(filterOpts, userId);

    if (isSorting && opts.cursor) {
      const seek = buildSeekCondition(opts.sorts!, opts.cursor);
      if (seek) {
        if (where.OR) {
          const existingOR = where.OR;
          delete where.OR;
          where.AND = [
            ...(Array.isArray(where.AND)
              ? where.AND
              : where.AND
                ? [where.AND]
                : []),
            { OR: existingOR },
            seek,
          ];
        } else {
          where.AND = [
            ...(Array.isArray(where.AND)
              ? where.AND
              : where.AND
                ? [where.AND]
                : []),
            seek,
          ];
        }
      }
    }

    const primarySort = opts.sorts?.[0];
    const dbField = primarySort ? SORT_MAP[primarySort.field]?.dbField : "createdAt";

    const queryStartTime = performance.now();
    const [rawTasks] = await Promise.all([
      prisma.task.findMany({
        where,
        select: getTaskSelect(opts.view_mode, true, dbField ? [dbField] : []), // Use minimal select for filter queries
        orderBy: buildOrderBy(opts.sorts),
        take: limit + 1,
        skip: opts.skip || 0,
      }),
    ]);
    const queryDuration = performance.now() - queryStartTime;

    if (queryDuration > 100) {
      console.log(
        `[SLOW_QUERY] TasksService._fetchWorkspaceFilter took ${queryDuration.toFixed(2)}ms for workspace: ${workspaceId}`,
      );
    }

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    const lastTask = rawTasks[rawTasks.length - 1] as any;
    const nextCursor: any =
      hasMore && lastTask
        ? primarySort && SORT_MAP[primarySort.field]
          ? {
            id: lastTask.id,
            [SORT_MAP[primarySort.field].dbField]:
              lastTask[SORT_MAP[primarySort.field].dbField],
          }
          : { id: lastTask.id, createdAt: lastTask.createdAt }
        : null;

    const projectFacets: Record<string, number> = {};
    if (opts.includeFacets) {
      const facetWhere = JSON.parse(JSON.stringify(where));
      const counts = await prisma.task.groupBy({
        by: ["projectId"],
        where: facetWhere,
        _count: { id: true },
      });
      counts.forEach((c) => {
        if (c.projectId)
          projectFacets[c.projectId] =
            (projectFacets[c.projectId] || 0) + (c._count as any).id;
      });
    }

    return {
      tasks: rawTasks,
      totalCount: null,
      hasMore,
      nextCursor,
      facets: { status: {}, assignee: {}, tags: {}, projects: projectFacets },
    };
  }

  /**
   * Create a subtask
   */
  static async createSubTask({
    name,
    description,
    projectId,
    workspaceId,
    parentTaskId,
    userId,
    permissions,
    assigneeUserId,
    reviewerUserId,
    tagIds,
    startDate,
    dueDate,
    days,
    status = "TO_DO",
  }: CreateSubTaskParams) {
    const canSucceed =
      permissions.isWorkspaceAdmin || permissions.canCreateSubTask;
    if (!canSucceed) {
      throw AppError.Forbidden("You don't have permission to create subtasks.");
    }

    let projectMember = permissions.projectMember;
    if (!projectMember && permissions.isWorkspaceAdmin) {
      projectMember = await prisma.projectMember.create({
        data: {
          projectId,
          workspaceMemberId: permissions.workspaceMemberId!,
          projectRole: "PROJECT_MANAGER",
          hasAccess: true,
        },
      });
    }

    if (!projectMember) {
      throw AppError.Forbidden(
        "You must be a project member to create subtasks.",
      );
    }

    // Resolve IDs
    let assigneeId: string | null = null;
    if (assigneeUserId) {
      assigneeId = await this.resolveOrJoinProjectMember(
        assigneeUserId,
        projectId,
        workspaceId,
      );
    }

    let reviewerId: string | null = null;
    if (reviewerUserId) {
      reviewerId = await this.resolveOrJoinProjectMember(
        reviewerUserId,
        projectId,
        workspaceId,
      );
    }
    if (!reviewerId) {
      reviewerId = projectMember.id;
    }

    const parentTask = await prisma.task.findUnique({
      where: { id: parentTaskId },
      select: { taskSlug: true },
    });

    if (!parentTask) {
      throw AppError.NotFound("Parent task not found.");
    }

    const { generateUniqueSlug } = await import("@/lib/slug-generator");
    const slug = await generateUniqueSlug(name, "task", parentTask.taskSlug);

    const newSubTask = await prisma.$transaction(async (tx) => {
      const parent = await tx.task.findUnique({
        where: { id: parentTaskId },
        select: { subtaskCount: true },
      });

      const task = await tx.task.create({
        data: {
          name,
          taskSlug: slug,
          description,
          status,
          projectId,
          workspaceId,
          parentTaskId,
          createdById: projectMember.id,
          assigneeId,
          reviewerId: reviewerId!,
          tags: tagIds && tagIds.length > 0 ? { connect: tagIds.map(id => ({ id })) } : undefined,
          startDate: parseIST(startDate),
          dueDate: parseIST(dueDate),
          days,
          isParent: false,
          position: parent?.subtaskCount || 0,
        },
        include: {
          assignee: {
            include: {
              workspaceMember: {
                include: { user: { select: { id: true, surname: true } } },
              },
            },
          },
          tags: { select: { id: true, name: true } },
          reviewer: {
            include: {
              workspaceMember: {
                include: { user: { select: { id: true, surname: true } } },
              },
            },
          },
        },
      });

      await tx.task.update({
        where: { id: parentTaskId },
        data: {
          subtaskCount: { increment: 1 },
          completedSubtaskCount:
            status === "COMPLETED" ? { increment: 1 } : undefined,
        },
      });

      return task;
    });

    // Record Activity
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { slug: true },
      });
      await recordActivity({
        userId,
        userName: permissions.userSurname,
        workspaceId,
        action: "SUBTASK_CREATED",
        entityType: "SUBTASK",
        entityId: newSubTask.id,
        newData: { ...newSubTask, projectSlug: project?.slug },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(newSubTask.id),
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Subtask activity failed:", e);
    }

    return newSubTask;
  }

  /**
   * Update a subtask status with permission validation and audit logging.
   * Centralized in the service layer for consistency between Hono and Server Actions.
   */
  static async updateSubTaskStatus({
    subTaskId,
    newStatus,
    workspaceId,
    projectId,
    userId,
    permissions,
    comment,
    attachmentData,
  }: {
    subTaskId: string;
    newStatus: TaskStatus;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
    comment?: string;
    attachmentData?: any;
  }) {
    // 1. Fetch Task Data (Include updatedAt to ensure consistent return types)
    const subTask = await prisma.task.findUnique({
      where: { id: subTaskId },
      select: {
        id: true,
        status: true,
        name: true,
        createdById: true,
        assigneeId: true,
        reviewerId: true,
        parentTaskId: true,
        updatedAt: true,
      },
    });

    if (!subTask) {
      throw AppError.NotFound("Subtask not found");
    }

    // 2. Authorization Checks
    const currentProjectMemberId = permissions.projectMember?.id;
    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectLead = permissions.isProjectLead;

    const isCreator = currentProjectMemberId
      ? subTask.createdById === currentProjectMemberId
      : false;
    const isAssignee = currentProjectMemberId
      ? subTask.assigneeId === currentProjectMemberId
      : false;

    if (!isWorkspaceAdmin && !isProjectManager) {
      if (isProjectLead) {
        if (!isCreator && !isAssignee) {
          throw AppError.Forbidden(
            "As a Project Lead, you can only update tasks you created or are assigned to.",
          );
        }
      } else {
        if (!isCreator && !isAssignee) {
          throw AppError.Forbidden(
            "You can only update tasks that you created or are assigned to.",
          );
        }
      }
    }

    // Specific Restriction: Tasks in REVIEW status
    if (subTask.status === "REVIEW") {
      if (isAssignee && !isWorkspaceAdmin && !isProjectManager) {
        throw AppError.Forbidden(
          "As the assignee, you cannot move this task out of Review status.",
        );
      }
    }

    // 3. Status Transition Validation
    if (subTask.status === newStatus && newStatus !== "REVIEW") {
      return subTask; // No change needed
    }

    // Constraint: IN_PROGRESS -> COMPLETED is forbidden (must go to REVIEW)
    if (subTask.status === "IN_PROGRESS" && newStatus === "COMPLETED") {
      throw AppError.ValidationError(
        "Tasks in In-Progress must be moved to Review before marking as Completed.",
      );
    }

    const isMandatoryTransition =
      ["HOLD", "CANCELLED", "REVIEW"].includes(newStatus) ||
      (subTask.status && ["HOLD", "CANCELLED"].includes(subTask.status)) ||
      (subTask.status === "REVIEW" &&
        (newStatus === "TO_DO" || newStatus === "IN_PROGRESS")) ||
      (subTask.status === "IN_PROGRESS" && newStatus === "TO_DO");
    if (isMandatoryTransition && !comment && !attachmentData) {
      throw AppError.ValidationError(
        "A comment or attachment link is required for this status transition.",
      );
    }

    // 4. Atomic Database Update
    const updated = await prisma.$transaction(async (tx) => {
      // Create activity if any content is provided
      if (comment || attachmentData) {
        await tx.activity.create({
          data: {
            subTaskId: subTaskId,
            authorId: userId,
            workspaceId: workspaceId,
            text: (comment || "").trim(),
            attachment: attachmentData,
          },
        });
      }

      // Update parent task completed count if needed
      if (subTask.parentTaskId) {
        const wasCompleted = subTask.status === "COMPLETED";
        const isNowCompleted = newStatus === "COMPLETED";

        if (wasCompleted !== isNowCompleted) {
          await tx.task.update({
            where: { id: subTask.parentTaskId },
            data: {
              completedSubtaskCount: {
                [isNowCompleted ? "increment" : "decrement"]: 1,
              },
            },
          });
        }
      }

      return await tx.task.update({
        where: { id: subTaskId },
        data: { status: newStatus },
        select: { id: true, status: true, updatedAt: true },
      });
    });

    // 5. Record Activity & Broadcast (Asynchronous)
    try {
      const targetUserIds = await getTaskInvolvedUserIds(subTaskId);
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, surname: true },
      });

      await recordActivity({
        userId,
        userName: user?.surname || user?.name || "Someone",
        workspaceId,
        action: "SUBTASK_UPDATED",
        entityType: "SUBTASK",
        entityId: subTaskId,
        oldData: { status: subTask.status, name: subTask.name },
        newData: { status: newStatus },
        broadcastEvent: "team_update",
        targetUserIds,
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Failed to record activity:", e);
    }

    return updated;
  }

  /**
   * Get a task by ID with full relations
   */
  static async getTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          include: {
            workspaceMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    surname: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        reviewer: {
          include: {
            workspaceMember: {
              include: {
                user: {
                  select: { id: true, surname: true, email: true },
                },
              },
            },
          },
        },
        tags: true,
        project: {
          select: { id: true, name: true, slug: true, workspaceId: true },
        },
        _count: { select: { subTasks: true } },
        Task_TaskDependency_A: { select: { id: true } },
      },
    });

    if (!task) throw AppError.NotFound("Task not found");
    return task;
  }

  /**
   * Update a task (Parent or Subtask)
   */
  static async updateTask({
    taskId,
    workspaceId,
    projectId,
    userId,
    permissions,
    data,
  }: {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
    data: Partial<CreateSubTaskParams>;
  }) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        createdById: true,
        assigneeId: true,
        parentTaskId: true,
        name: true,
        status: true,
      },
    });

    if (!task) throw AppError.NotFound("Task not found");

    const currentProjectMemberId = permissions.projectMember?.id;
    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;

    // 1. Base Authorization
    const isAuthorized =
      isWorkspaceAdmin ||
      isProjectManager ||
      (currentProjectMemberId &&
        (task.createdById === currentProjectMemberId ||
          task.assigneeId === currentProjectMemberId));

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "You don't have permission to update this task.",
      );
    }

    // 2. Hierarchy Rules
    if (task.assigneeId) {
      const assignee = await prisma.projectMember.findUnique({
        where: { id: task.assigneeId },
        select: { projectRole: true },
      });

      if (assignee?.projectRole === "PROJECT_MANAGER" && !isWorkspaceAdmin) {
        throw AppError.Forbidden(
          "Only a Workspace Admin can edit tasks assigned to a Project Manager.",
        );
      }
      if (
        assignee?.projectRole === "LEAD" &&
        !isWorkspaceAdmin &&
        !isProjectManager
      ) {
        throw AppError.Forbidden(
          "Only a Workspace Admin or Project Manager can edit tasks assigned to a Project Lead.",
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.status) updateData.status = data.status;
    if (data.tagIds !== undefined) {
      updateData.tags = {
        set: data.tagIds.map(id => ({ id }))
      };
    }
    if (data.days !== undefined) updateData.days = data.days;
    if (data.startDate !== undefined)
      updateData.startDate = parseIST(data.startDate as any);
    if (data.dueDate !== undefined)
      updateData.dueDate = parseIST(data.dueDate as any);

    if (data.assigneeUserId !== undefined) {
      updateData.assigneeId = data.assigneeUserId
        ? await this.resolveOrJoinProjectMember(
          data.assigneeUserId,
          projectId,
          workspaceId,
        )
        : null;
    }
    if (data.reviewerUserId !== undefined) {
      updateData.reviewerId = data.reviewerUserId
        ? await this.resolveOrJoinProjectMember(
          data.reviewerUserId,
          projectId,
          workspaceId,
        )
        : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: taskId },
        data: updateData,
      });

      // If status changed and it's a subtask, update parent completed count
      if (data.status && data.status !== task.status && task.parentTaskId) {
        const wasCompleted = task.status === "COMPLETED";
        const isNowCompleted = data.status === "COMPLETED";
        if (wasCompleted !== isNowCompleted) {
          await tx.task.update({
            where: { id: task.parentTaskId },
            data: {
              completedSubtaskCount: {
                [isNowCompleted ? "increment" : "decrement"]: 1,
              },
            },
          });
        }
      }

      return result;
    });

    // Record activity with surgical delta
    try {
      // Prepare minimal oldData based on updated fields to ensure clean audit logs
      const oldData: any = {};
      if (data.name) oldData.name = task.name;
      if (data.status) oldData.status = task.status;
      if (data.assigneeUserId) oldData.assigneeId = task.assigneeId;

      await recordActivity({
        userId,
        userName: permissions.userSurname || permissions.userName || "Someone",
        workspaceId,
        action: task.parentTaskId ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: task.parentTaskId ? "SUBTASK" : "TASK",
        entityId: taskId,
        oldData,
        newData: updateData,
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(taskId),
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Update activity failed:", e);
    }

    return updated;
  }

  /**
   * Delete a task (Parent or Subtask)
   */
  static async deleteTask({
    taskId,
    workspaceId,
    projectId,
    userId,
    permissions,
  }: {
    taskId: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
  }) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        name: true,
        status: true,
        createdById: true,
        parentTaskId: true,
      },
    });

    if (!task) throw AppError.NotFound("Task not found");

    const currentProjectMemberId = permissions.projectMember?.id;
    const isAuthorized =
      permissions.isWorkspaceAdmin ||
      permissions.isProjectManager ||
      (currentProjectMemberId && task.createdById === currentProjectMemberId);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "You don't have permission to delete this task.",
      );
    }

    const targetUserIds = await getTaskInvolvedUserIds(taskId);

    await prisma.$transaction(async (tx) => {
      // Delete the task
      await tx.task.delete({ where: { id: taskId } });

      // If it was a subtask, decrement parent counters
      if (task.parentTaskId) {
        await tx.task.update({
          where: { id: task.parentTaskId },
          data: {
            subtaskCount: { decrement: 1 },
            completedSubtaskCount:
              task.status === "COMPLETED" ? { decrement: 1 } : undefined,
          },
        });
      }
    });

    // Record activity
    try {
      await recordActivity({
        userId,
        userName: permissions.userSurname || permissions.userName || "Someone",
        workspaceId,
        action: task.parentTaskId ? "SUBTASK_DELETED" : "TASK_DELETED",
        entityType: task.parentTaskId ? "SUBTASK" : "TASK",
        entityId: taskId,
        oldData: { name: task.name, status: task.status, projectId },
        broadcastEvent: "team_update",
        targetUserIds,
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Delete activity failed:", e);
    }

    return { id: taskId };
  }

  /**
   * Update task dates (Gantt style)
   */
  static async updateTaskDates({
    taskId,
    startDate,
    dueDate,
    workspaceId,
    userId,
    permissions,
  }: {
    taskId: string;
    startDate: string | Date;
    dueDate: string | Date;
    workspaceId: string;
    projectId: string;
    userId: string;
    permissions: any;
  }) {
    const start = parseIST(startDate as any);
    const end = parseIST(dueDate as any);

    if (!start || !end) throw AppError.ValidationError("Invalid dates");
    if (start > end)
      throw AppError.ValidationError("Start date must be before end date");

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        createdById: true,
        assigneeId: true,
        parentTaskId: true,
        name: true,
      },
    });

    if (!task) throw AppError.NotFound("Task not found");

    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const currentProjectMemberId = permissions.projectMember?.id;

    // 1. Permission Check
    const isAuthorized =
      isWorkspaceAdmin ||
      isProjectManager ||
      (permissions.isProjectLead &&
        currentProjectMemberId &&
        task.createdById === currentProjectMemberId);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "Only Project Managers or the Task Creator can manage the timeline.",
      );
    }

    // 2. Hierarchy Check
    if (task.assigneeId) {
      const assignee = await prisma.projectMember.findUnique({
        where: { id: task.assigneeId },
        select: { projectRole: true },
      });

      if (assignee?.projectRole === "PROJECT_MANAGER" && !isWorkspaceAdmin) {
        throw AppError.Forbidden(
          "Only a Workspace Admin can update tasks assigned to a Project Manager.",
        );
      }
      if (
        assignee?.projectRole === "LEAD" &&
        !isWorkspaceAdmin &&
        !isProjectManager
      ) {
        throw AppError.Forbidden(
          "Only a Workspace Admin or Project Manager can update tasks assigned to a Project Lead.",
        );
      }
    }

    const days =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { startDate: start, dueDate: end, days },
    });

    // Record activity
    try {
      await recordActivity({
        userId,
        userName: permissions.userSurname || permissions.userName || "Someone",
        workspaceId,
        action: "TASK_UPDATED",
        entityType: "TASK",
        entityId: taskId,
        newData: { startDate: start, dueDate: end, days },
        broadcastEvent: "team_update",
        targetUserIds: await getTaskInvolvedUserIds(taskId),
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Date update activity failed:", e);
    }

    return updated;
  }

  /**
   * Add dependencies between tasks (supports multiple)
   */
  static async addDependency({
    subtaskId,
    dependsOnIds,
    projectId,
    workspaceId,
    permissions,
  }: {
    subtaskId: string;
    dependsOnIds: string[];
    projectId: string;
    workspaceId: string;
    permissions: any;
  }) {
    if (!dependsOnIds || dependsOnIds.length === 0) {
      throw AppError.ValidationError("At least one dependency is required");
    }

    const subtask = await prisma.task.findUnique({
      where: { id: subtaskId },
      select: {
        id: true,
        createdById: true,
        startDate: true,
        days: true,
        projectId: true,
      },
    });

    if (!subtask) throw AppError.NotFound("Subtask not found");

    const isAuthorized =
      permissions.isWorkspaceAdmin ||
      permissions.isProjectLead ||
      (permissions.projectMember &&
        subtask.createdById === permissions.projectMember.id);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "Only project admin, lead, or task creator can add dependencies.",
      );
    }

    const existingDeps = await prisma.task.findUnique({
      where: { id: subtaskId },
      select: { Task_TaskDependency_A: { select: { id: true } } },
    });
    const existingDepIds = new Set(
      existingDeps?.Task_TaskDependency_A.map((d) => d.id) || [],
    );

    const newDependsOnIds = dependsOnIds.filter(
      (id) => !existingDepIds.has(id),
    );

    if (newDependsOnIds.length === 0) {
      return { success: true, message: "All dependencies already exist" };
    }

    const tasksToCheck = await prisma.task.findMany({
      where: { id: { in: newDependsOnIds } },
      select: { id: true, startDate: true, days: true, projectId: true },
    });

    if (tasksToCheck.length !== newDependsOnIds.length) {
      throw AppError.NotFound("One or more dependency tasks not found");
    }

    const otherProjectTasks = tasksToCheck.filter(
      (t) => t.projectId !== subtask.projectId,
    );
    if (otherProjectTasks.length > 0) {
      throw AppError.ValidationError(
        "Dependencies must be from the same project",
      );
    }

    for (const depId of newDependsOnIds) {
      if (subtaskId === depId)
        throw AppError.ValidationError("A task cannot depend on itself");
      const isCircular = await this.checkCircularDependency(subtaskId, depId);
      if (isCircular)
        throw AppError.ValidationError(
          "This would create a circular dependency",
        );
    }

    await prisma.task.update({
      where: { id: subtaskId },
      data: {
        Task_TaskDependency_A: {
          connect: newDependsOnIds.map((id) => ({ id })),
        },
      },
    });

    // Auto-scheduling logic removed as per user request to not change any task dates.

    return { success: true };
  }

  /**
   * Remove a dependency
   */
  static async removeDependency({
    subtaskId,
    dependsOnId,
    permissions,
  }: {
    subtaskId: string;
    dependsOnId: string;
    permissions: any;
  }) {
    const subtask = await prisma.task.findUnique({
      where: { id: subtaskId },
      select: { createdById: true },
    });
    if (!subtask) throw AppError.NotFound("Subtask not found");

    const isAuthorized =
      permissions.isWorkspaceAdmin ||
      permissions.isProjectLead ||
      (permissions.projectMember &&
        subtask.createdById === permissions.projectMember.id);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "Only project admin, lead, or task creator can remove dependencies.",
      );
    }

    await prisma.task.update({
      where: { id: subtaskId },
      data: { Task_TaskDependency_A: { disconnect: { id: dependsOnId } } },
    });

    return { success: true };
  }

  /**
   * Helper to check circular dependencies
   */
  private static async checkCircularDependency(
    subtaskId: string,
    dependsOnId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    let currentLevel = [dependsOnId];

    while (currentLevel.length > 0) {
      if (currentLevel.includes(subtaskId)) return true;
      currentLevel.forEach((id) => visited.add(id));

      const tasks = await prisma.task.findMany({
        where: { id: { in: currentLevel } },
        select: { Task_TaskDependency_A: { select: { id: true } } },
      });

      const nextLevel: string[] = [];
      tasks.forEach((task) => {
        task.Task_TaskDependency_A.forEach((dep) => {
          if (!visited.has(dep.id)) nextLevel.push(dep.id);
        });
      });

      currentLevel = Array.from(new Set(nextLevel));
      if (visited.size > 1000) break;
    }
    return false;
  }

  /**
   * Update the order of subtasks
   */
  static async updateSubtasksOrder(subtaskIds: string[]) {
    if (!subtaskIds.length) return;

    await prisma.$transaction(
      subtaskIds.map((id, index) =>
        prisma.task.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
  }

  /**
   * Expand subtasks for a parent task with full filtering and pagination support.
   * Migrated from legacy /api/expand endpoint for unified Hono service access.
   */
  static async expandSubtasks({
    parentId,
    workspaceId,
    projectId,
    filters,
    pageSize,
    viewMode,
    cursor,
    userId,
  }: {
    parentId: string;
    workspaceId: string;
    projectId?: string;
    filters: any;
    pageSize: number;
    viewMode: string;
    cursor?: any;
    userId: string;
  }) {
    const results = await getSubTasksByParentIds(
      [parentId],
      workspaceId,
      projectId,
      filters,
      pageSize,
      viewMode,
      userId,
      true, // skipPermissionsCheck for service-level access
      cursor,
    );

    if (!results || results.length === 0) {
      return {
        subTasks: [],
        totalCount: 0,
        hasMore: false,
        nextCursor: null,
      };
    }
    return {
      subTasks: results[0].subTasks,
      totalCount: results[0].totalCount,
      hasMore: results[0].hasMore,
      nextCursor: results[0].nextCursor,
    };
  }

  /**
   * Expand multiple parent tasks in a single batch operation.
   * Optimized for frontend dashboard initial expansion and 'Expand All' actions.
   */
  static async expandSubtasksBatch({
    parentIds,
    workspaceId,
    projectId,
    filters,
    pageSize,
    viewMode,
    userId,
  }: {
    parentIds: string[];
    workspaceId: string;
    projectId?: string;
    filters: any;
    pageSize: number;
    viewMode: string;
    userId: string;
  }) {
    const results = await getSubTasksByParentIds(
      parentIds,
      workspaceId,
      projectId,
      filters,
      pageSize,
      viewMode,
      userId,
      true, // Skip redundant permission checks as we can trust the service context here
    );

    return results;
  }

  /**
   * Surgically update a task's assignee with optional explanation comment.
   * Optimized for high-performance Hono API routes.
   */
  static async updateTaskAssignee({
    taskId,
    assigneeUserId,
    explanation,
    workspaceId,
    projectId,
    userId,
    userName,
  }: {
    taskId: string;
    assigneeUserId: string | null;
    explanation?: string;
    workspaceId: string;
    projectId: string;
    userId: string;
    userName: string;
  }) {
    const { getUserPermissions } =
      await import("@/data/user/get-user-permissions");

    // 1. Parallel fetch context
    const [task, permissions] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          id: true,
          createdById: true,
          assigneeId: true,
          parentTaskId: true,
          name: true,
          status: true,
        },
      }),
      getUserPermissions(workspaceId, projectId, userId),
    ]);

    if (!task) throw AppError.NotFound("Task not found");

    // 2. Permission Check
    const currentProjectMemberId = permissions.projectMember?.id;
    const isAuthorized =
      permissions.isWorkspaceAdmin ||
      permissions.isProjectManager ||
      (currentProjectMemberId &&
        (task.createdById === currentProjectMemberId ||
          task.assigneeId === currentProjectMemberId));

    if (!isAuthorized)
      throw AppError.Forbidden(
        "You don't have permission to update this task.",
      );

    // 3. Resolve New Assignee
    let newAssigneeId: string | null = null;
    if (assigneeUserId) {
      newAssigneeId = await resolveProjectMemberId(
        assigneeUserId,
        projectId,
        workspaceId,
      );
    }

    if (
      task.assigneeId === newAssigneeId &&
      (!explanation || !explanation.trim())
    ) {
      return { success: true };
    }

    // 4. Atomic Update + Activity (Comment)
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { assigneeId: newAssigneeId },
        select: { id: true, name: true },
      });

      let commentActivity = null;
      if (explanation && explanation.trim()) {
        commentActivity = await tx.activity.create({
          data: {
            subTaskId: taskId,
            authorId: userId,
            workspaceId,
            text: explanation.trim(),
          },
          select: { id: true, createdAt: true },
        });
      }

      return { updated, commentActivity };
    });

    // 5. Broadcast (Minimize await if possible, but keep consistent)
    const targetUserIds = await getTaskInvolvedUserIds(taskId);

    const broadcastPromise = Promise.all([
      recordActivity({
        userId,
        userName,
        workspaceId,
        action: task.parentTaskId ? "SUBTASK_UPDATED" : "TASK_UPDATED",
        entityType: task.parentTaskId ? "SUBTASK" : "TASK",
        entityId: taskId,
        oldData: { assigneeId: task.assigneeId },
        newData: { assigneeId: newAssigneeId },
        broadcastEvent: "team_update",
        targetUserIds,
      }),
      result.commentActivity
        ? recordActivity({
          userId,
          userName,
          workspaceId,
          action: "COMMENT_CREATED",
          entityType: "SUBTASK",
          entityId: taskId,
          newData: {
            id: result.commentActivity.id,
            text: explanation?.trim(),
            createdAt: result.commentActivity.createdAt.toISOString(),
          },
          broadcastEvent: "team_update",
          targetUserIds,
        })
        : Promise.resolve(),
    ]);

    // We await the broadcasts to ensure data consistency in audits,
    // but the core DB work is already committed.
    await broadcastPromise;

    return { success: true };
  }

  /**
   * Resolves a target user's ProjectMember.id, auto-joining them if they are a Workspace Admin/Owner.
   */
  private static async resolveOrJoinProjectMember(
    userId: string,
    projectId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const existing = await prisma.projectMember.findFirst({
      where: {
        projectId,
        workspaceMember: { userId, workspaceId },
      },
      select: { id: true },
    });

    if (existing) return existing.id;

    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true, workspaceRole: true },
    });

    if (
      workspaceMember &&
      (workspaceMember.workspaceRole === "ADMIN" ||
        workspaceMember.workspaceRole === "OWNER")
    ) {
      const pm = await prisma.projectMember.create({
        data: {
          projectId,
          workspaceMemberId: workspaceMember.id,
          projectRole: "PROJECT_MANAGER",
          hasAccess: true,
        },
      });
      return pm.id;
    }

    return null;
  }
}
