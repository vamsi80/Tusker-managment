import "server-only";

import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { getTaskInvolvedUserIds } from "@/lib/involved-users";
import { resolveProjectMemberId } from "@/lib/auth/resolve-member-chain";
import { parseIST } from "@/lib/utils";
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
  buildAssigneeFilter,
} from "@/lib/tasks/query-builder";
import { TaskRepository } from "./task.repository";
import { TaskMapper } from "./task.mapper";
import { TaskEvents } from "./task.events";

import { TaskStatus, CreateTaskParams, CreateSubTaskParams } from "@/types/task";

const toArray = <T>(v: T | T[] | undefined): T[] | undefined => {
  if (v === undefined) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  const cleaned = arr.filter((i) => i !== null && i !== undefined && i !== "");
  return cleaned.length > 0 ? cleaned : undefined;
};

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
    const canSucceed = permissions.isWorkspaceAdmin || permissions.canCreateSubTask;
    if (!canSucceed) throw AppError.Forbidden("You don't have permission to create tasks.");

    let projectMember = permissions.projectMember;
    if (!projectMember && permissions.isWorkspaceAdmin) {
      projectMember = await TaskRepository.autoJoinAdmin(projectId, permissions.workspaceMemberId!);
    }
    if (!projectMember) throw AppError.Forbidden("You must be a project member to create tasks.");

    const finalProjectSlug = await TaskRepository.findProjectSlug(projectId);
    const { generateUniqueSlug } = await import("@/lib/slug-generator");
    const slug = await generateUniqueSlug(name, "task", finalProjectSlug || "");

    // 🚀 Handle Position: Query the last parent task position to append this one
    const lastParent = await TaskRepository.findLastParentPosition(projectId);
    const nextPosition = (lastParent?.position ?? -1) + 1;

    const newTask = await TaskRepository.createTask({
      name,
      taskSlug: slug,
      projectId,
      workspaceId,
      createdById: projectMember.id,
      isParent: true,
      position: nextPosition,
      tags: tagIds?.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
    });

    if (tagIds && tagIds.length > 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          tags: {
            connect: tagIds.map((id) => ({ id })),
          },
        },
      });
    }

    const result = { tasks: [TaskMapper.toFlatMetadata(newTask)] };
    TaskMapper.stripParentMetadata(result);
    const flattenedTask = result.tasks[0];

    await TaskEvents.onTaskCreated({
      taskId: flattenedTask.id,
      projectId,
      workspaceId,
      userId,
      userName: permissions.userSurname,
      taskData: flattenedTask,
      projectSlug: finalProjectSlug,
    });

    return flattenedTask;
  }

  static async bulkUploadTasksAndSubtasks({
    projectId,
    tasks,
    userId,
  }: {
    projectId: string;
    tasks: Array<{
      taskName: string;
      subtaskName?: string;
      description?: string;
      assigneeEmail?: string;
      reviewerEmail?: string;
      startDate?: string;
      days?: number;
      status?: string;
      tags?: string[];
    }>;
    userId: string;
  }) {
    if (!tasks || tasks.length === 0) {
      throw AppError.ValidationError("No tasks provided");
    }

    const project = await TaskRepository.findProjectContext(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    const { getUserPermissions } = await import("@/data/user/get-user-permissions");
    const permissions = await getUserPermissions(project.workspaceId, projectId, userId);

    if (!permissions.workspaceMemberId) {
      throw AppError.Forbidden("You are not a member of this workspace");
    }

    const projectMembers = await TaskRepository.findProjectMembersWithUsers(projectId);

    const emailToProjectMemberId = new Map<string, string>();
    for (const pm of projectMembers) {
      if (pm.workspaceMember?.user?.email) {
        const email = pm.workspaceMember.user.email.toLowerCase();
        emailToProjectMemberId.set(email, pm.id);
      }
    }

    let creatorProjectMemberId = permissions.projectMember?.id;

    if (!creatorProjectMemberId && (permissions.isWorkspaceAdmin || permissions.isProjectManager)) {
      const newMember = await TaskRepository.autoJoinAdmin(projectId, permissions.workspaceMemberId!);
      creatorProjectMemberId = newMember.id;
    }

    if (!creatorProjectMemberId) {
      throw AppError.Forbidden("You are not a member of this project and don't have permission to join automatically.");
    }

    const emailToMemberId = emailToProjectMemberId;
    const invalidAssigneeRows: string[] = [];
    const invalidReviewerRows: string[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const rowNum = i + 2;

      if (task.assigneeEmail && task.assigneeEmail.trim()) {
        const email = task.assigneeEmail.trim().toLowerCase();
        if (!emailToMemberId.has(email)) invalidAssigneeRows.push(`Row ${rowNum}: ${email}`);
      }

      if (task.reviewerEmail && task.reviewerEmail.trim()) {
        const email = task.reviewerEmail.trim().toLowerCase();
        if (!emailToMemberId.has(email)) invalidReviewerRows.push(`Row ${rowNum}: ${email}`);
      }
    }

    if (invalidAssigneeRows.length > 0) {
      throw AppError.ValidationError(`The following assignee email(s) are not members of this project:\n${invalidAssigneeRows.join('\n')}`);
    }
    if (invalidReviewerRows.length > 0) {
      throw AppError.ValidationError(`The following reviewer email(s) are not members of this project:\n${invalidReviewerRows.join('\n')}`);
    }

    const invalidDates: string[] = [];
    const invalidDays: string[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const rowNum = i + 2;

      if (task.startDate && task.startDate.trim()) {
        const date = parseIST(task.startDate);
        if (!date || isNaN(date.getTime())) {
          invalidDates.push(`Row ${rowNum}: "${task.startDate}" (Task: ${task.taskName}${task.subtaskName ? ` - ${task.subtaskName}` : ''})`);
        }
      }

      if (task.days !== undefined && task.days !== null) {
        const daysNum = typeof task.days === 'number' ? task.days : parseInt(String(task.days));
        if (isNaN(daysNum) || daysNum < 0) {
          invalidDays.push(`Row ${rowNum}: "${task.days}" (Task: ${task.taskName}${task.subtaskName ? ` - ${task.subtaskName}` : ''})`);
        }
      }
    }

    if (invalidDates.length > 0) {
      throw AppError.ValidationError(`Invalid date format found in the following rows:\n${invalidDates.join('\n')}`);
    }
    if (invalidDays.length > 0) {
      throw AppError.ValidationError(`Invalid days value found in the following rows:\n${invalidDays.join('\n')}`);
    }

    const taskGroups = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.taskName?.trim()) continue;
      const normalizedTaskName = task.taskName.trim().replace(/\s+/g, ' ');
      const existing = taskGroups.get(normalizedTaskName) || [];
      taskGroups.set(normalizedTaskName, [...existing, task]);
    }

    for (const [taskName, taskGroup] of Array.from(taskGroups.entries())) {
      const hasValidRow = taskGroup.some(row =>
        row.subtaskName?.trim() || row.description?.trim() || row.assigneeEmail?.trim() ||
        row.reviewerEmail?.trim() || row.startDate?.trim() || row.days !== undefined ||
        row.status?.trim() || (row.tags && row.tags.length > 0)
      );
      if (!hasValidRow) taskGroups.delete(taskName);
    }

    const createdItems: any[] = [];
    const { generateUniqueSlugs } = await import("@/lib/slug-generator");
    const taskNames = Array.from(taskGroups.keys());
    const taskSlugs = await generateUniqueSlugs(taskNames, 'task');
    const taskSlugMap = new Map(taskNames.map((name, i) => [name, taskSlugs[i]]));

    const allSubtaskNames: string[] = [];
    for (const [taskName, taskGroup] of Array.from(taskGroups.entries())) {
      const subtaskRows = taskGroup.filter(t => t.subtaskName);
      for (const row of subtaskRows) {
        if (row.subtaskName) {
          allSubtaskNames.push(row.subtaskName);
        }
      }
    }

    const allSubtaskSlugs = allSubtaskNames.length > 0
      ? await generateUniqueSlugs(allSubtaskNames, 'task', undefined, taskSlugs)
      : [];

    const workspaceTags = await TaskRepository.findWorkspaceTags(project.workspaceId);
    const tagMap = new Map<string, (typeof workspaceTags)[number]>(
      workspaceTags.map(t => [t.name.toUpperCase(), t])
    );

    const lastParentTask = await TaskRepository.findLastParentPosition(projectId);

    let parentTaskIndex = lastParentTask?.position ?? -1;
    let globalSubtaskIndex = 0;

    const calculateDueDate = (startDate: Date | undefined, days: number | undefined): Date | undefined => {
      if (!startDate || days === undefined || days === null) return undefined;
      return new Date(startDate.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
    };

    try {
      await prisma.$transaction(async (tx) => {
        for (const [taskName, taskGroup] of Array.from(taskGroups.entries())) {
          const taskSlug = taskSlugMap.get(taskName)!;
          const firstRow = taskGroup[0];
          parentTaskIndex++;

          const parentAssigneeId = firstRow.assigneeEmail
            ? emailToMemberId.get(firstRow.assigneeEmail.trim().toLowerCase())
            : undefined;

          const parentReviewerId = firstRow.reviewerEmail
            ? emailToMemberId.get(firstRow.reviewerEmail.trim().toLowerCase())
            : creatorProjectMemberId;

          const parentStartDate = firstRow.startDate ? parseIST(firstRow.startDate) || undefined : undefined;

          const parentTagIds: string[] = [];
          if (firstRow.tags && firstRow.tags.length > 0) {
            for (const tagName of firstRow.tags) {
              const tagInfo = tagMap.get(tagName.toUpperCase());
              if (tagInfo) parentTagIds.push(tagInfo.id);
            }
          }

          const subtaskRowsForThisParent = taskGroup.filter(t => t.subtaskName);
          const subtaskCountVal = subtaskRowsForThisParent.length;
          const completedSubtaskCountVal = subtaskRowsForThisParent.filter(st => st.status === "COMPLETED").length;

          const parentTask = await tx.task.create({
            data: {
              name: taskName,
              taskSlug,
              description: firstRow.description,
              projectId,
              workspaceId: project.workspaceId,
              createdById: creatorProjectMemberId!,
              isParent: true,
              status: null,
              assigneeId: null,
              reviewerId: null,
              startDate: null,
              days: null,
              tags: { connect: parentTagIds.map(id => ({ id })) },
              subtaskCount: subtaskCountVal,
              completedSubtaskCount: completedSubtaskCountVal,
              position: parentTaskIndex,
            },
          });

          const createdTasks: any[] = [];
          const subtaskRows = taskGroup.filter(t => t.subtaskName);

          if (subtaskRows.length > 0) {
            let subtaskPositionIndex = -1;
            for (const subtaskRow of subtaskRows) {
              subtaskPositionIndex++;
              const subtaskSlug = allSubtaskSlugs[globalSubtaskIndex++];

              const subtaskAssigneeId = subtaskRow.assigneeEmail
                ? emailToMemberId.get(subtaskRow.assigneeEmail.trim().toLowerCase())
                : undefined;

              const subtaskReviewerId = subtaskRow.reviewerEmail
                ? emailToMemberId.get(subtaskRow.reviewerEmail.trim().toLowerCase())
                : creatorProjectMemberId;

              const subtaskStartDate = subtaskRow.startDate ? parseIST(subtaskRow.startDate) || undefined : undefined;

              const resolvedTagIds: string[] = [];
              let shouldAddToProcurement = false;

              if (subtaskRow.tags && subtaskRow.tags.length > 0) {
                for (const tagName of subtaskRow.tags) {
                  const tagInfo = tagMap.get(tagName.toUpperCase());
                  if (tagInfo) {
                    resolvedTagIds.push(tagInfo.id);
                    if (tagInfo.requirePurchase) shouldAddToProcurement = true;
                  }
                }
              }

              const createdSubtask = await tx.task.create({
                data: {
                  name: subtaskRow.subtaskName!,
                  taskSlug: subtaskSlug,
                  description: subtaskRow.description,
                  projectId,
                  workspaceId: project.workspaceId,
                  createdById: creatorProjectMemberId!,
                  parentTaskId: parentTask.id,
                  isParent: false,
                  assigneeId: subtaskAssigneeId,
                  reviewerId: subtaskReviewerId,
                  startDate: subtaskStartDate,
                  days: subtaskRow.days,
                  dueDate: calculateDueDate(subtaskStartDate, subtaskRow.days),
                  status: subtaskRow.status ? (subtaskRow.status as any) : undefined,
                  tags: { connect: resolvedTagIds.map(id => ({ id })) },
                  position: subtaskPositionIndex,
                },
              });

              if (shouldAddToProcurement) {
                // Procurement task creation is handled implicitly via the "procurement" tag now.
              }

              createdTasks.push(createdSubtask.id);
            }
          }
          createdTasks.push(parentTask.id);
          createdItems.push(...createdTasks);
        }
      }, { timeout: 60000 });
    } catch (err: any) {
      if (err.code === 'P2002') throw AppError.ValidationError(`Duplicate found. Ensure names are unique.`);
      if (err.code === 'P2003') throw AppError.ValidationError("Invalid assignee email.");
      if (err.code === 'P2025') throw AppError.NotFound("Project or workspace not found.");
      if (err.message?.includes('22021')) throw AppError.ValidationError("CSV contains invalid characters (UTF-8 required).");
      throw new Error(`Failed to upload tasks: ${err.message || 'Unknown'}`);
    }

    const fullTasks = await TaskRepository.findFullTasksByIds(createdItems);

    const taskCount = fullTasks.filter(i => i.isParent).length;
    const subtaskCount = fullTasks.filter(i => !i.isParent).length;

    let message = `Successfully created ${taskCount} task${taskCount !== 1 ? 's' : ''}`;
    if (subtaskCount > 0) message += ` and ${subtaskCount} subtask${subtaskCount !== 1 ? 's' : ''}`;

    const result = { tasks: fullTasks.map(t => TaskMapper.toFlatMetadata(t)) };
    TaskMapper.stripParentMetadata(result);

    return {
      success: true,
      message,
      data: result.tasks,
      workspaceId: project.workspaceId,
    };
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

  /** @deprecated Use TaskMapper.toLegacyMetadata directly */
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
    } else if (!task.subtaskCount && task.isParent) {
      task.subtaskCount = 0;
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

  /** @deprecated Use TaskMapper.toFlatMetadata directly */
  public static mapToFlatMetadata(task: any) {
    return TaskMapper.toFlatMetadata(task);
  }

  private static stripParentMetadata(result: any) {
    TaskMapper.stripParentMetadata(result);
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
        permissions.isProjectManager ||
        permissions.isProjectCoordinator ||
        permissions.isProjectLead;

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
          ...(wsPerms.coordinatorProjectIds || []),
          ...(wsPerms.memberProjectIds || []),
          ...(wsPerms.viewerProjectIds || []),
        ];

      // Full access = ONLY projects where user is explicitly a LEAD, PROJECT_COORDINATOR or PROJECT_MANAGER.
      // Being a PM in Project A does NOT grant full access to Project B (where they may be just a MEMBER).
      const fullAccessProjectIds = [
        ...(wsPerms.leadProjectIds ?? []),
        ...(wsPerms.managedProjectIds ?? []),
        ...(wsPerms.coordinatorProjectIds ?? []),
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

    // 🚀 NEW: Determine if we should show a restricted subtask count (Assigned to Me)
    // If the user is a workspace admin, or a lead/manager of the current project, show ALL subtasks count.
    // Otherwise, show only subtasks assigned to them.
    const isManagerOfCurrentProject = projectId && fullAccessProjectIds.includes(projectId);
    const isLeadOrManagerInWorkspace = fullAccessProjectIds.length > 0;
    const subtaskFilter = (!isAdmin && !isManagerOfCurrentProject && !isLeadOrManagerInWorkspace)
      ? buildAssigneeFilter(userId)
      : undefined;

    try {
      const toArray = <T>(v: T | T[] | undefined): T[] | undefined => {
        if (v === undefined) return undefined;
        const arr = Array.isArray(v) ? v : [v];
        const cleaned = arr.filter((i) => i !== null && i !== undefined && i !== "");
        return cleaned.length > 0 ? cleaned : undefined;
      };

      const isMinimal =
        opts.hierarchyMode === "parents" && !opts.includeSubTasks;

      const hasExplicitFilters = !!(
        (opts.status && toArray(opts.status)) ||
        (opts.assigneeId && toArray(opts.assigneeId)) ||
        (opts.tagId && toArray(opts.tagId)) ||
        (opts.search && opts.search.trim().length > 0) ||
        opts.dueAfter ||
        opts.dueBefore ||
        (opts.sorts && opts.sorts.length > 0) ||
        opts.filterParentTaskId
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
        hierarchyMode !== "parents" &&
        !isAdmin &&
        opts.view_mode !== "list" &&
        opts.groupBy !== "status" // kanban always uses groupBy=status — let it reach KANBAN_OPTIMIZED_PARALLEL
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

      if (filterParentTaskId && opts.groupBy !== "status") {
        strategy = "SUBTASK_EXPANSION";
        const result = await this._fetchSubtasks(
          filterParentTaskId,
          userId,
          isAdmin,
          fullAccessProjectIds,
          restrictedProjectIds,
          { ...opts, isMinimal },
          subtaskFilter,
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
          subtaskFilter,
        );

        if (opts.includeSubTasks && result.tasks.length > 0) {
          const parentIds = result.tasks
            .filter((t: any) => t.isParent)
            .map((t: any) => t.id);
          if (parentIds.length > 0) {
            const hasFullAccess =
              isAdmin ||
              (projectId ? fullAccessProjectIds.includes(projectId) : fullAccessProjectIds.length > 0);

            const subtasks = (await TaskRepository.findSubtasksExpansion(
              buildSubtaskExpansionWhere(undefined, {
                parentIds,
                status: toArray(opts.status),
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                userId,
                isAdmin,
                isRestrictedMember: !hasFullAccess,
              }),
              getTaskSelect(opts.view_mode, false, opts.extraFields),
              buildOrderBy(opts.sorts, opts.view_mode, opts.projectId),
              200
            )) as any[];

            // Use a map for O(n) grouping instead of O(n^2) nested filtering
            const subtaskMap = new Map<string, any[]>();
            subtasks.forEach((st) => {
              const pid = st.parentTaskId;
              if (pid) {
                if (!subtaskMap.has(pid)) subtaskMap.set(pid, []);
                subtaskMap.get(pid)!.push(TasksService.mapToFlatMetadata(st));
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
        (!isSorting || opts.view_mode === "gantt" || opts.view_mode === "list") &&
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
          subtaskFilter,
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
              dueBefore: opts.dueBefore,
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
              parentTaskId: opts.filterParentTaskId,
            },
            userId,
          );

          const tasks = (await TaskRepository.findTasksByStatus(
            where,
            perStatusLimit,
            getTaskSelect(opts.view_mode, isMinimal, opts.extraFields, subtaskFilter),
            buildOrderBy(opts.sorts, opts.view_mode, opts.projectId)
          )) as any[];

          const trueHasMore = tasks.length > perStatusLimit;
          if (trueHasMore) tasks.pop();

          // Handle Subtask Expansion
          if (opts.includeSubTasks && tasks.length > 0) {
            const parentIds = (tasks as any[]).filter((t) => t.isParent).map((t) => t.id) as string[];
            if (parentIds.length > 0) {
              const subtasks = await TaskRepository.findSubtasksExpansion(
                buildSubtaskExpansionWhere(undefined, {
                  parentIds,
                  status: [status as any],
                  assigneeId: toArray(opts.assigneeId),
                  tagId: toArray(opts.tagId),
                  search: opts.search,
                  userId,
                  isAdmin,
                }),
                getTaskSelect(opts.view_mode, false, opts.extraFields, subtaskFilter),
                buildOrderBy(opts.sorts, opts.view_mode, opts.projectId),
                1000 // safe cap
              );
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
                : opts.view_mode === "kanban"
                  ? {
                      id: lastTask.id,
                      position: (lastTask as any).position ?? null,
                      parentTaskPosition: (lastTask as any).parentTask?.position ?? null,
                      parentTaskId: (lastTask as any).parentTask?.id ?? null,
                      ...(!opts.projectId ? {
                        projectId: (lastTask as any).project?.id ?? null,
                        projectCreatedAt: (lastTask as any).project?.createdAt ?? null,
                      } : {}),
                    }
                  : { id: lastTask.id, createdAt: lastTask.createdAt }
              : null;

          const totalCount = await TaskRepository.countTasks(where);

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
                dueAfter: opts.dueAfter,
                dueBefore: opts.dueBefore,
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
                parentTaskId: opts.filterParentTaskId,
              },
              userId,
            ),
          ),
        );

        const countsResult = await TaskRepository.groupByStatus(countWhere);

        const statusCounts: Record<string, number> = {};
        countsResult.forEach((c) => {
          if (c.status) statusCounts[c.status] = (c._count as any)._all;
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
                dueBefore: opts.dueBefore,
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
                parentTaskId: opts.filterParentTaskId,
              },
              userId,
            );

            return TaskRepository.findTasksByWhere(
              statusWhere,
              perStatusLimit,
              getTaskSelect(opts.view_mode, isMinimal, opts.extraFields, subtaskFilter),
              buildOrderBy(opts.sorts, opts.view_mode, opts.projectId)
            );
          }),
        );

        const tasks = statusTasksResults.flat() as any[];

        // 4. Handle Subtask Expansion
        if (opts.includeSubTasks && tasks.length > 0) {
          const parentIds = (tasks as any[]).filter((t) => t.isParent).map((t) => t.id) as string[];
          if (parentIds.length > 0) {
            const subtasks = (await TaskRepository.findSubtasksExpansion(
              buildSubtaskExpansionWhere(undefined, {
                parentIds,
                status: toArray(opts.status),
                assigneeId: toArray(opts.assigneeId),
                tagId: toArray(opts.tagId),
                search: opts.search,
                userId,
                isAdmin,
              }),
              getTaskSelect(opts.view_mode, false, opts.extraFields, subtaskFilter),
              buildOrderBy(opts.sorts, opts.view_mode, opts.projectId),
              1000
            )) as any[];
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
                  : opts.view_mode === "kanban"
                    ? {
                        id: lastTask.id,
                        position: (lastTask as any).position ?? null,
                        parentTaskPosition: (lastTask as any).parentTask?.position ?? null,
                        parentTaskId: (lastTask as any).parentTask?.id ?? null,
                        ...(!opts.projectId ? {
                          projectId: (lastTask as any).project?.id ?? null,
                          projectCreatedAt: (lastTask as any).project?.createdAt ?? null,
                        } : {}),
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
            opts.onlySubtasks ||
            (!hasExplicitFilters && hierarchyMode === "children"),
        },
        subtaskFilter,
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
    subtaskFilter?: any,
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

    const primarySortField = opts.sorts?.[0]?.field;
    const dbField = primarySortField ? SORT_MAP[primarySortField]?.dbField : null;

    const [rawTasks] = await Promise.all([
      TaskRepository.findMany(
        where,
        // position is already selected for list/gantt; only inject dbField for custom sorts
        getTaskSelect(opts.view_mode, true, dbField ? (opts.extraFields ? [...opts.extraFields, dbField] : [dbField]) : opts.extraFields, subtaskFilter),
        opts.sorts,
        limit,
        undefined,
        opts.view_mode,
        projectId,
      ),
    ]);

    const hasMore = rawTasks.length > limit;
    if (hasMore) rawTasks.pop();

    if (rawTasks.length === 0) {
      return {
        tasks: [],
        totalCount: 0,
        hasMore: false,
        nextCursor: null,
        facets: { status: {}, assignee: {}, tags: {}, projects: {} },
      };
    }

    const lastTask = rawTasks[rawTasks.length - 1] as any;

    // Use position-based cursor to match position-ordered query
    const nextCursor: any = hasMore
      ? dbField
        ? { id: lastTask.id, [dbField]: lastTask[dbField] }          // custom sort
        : { id: lastTask.id, position: (lastTask as any).position ?? null }  // default: position seek
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
    subtaskFilter?: any,
  ) {
    const limit = opts.limit ?? 30;

    let isRestrictedMember = false;
    if (!isAdmin) {
      const parentProjectId = await TaskRepository.findTaskProjectId(parentTaskId);
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

    const rawSubtasks = (await TaskRepository.findTasksByWhere(
      where,
      limit + 1,
      getTaskSelect(
        opts.view_mode,
        opts.view_mode === "gantt" ? true : false, // Expansion needs full metadata for the table row
        opts.extraFields,
        subtaskFilter
      ),
      buildOrderBy(opts.sorts, opts.view_mode)
    )) as any[];

    const hasMore = rawSubtasks.length > limit;
    const finalTasks = hasMore ? rawSubtasks.slice(0, limit) : rawSubtasks;

    const nextCursor: TaskCursor | null = hasMore && finalTasks.length > 0
      ? {
        id: finalTasks[finalTasks.length - 1].id,
        createdAt: finalTasks[finalTasks.length - 1].createdAt,
        position: finalTasks[finalTasks.length - 1].position,
      }
      : null;

    return {
      tasks: finalTasks.map((t: any) => TasksService.mapToFlatMetadata(t)),
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
    subtaskFilter?: any,
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

    // Execution filters trigger subtask-first mode
    const hasExecutionFilters = !!(
      (opts.status && toArray(opts.status)?.length) ||
      (opts.assigneeId && toArray(opts.assigneeId)?.length) ||
      (opts.tagId && toArray(opts.tagId)?.length) ||
      opts.dueAfter ||
      opts.dueBefore
    );

    const isSubtaskFirstMode = hasExecutionFilters && opts.view_mode === "list";

    // For subtask-first mode: we want to page through results grouped by parent.
    // Use parentTaskId ASC, id ASC so all subtasks for a parent come in one page.
    // For this, we handle the cursor separately (not through buildWorkspaceFilterWhere)
    // to avoid conflicting with the generic createdAt-based cursor logic.
    const subtaskFirstCursor = isSubtaskFirstMode ? opts.cursor : undefined;
    const matchWhere = buildWorkspaceFilterWhere(
      {
        workspaceId,
        projectId: opts.projectId,
        assigneeId: toArray(opts.assigneeId),
        status: toArray(opts.status),
        tagId: toArray(opts.tagId),
        dueAfter: opts.dueAfter,
        dueBefore: opts.dueBefore,
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
        onlySubtasks: isSubtaskFirstMode || (!hasExplicitFilters && opts.hierarchyMode === "children"),
        excludeParents: isSubtaskFirstMode,
        view_mode: opts.view_mode,
        ids: opts.ids,
        // Only pass cursor for non-subtask-first mode (handled separately below)
        cursor: isSubtaskFirstMode ? undefined : opts.cursor,
      },
      userId,
    );

    // In subtask-first mode, inject the cursor as a parentTaskId+id seek condition
    // so pagination is stable per-parent (all subtasks of a parent come together)
    if (isSubtaskFirstMode && subtaskFirstCursor?.parentTaskId && subtaskFirstCursor?.id) {
      const seekCond = {
        OR: [
          { parentTaskId: { gt: subtaskFirstCursor.parentTaskId } },
          {
            AND: [
              { parentTaskId: subtaskFirstCursor.parentTaskId },
              { id: { gt: subtaskFirstCursor.id } }
            ]
          }
        ]
      };
      if (!matchWhere.AND) (matchWhere as any).AND = [];
      (matchWhere.AND as any[]).push(seekCond);
    }

    const primarySortFieldForSelect = opts.sorts?.[0]?.field || "createdAt";
    const dbFieldForSelect = SORT_MAP[primarySortFieldForSelect]?.dbField || "createdAt";

    // Use parentTaskId+id ordering in subtask-first mode so all subtasks for a given
    // parent come in a single page. For normal mode, use the configured sort order.
    const orderByForQuery = isSubtaskFirstMode
      ? [{ parentTaskId: "asc" as const }, { id: "asc" as const }]
      : buildOrderBy(opts.sorts, opts.view_mode, opts.projectId);

    const rawMatches = (await TaskRepository.findTasksByWhere(
      matchWhere,
      limit + 1,
      getTaskSelect(
        opts.view_mode,
        opts.view_mode === "gantt" || opts.isMinimal,
        opts.extraFields ? [...opts.extraFields, (dbFieldForSelect || "createdAt")] : (dbFieldForSelect ? [dbFieldForSelect] : []),
        subtaskFilter,
        isSubtaskFirstMode
      ),
      orderByForQuery
    )) as any[];

    const hasMore = rawMatches.length > limit;
    const matches = rawMatches.slice(0, limit);

    if (matches.length === 0) {
      return { tasks: [], totalCount: 0, hasMore: false, nextCursor: null, isSubtaskFirstMode };
    }

    // 🚀 SUBTASK-FIRST SHORTCUT: If in subtask-first mode, skip expansion and return flat list
    if (isSubtaskFirstMode) {
      const lastMatch = matches[matches.length - 1];
      // Cursor includes parentTaskId so seek condition is stable per-parent
      const nextCursor = hasMore ? {
        id: lastMatch.id,
        parentTaskId: lastMatch.parentTaskId,
        createdAt: lastMatch.createdAt
      } : null;

      return {
        tasks: matches,
        totalCount: matches.length,
        hasMore,
        nextCursor,
        isSubtaskFirstMode: true
      };
    }

    const expansionMatchWhere = { ...matchWhere };
    delete (expansionMatchWhere as any).isParent;
    delete (expansionMatchWhere as any).parentTaskId;

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
      const extraTasks = (await TaskRepository.findTasksForExpansion({ OR: orConditions }, getTaskSelect(opts.view_mode, false, opts.extraFields, subtaskFilter))) as any[];

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

      // 🚀 NEW: Ensure subtasks are sorted by position
      allTasks.forEach((task) => {
        if (task.subTasks && task.subTasks.length > 1) {
          task.subTasks.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
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

    const isWorkspaceListOrGantt = !opts.projectId && (opts.view_mode === "list" || opts.view_mode === "gantt");
    const nextCursor: any =
      hasMore && matches.length > 0
        ? {
          id: lastMatch.id,
          [dbField]: lastMatch[dbField],
          ...(isWorkspaceListOrGantt ? {
            position: (lastMatch as any).position ?? null,
            projectCreatedAt: (lastMatch as any).project?.createdAt ?? null,
          } : {}),
        }
        : null;

    const projectFacets: Record<string, number> = {};
    if (opts.includeFacets) {
      const facetWhere = JSON.parse(JSON.stringify(matchWhere));
      // If we restricted matches to expanded projects (e.g. for initial load optimization), 
      // we still want facets (task counts) for ALL projects in the workspace.
      if (!opts.projectId && opts.expandedProjectIds?.length) {
        delete facetWhere.projectId;
      }
      const counts = await TaskRepository.groupByProjectId(facetWhere);
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
    subtaskFilter?: any,
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
      onlySubtasks: opts.onlySubtasks,
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
      TaskRepository.findMany(
        where,
        getTaskSelect(opts.view_mode, opts.onlySubtasks ? false : true, opts.extraFields ? [...opts.extraFields, (dbField || "createdAt")] : (dbField ? [dbField] : []), subtaskFilter),
        opts.sorts,
        limit,
        undefined,
        opts.view_mode,
        opts.projectId,
      ),
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
    const isWsListOrGantt = !opts.projectId && (opts.view_mode === "list" || opts.view_mode === "gantt");
    const nextCursor: any =
      hasMore && lastTask
        ? primarySort && SORT_MAP[primarySort.field]
          ? {
            id: lastTask.id,
            [SORT_MAP[primarySort.field].dbField]:
              lastTask[SORT_MAP[primarySort.field].dbField],
          }
          : isWsListOrGantt
            ? { id: lastTask.id, position: lastTask.position ?? null, projectCreatedAt: lastTask.project?.createdAt ?? null }
            : { id: lastTask.id, createdAt: lastTask.createdAt }
        : null;

    const projectFacets: Record<string, number> = {};
    if (opts.includeFacets) {
      const facetWhere = JSON.parse(JSON.stringify(where));
      // If we restricted matches to expanded projects, we still want facets for ALL projects in the workspace.
      if (!opts.projectId && opts.expandedProjectIds?.length) {
        delete facetWhere.projectId;
      }
      const counts = await TaskRepository.groupByProjectId(facetWhere);
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
          projectRole: "MEMBER",
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

    const parentTask = await TaskRepository.findTaskBasic(parentTaskId);

    if (!parentTask) {
      throw AppError.NotFound("Parent task not found.");
    }

    const { generateUniqueSlug } = await import("@/lib/slug-generator");
    const slug = await generateUniqueSlug(name, "task", parentTask.taskSlug);

    // 🚀 Handle Position: Query the last subtask position to append this one
    const lastSubtask = await TaskRepository.findLastSubtaskPosition(parentTaskId);
    const nextPosition = (lastSubtask?.position ?? -1) + 1;

    const newSubTask = await TaskRepository.createSubTask({
      parentTaskId,
      taskData: {
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
        position: nextPosition,
      }
    });

    if (tagIds && tagIds.length > 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          tags: {
            connect: tagIds.map((id) => ({ id })),
          },
        },
      });
    }

    const flattenedSubTask = TaskMapper.toFlatMetadata(newSubTask);

    try {
      const projectSlug = await TaskRepository.findProjectSlug(projectId);
      await TaskEvents.onSubTaskCreated({
        taskId: flattenedSubTask.id,
        projectId,
        workspaceId,
        userId,
        userName: permissions.userSurname,
        taskData: flattenedSubTask,
        projectSlug: projectSlug,
      });
    } catch (e) {
      console.error("[SERVICE_ERROR] Subtask activity failed:", e);
    }

    return flattenedSubTask;
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
    const subTask = (await TaskRepository.findById(subTaskId, {
      id: true,
      status: true,
      name: true,
      createdById: true,
      assigneeId: true,
      reviewerId: true,
      parentTaskId: true,
      updatedAt: true,
    })) as any;

    if (!subTask) {
      throw AppError.NotFound("Subtask not found");
    }

    // 2. Authorization Checks
    const currentProjectMemberId = permissions.projectMember?.id;
    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectCoordinator = permissions.isProjectCoordinator;
    const isProjectLead = permissions.isProjectLead;

    const isCreator = currentProjectMemberId
      ? subTask.createdById === currentProjectMemberId
      : false;
    const isAssignee = currentProjectMemberId
      ? subTask.assigneeId === currentProjectMemberId
      : false;

    if (!isWorkspaceAdmin && !isProjectManager && !isProjectCoordinator) {
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

    // 🔒 COMPLETED / HOLD / CANCELLED rule:
    // - Workspace Admin, Project Manager, Project Coordinator (not assigned as worker): always allowed.
    // - Project Lead: allowed ONLY on tasks they personally created (and not assigned as worker).
    // - Member / others: never allowed.
    const isActingAsManager = !isAssignee && (isWorkspaceAdmin || isProjectManager || isProjectCoordinator);
    const leadCanComplete = !isAssignee && isProjectLead && isCreator;
    const canCompleteOrHoldOrCancel = isActingAsManager || leadCanComplete;

    if (
      ["COMPLETED", "HOLD", "CANCELLED"].includes(newStatus) &&
      !canCompleteOrHoldOrCancel
    ) {
      throw AppError.Forbidden(
        "Only the Project Manager, Coordinator, or Admin (not personally assigned) or the Lead who created this task can mark tasks as Completed, On Hold, or Cancelled.",
      );
    }

    // Specific Restriction: Tasks in REVIEW status
    // - Only PM, Coordinator, or creating Lead (not personally assigned) can move it out of REVIEW.
    if (subTask.status === "REVIEW") {
      if (!canCompleteOrHoldOrCancel) {
        throw AppError.Forbidden(
          "You cannot move this task out of Review status. Only the Project Manager, Coordinator, or Admin (not personally assigned) or the creating Lead can.",
        );
      }
    }

    // 3. Status Transition Validation
    if (subTask.status === newStatus && newStatus !== "REVIEW") {
      return subTask; // No change needed
    }

    // Constraint: COMPLETED status can only be reached from REVIEW
    if (newStatus === "COMPLETED" && subTask.status !== "REVIEW") {
      throw AppError.ValidationError(
        "Before marking a task as Completed, you must first move it to Review status.",
      );
    }

    const isMandatoryTransition =
      ["HOLD", "CANCELLED", "REVIEW"].includes(newStatus) ||
      (subTask.status && ["HOLD", "CANCELLED", "COMPLETED"].includes(subTask.status)) ||
      (subTask.status === "REVIEW" &&
        (newStatus === "TO_DO" || newStatus === "IN_PROGRESS")) ||
      (subTask.status === "IN_PROGRESS" && newStatus === "TO_DO");

    if (isMandatoryTransition && !comment && !attachmentData) {
      throw AppError.ValidationError(
        "A comment or attachment link is required for this status transition.",
      );
    }

    // Business rule: We record an activity showing the status transition and any user comment.
    const transitionHeader = `${subTask.status} -> ${newStatus}`;
    const activityText = comment && comment.trim()
      ? `${transitionHeader}\n${comment.trim()}`
      : transitionHeader;

    const attachmentJson = {
      previousStatus: subTask.status,
      targetStatus: newStatus,
      ...(attachmentData ? {
        url: typeof attachmentData === "string" ? attachmentData : (attachmentData.url || attachmentData.data || attachmentData),
      } : {})
    };

    const result = await TaskRepository.updateStatus(
      subTaskId, newStatus, subTaskId,
      { subTaskId, authorId: userId, workspaceId, text: activityText, attachment: attachmentJson },
      subTask.parentTaskId, subTask.status === "COMPLETED", newStatus === "COMPLETED"
    );

    const project = await TaskRepository.findProjectId(subTaskId);

    // 5. Broadcast (Background - Non-blocking)
    await TaskEvents.onStatusChanged({
      taskId: subTaskId,
      workspaceId,
      projectId: project || "",
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      oldStatus: subTask.status || "",
      newStatus,
    });

    return result;
  }

  /**
   * Get core members involved in a task (Admins, PMs, Assignee, Reviewer)
   * Optimized for the SubTask Sheet to avoid fetching full member lists.
   */
  static async getTaskCommentContext(workspaceId: string, slugOrId: string) {
    const task = await TaskRepository.findTaskForCommentContext(workspaceId, slugOrId);
    if (!task) throw AppError.NotFound("Task not found");

    const involvedMembers = await TaskRepository.findInvolvedMembersForTask(
      workspaceId, task.projectId, task.assigneeId, task.reviewerId
    );

    const involvedUsers = involvedMembers.map(TaskMapper.toInvolvedUser);
    return { involvedUsers };
  }

  /**
   * Get a task by slug or ID with full relations for the SubTask Sheet
   */
  static async getTaskBySlugOrId(workspaceId: string, slugOrId: string) {
    const task = await TaskRepository.findBySlugOrId(workspaceId, slugOrId, getTaskSelect("default"));
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
    const task = (await TaskRepository.findById(taskId, {
      id: true,
      createdById: true,
      assigneeId: true,
      parentTaskId: true,
      name: true,
      status: true,
    })) as any;

    if (!task) throw AppError.NotFound("Task not found");

    const currentProjectMemberId = permissions.projectMember?.id;
    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectCoordinator = permissions.isProjectCoordinator;
    const isProjectLead = permissions.isProjectLead;

    const isAssignee = currentProjectMemberId
      ? task.assigneeId === currentProjectMemberId
      : false;

    // Unconditional block: Assignees can NEVER edit dates/days, irrespective of any role (even Admin/PM/Lead)
    const isUpdatingDates = data.startDate !== undefined || data.dueDate !== undefined || data.days !== undefined;
    if (isAssignee && isUpdatingDates) {
      throw AppError.Forbidden(
        "You don't have permission to update task dates because you are the assignee.",
      );
    }

    // 1. Base Authorization
    // Assignees cannot edit task metadata (Name, Description, Dates, Assignee, Reviewer, Tags)
    // even if they are Project Manager, Coordinator, or Lead, unless they are Workspace Admin.
    const isAuthorized =
      isWorkspaceAdmin ||
      (!isAssignee && (
        isProjectManager ||
        isProjectCoordinator ||
        (isProjectLead &&
          currentProjectMemberId &&
          task.createdById === currentProjectMemberId)
      ));

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "You don't have permission to update this task because you are the assignee.",
      );
    }

    // 2. Hierarchy Rules
    if (task.assigneeId) {
      const assignee = await TaskRepository.findAssigneeRole(task.assigneeId);

      if (assignee?.projectRole === "PROJECT_MANAGER" && !isWorkspaceAdmin) {
        throw AppError.Forbidden(
          "Only a Workspace Admin can edit tasks assigned to a Project Manager.",
        );
      }
      if (
        assignee?.projectRole === "LEAD" &&
        !isWorkspaceAdmin &&
        !isProjectManager &&
        !isProjectCoordinator
      ) {
        throw AppError.Forbidden(
          "Only a Workspace Admin, Project Manager, or Project Coordinator can edit tasks assigned to a Project Lead.",
        );
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;

    // 🚀 Constraint: Parent tasks cannot have status, assignee, or dates.
    if (!task.parentTaskId) {
      updateData.status = null;
      updateData.assigneeId = null;
      updateData.reviewerId = null;
      updateData.startDate = null;
      updateData.dueDate = null;
      updateData.days = null;
    } else {
      // It's a subtask, allow updates to execution fields
      if (data.status && data.status !== task.status) {
        const isAssignee = currentProjectMemberId
          ? task.assigneeId === currentProjectMemberId
          : false;

        const isActingAsManager =
          !isAssignee &&
          (isWorkspaceAdmin || isProjectManager || isProjectCoordinator);

        const leadCanComplete =
          !isAssignee &&
          isProjectLead &&
          task.createdById === currentProjectMemberId;

        const canCompleteOrHoldOrCancel = isActingAsManager || leadCanComplete;

        // 1. Workflow check: COMPLETED can only come from REVIEW
        if (data.status === "COMPLETED" && task.status !== "REVIEW") {
          throw AppError.ValidationError(
            "Before marking a task as Completed, you must first move it to Review status.",
          );
        }

        // 2. Role check: COMPLETED/HOLD/CANCELLED
        if (
          ["COMPLETED", "HOLD", "CANCELLED"].includes(data.status) &&
          !canCompleteOrHoldOrCancel
        ) {
          throw AppError.Forbidden(
            "Only the Project Manager, Coordinator, or Admin (not personally assigned) can mark tasks as Completed, On Hold, or Cancelled.",
          );
        }

        // 3. Review check: Moving out of REVIEW
        if (task.status === "REVIEW" && !canCompleteOrHoldOrCancel) {
          throw AppError.Forbidden(
            "You cannot move this task out of Review status. Only the Project Manager, Coordinator, or Admin (not personally assigned) can.",
          );
        }

        // 4. Comment check: Since general task editing does not collect transition comments,
        // block any move that requires a comment and tell them to do it from the list/board status changer.
        const isMandatoryTransition =
          ["HOLD", "CANCELLED", "REVIEW"].includes(data.status) ||
          (task.status && ["HOLD", "CANCELLED", "COMPLETED"].includes(task.status)) ||
          (task.status === "REVIEW" &&
            (data.status === "TO_DO" || data.status === "IN_PROGRESS")) ||
          (task.status === "IN_PROGRESS" && data.status === "TO_DO");

        if (isMandatoryTransition) {
          throw AppError.ValidationError(
            "This status transition requires an explanation comment. Please update the status directly from the board or list view.",
          );
        }

        updateData.status = data.status;
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
    }

    if (data.tagIds !== undefined) {
      updateData.tags = {
        set: data.tagIds.map(id => ({ id }))
      };
    }

    const updated = await TaskRepository.updateTaskAndParentCount(
      taskId, updateData, task.parentTaskId, task.status === "COMPLETED", data.status === "COMPLETED"
    );

    if (data.tagIds && data.tagIds.length > 0) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          tags: {
            connect: data.tagIds.map((id) => ({ id })),
          },
        },
      });
    }

    const oldData: any = {};
    if (data.name) oldData.name = task.name;
    if (data.status) oldData.status = task.status;
    if (data.assigneeUserId) oldData.assigneeId = task.assigneeId;

    await TaskEvents.onTaskUpdated({
      taskId,
      isSubTask: !!task.parentTaskId,
      projectId,
      workspaceId,
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      oldData,
      newData: updateData,
    });

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
    const task = (await TaskRepository.findById(taskId, {
      id: true,
      name: true,
      status: true,
      createdById: true,
      parentTaskId: true,
      projectId: true,
      position: true,
    })) as any;

    if (!task) throw AppError.NotFound("Task not found");

    const currentProjectMemberId = permissions.projectMember?.id;
    const isAuthorized =
      permissions.isWorkspaceAdmin ||
      permissions.isProjectManager ||
      permissions.isProjectCoordinator ||
      (currentProjectMemberId && task.createdById === currentProjectMemberId);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "You don't have permission to delete this task.",
      );
    }

    const targetUserIds = await getTaskInvolvedUserIds(taskId);

    // Snapshot project materials subtask and parent task names before deleting the subtask
    try {
      const taskToSnapshot = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          parentTask: { select: { name: true } },
          materialItems: { select: { id: true } },
        },
      });

      if (taskToSnapshot && taskToSnapshot.materialItems.length > 0) {
        await prisma.projectMaterialItem.updateMany({
          where: { subtaskId: taskId },
          data: {
            subtaskNameSnapshot: taskToSnapshot.name,
            parentTaskNameSnapshot: taskToSnapshot.parentTask?.name || null,
          },
        });
      }
    } catch (err) {
      console.error("[SERVICE_ERROR] Failed to snapshot materials on task delete:", err);
    }

    await TaskRepository.deleteTask({
      taskId,
      parentTaskId: task.parentTaskId,
      projectId: task.projectId,
      position: task.position || 0,
      wasCompleted: task.status === "COMPLETED"
    });

    await TaskEvents.onTaskDeleted({
      taskId,
      isSubTask: !!task.parentTaskId,
      projectId: task.projectId || projectId || "",
      workspaceId,
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      taskName: task.name,
      taskStatus: task.status || "",
      targetUserIds,
      position: task.position,
      parentTaskId: task.parentTaskId,
    });

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

    const task = (await TaskRepository.findById(taskId, {
      id: true,
      createdById: true,
      assigneeId: true,
      parentTaskId: true,
      name: true,
    })) as any;

    if (!task) throw AppError.NotFound("Task not found");

    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectCoordinator = permissions.isProjectCoordinator;
    const currentProjectMemberId = permissions.projectMember?.id;

    // 1. Permission Check
    const isAuthorized =
      isWorkspaceAdmin ||
      isProjectManager ||
      isProjectCoordinator ||
      (permissions.isProjectLead &&
        currentProjectMemberId &&
        task.createdById === currentProjectMemberId);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "Only Project Managers, Coordinators, or the Task Creator can manage the timeline.",
      );
    }

    // 2. Hierarchy Check
    if (task.assigneeId) {
      const assignee = await TaskRepository.findAssigneeRole(task.assigneeId);

      if (assignee?.projectRole === "PROJECT_MANAGER" && !isWorkspaceAdmin) {
        throw AppError.Forbidden(
          "Only a Workspace Admin can update tasks assigned to a Project Manager.",
        );
      }
      if (
        assignee?.projectRole === "LEAD" &&
        !isWorkspaceAdmin &&
        !isProjectManager &&
        !isProjectCoordinator
      ) {
        throw AppError.Forbidden(
          "Only a Workspace Admin, Project Manager, or Project Coordinator can update tasks assigned to a Project Lead.",
        );
      }
    }

    const days =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;

    const updated = await TaskRepository.updateDates(taskId, start, end, days);

    const project = await TaskRepository.findProjectId(taskId);

    await TaskEvents.onDatesUpdated({
      taskId,
      projectId: project || "",
      workspaceId,
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      startDate: start,
      dueDate: end,
      days,
    });

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

    const subtask = (await TaskRepository.findById(subtaskId, {
      id: true,
      createdById: true,
      startDate: true,
      days: true,
      projectId: true,
    })) as any;

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

    const existingDeps = await TaskRepository.findTaskWithDependencies(subtaskId);
    const existingDepIds = new Set(
      existingDeps?.Task_TaskDependency_A.map((d) => d.id) || [],
    );

    const newDependsOnIds = dependsOnIds.filter(
      (id) => !existingDepIds.has(id),
    );

    if (newDependsOnIds.length === 0) {
      return { success: true, message: "All dependencies already exist" };
    }

    const tasksToCheck = await TaskRepository.findTasksByIds(newDependsOnIds, {
      id: true,
      startDate: true,
      days: true,
      projectId: true,
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

    await TaskRepository.addDependencies(subtaskId, newDependsOnIds);

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
    const subtask = (await TaskRepository.findById(subtaskId, { createdById: true })) as any;
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

    await TaskRepository.removeDependency(subtaskId, dependsOnId);

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

      const tasks = await TaskRepository.findDependencyGraph(currentLevel);

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
    const firstSubTask = (await TaskRepository.findById(subtaskIds[0], { parentTaskId: true })) as any;
    if (!firstSubTask?.parentTaskId) return;
    await TaskRepository.reorderSubtasks(firstSubTask.parentTaskId, subtaskIds);
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
    const results = await TasksService.getSubTasksByParentIds(
      [parentId],
      workspaceId,
      projectId,
      filters,
      pageSize,
      viewMode,
      undefined, // extraFields
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
    extraFields,
    userId,
  }: {
    parentIds: string[];
    workspaceId: string;
    projectId?: string;
    filters: any;
    pageSize: number;
    viewMode: string;
    extraFields?: string[];
    userId: string;
  }) {
    const results = await TasksService.getSubTasksByParentIds(
      parentIds,
      workspaceId,
      projectId,
      filters,
      pageSize,
      viewMode,
      extraFields,
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
      TaskRepository.findById(taskId, {
        id: true,
        createdById: true,
        assigneeId: true,
        parentTaskId: true,
        name: true,
        status: true,
      }) as any,
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

    const { updated, commentActivity } = await TaskRepository.updateTaskWithActivity(
      taskId,
      { assigneeId: newAssigneeId },
      {
        authorId: userId,
        workspaceId,
        text: explanation?.trim() || "Assignee updated",
      }
    );

    // 5. Broadcast (Minimize await if possible, but keep consistent)
    await TaskEvents.onAssigneeChanged({
      taskId,
      isSubTask: !!task.parentTaskId,
      projectId,
      workspaceId,
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      oldAssigneeId: task.assigneeId,
      newAssigneeId,
      commentActivity,
      explanation
    });

    return { success: true };
  }

  /**
   * Universal field patch for specific task parameters (reusable for Gantt, Kanban, etc.)
   */
  static async patchTaskFields({
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
    data: {
      startDate?: string | Date;
      dueDate?: string | Date;
      assigneeUserId?: string | null;
      tagIds?: string[];
    };
  }) {
    const task = (await TaskRepository.findById(taskId, {
      id: true,
      createdById: true,
      assigneeId: true,
      parentTaskId: true,
      startDate: true,
      dueDate: true,
      status: true,
      name: true,
    })) as any;

    if (!task) throw AppError.NotFound("Task not found");

    const currentProjectMemberId = permissions.projectMember?.id;
    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectCoordinator = permissions.isProjectCoordinator;
    const isProjectLead = permissions.isProjectLead;

    const isAssignee = currentProjectMemberId
      ? task.assigneeId === currentProjectMemberId
      : false;

    // Unconditional block: Assignees can NEVER edit dates/days, irrespective of any role (even Admin/PM/Lead)
    const isUpdatingDates = data.startDate !== undefined || data.dueDate !== undefined;
    if (isAssignee && isUpdatingDates) {
      throw AppError.Forbidden(
        "You don't have permission to update task dates because you are the assignee.",
      );
    }

    // 1. Permission Check
    const isAuthorized =
      isWorkspaceAdmin ||
      isProjectManager ||
      isProjectCoordinator ||
      (isProjectLead &&
        currentProjectMemberId &&
        task.createdById === currentProjectMemberId);

    if (!isAuthorized) {
      throw AppError.Forbidden(
        "You don't have permission to update this task.",
      );
    }

    // 2. Hierarchy Check
    if (task.assigneeId) {
      const assignee = await TaskRepository.findAssigneeRole(task.assigneeId);

      if (assignee?.projectRole === "PROJECT_MANAGER" && !isWorkspaceAdmin) {
        throw AppError.Forbidden(
          "Only a Workspace Admin can edit tasks assigned to a Project Manager.",
        );
      }
      if (
        assignee?.projectRole === "LEAD" &&
        !isWorkspaceAdmin &&
        !isProjectManager &&
        !isProjectCoordinator
      ) {
        throw AppError.Forbidden(
          "Only a Workspace Admin, Project Manager, or Project Coordinator can edit tasks assigned to a Project Lead.",
        );
      }
    }

    // Prepare update data
    const patchData: any = {};

    // Handle Dates
    if (data.startDate !== undefined) {
      patchData.startDate = data.startDate ? parseIST(data.startDate as any) : null;
    }
    if (data.dueDate !== undefined) {
      patchData.dueDate = data.dueDate ? parseIST(data.dueDate as any) : null;
    }

    const start = patchData.startDate !== undefined ? patchData.startDate : task.startDate;
    const end = patchData.dueDate !== undefined ? patchData.dueDate : task.dueDate;

    if (start && end) {
      const startDateObj = new Date(start);
      const dueDateObj = new Date(end);
      if (startDateObj > dueDateObj) {
        throw AppError.ValidationError("Start date must be before end date");
      }
      patchData.days = Math.ceil((dueDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)) || 1;
    } else if (data.startDate !== undefined || data.dueDate !== undefined) {
      // If one of them was set to null and other is also null (or we cleared dates)
      patchData.days = null;
    }

    // Handle Assignee
    if (data.assigneeUserId !== undefined) {
      patchData.assigneeId = data.assigneeUserId
        ? await this.resolveOrJoinProjectMember(
          data.assigneeUserId,
          projectId,
          workspaceId,
        )
        : null;
    }

    // Handle Tags
    if (data.tagIds !== undefined) {
      patchData.tags = {
        set: data.tagIds.map(id => ({ id }))
      };
    }

    if (Object.keys(patchData).length === 0) {
      return task;
    }

    const updated = await TaskRepository.updateTaskAndParentCount(
      taskId,
      patchData,
      task.parentTaskId,
      task.status === "COMPLETED",
      task.status === "COMPLETED"
    );

    const oldData: any = {};
    if (data.startDate !== undefined) oldData.startDate = task.startDate;
    if (data.dueDate !== undefined) oldData.dueDate = task.dueDate;
    if (data.assigneeUserId !== undefined) oldData.assigneeId = task.assigneeId;

    await TaskEvents.onTaskUpdated({
      taskId,
      isSubTask: !!task.parentTaskId,
      projectId,
      workspaceId,
      userId,
      userName: permissions.userSurname || (() => { throw new Error("Permission error: userSurname is missing."); })(),
      oldData,
      newData: patchData,
    });

    return updated;
  }


  /**
   * Resolves a target user's ProjectMember.id, auto-joining them if they are a Workspace Admin/Owner.
   */
  private static async resolveOrJoinProjectMember(
    userId: string,
    projectId: string,
    workspaceId: string,
  ): Promise<string | null> {
    const existingId = await TaskRepository.findProjectMemberId(userId, projectId, workspaceId);
    if (existingId) return existingId;

    const workspaceMember = await TaskRepository.findWorkspaceMember(userId, workspaceId);

    if (
      workspaceMember &&
      (workspaceMember.workspaceRole === "ADMIN" ||
        workspaceMember.workspaceRole === "OWNER")
    ) {
      const pm = await TaskRepository.createProjectMember({ projectId, workspaceMemberId: workspaceMember.id });
      return pm.id;
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BATCH SUBTASK FETCHING  (previously src/data/task/get-subtasks-batch.ts)
  // ─────────────────────────────────────────────────────────────────────────

  static readonly BATCH_HARD_LIMIT = 500;

  private static async _getSubTasksByParentIdsInternal(
    parentTaskIds: string[],
    workspaceId: string,
    projectId: string | undefined,
    userId: string,
    isAdmin: boolean,
    fullAccessProjectIds: string[],
    restrictedProjectIds: string[],
    filters: Partial<import("@/types/task-filters").TaskFilters> = {},
    pageSize: number = 30,
    viewMode: string = "list",
    extraFields?: string[],
    cursor?: any,
  ): Promise<BatchSubTasksResult> {
    if (parentTaskIds.length === 0) return [];
    const startTime = performance.now();
    const { buildSubTaskConditions } = await import("@/lib/tasks/filter-utils");
    const normalize = (d: any) => d ? new Date(new Date(d).setUTCHours(0, 0, 0, 0)) : undefined;
    const dueAfter = normalize(filters.dueAfter || (filters as any).startDate);
    const dueBefore = normalize(filters.dueBefore || (filters as any).endDate);

    const countWhere: any = {
      workspaceId,
      parentTaskId: { in: parentTaskIds },
      ...buildSubTaskConditions({ ...filters, workspaceId, projectId, dueAfter, dueBefore }),
    };

    // Apply RBAC Access Control as an mandatory AND condition to avoid overwriting UI filters (like assignee filter)
    if (!isAdmin) {
      const accessConditions: any[] = [];
      if (fullAccessProjectIds.length > 0 && restrictedProjectIds.length > 0) {
        accessConditions.push({
          OR: [
            { projectId: { in: fullAccessProjectIds } },
            {
              projectId: { in: restrictedProjectIds },
              OR: [
                { assignee: { workspaceMember: { userId } } },
                { createdBy: { workspaceMember: { userId } } },
              ]
            },
          ]
        });
      } else if (fullAccessProjectIds.length > 0) {
        accessConditions.push({ projectId: { in: fullAccessProjectIds } });
      } else if (restrictedProjectIds.length > 0) {
        accessConditions.push({
          projectId: { in: restrictedProjectIds },
          OR: [
            { assignee: { workspaceMember: { userId } } },
            { createdBy: { workspaceMember: { userId } } },
          ]
        });
      } else {
        return parentTaskIds.map(parentTaskId => ({ parentTaskId, subTasks: [], totalCount: 0, hasMore: false }));
      }

      if (accessConditions.length > 0) {
        countWhere.AND = [...(countWhere.AND || []), ...accessConditions];
      }
    }

    // ── SINGLE PARENT FAST PATH ──────────────────────────────────────────
    if (parentTaskIds.length === 1) {
      const parentId = parentTaskIds[0];
      const baseSelect: any = getTaskSelect("subtask", false, extraFields);
      const subtaskSelect: any = { ...baseSelect };
      const parentRelationSelect = subtaskSelect.parentTask;
      delete subtaskSelect.parentTask;
      delete subtaskSelect._count;
      delete subtaskSelect.project;

      const singleParentWhere: any = {
        parentTaskId: parentId,
        ...buildSubTaskConditions({ ...filters, workspaceId, projectId, dueAfter, dueBefore }),
      };

      if (cursor) {
        const cursorDate = typeof cursor.createdAt === "string" ? new Date(cursor.createdAt) : cursor.createdAt;
        let cursorClause: any;
        if (cursor.position !== undefined && cursor.position !== null) {
          cursorClause = {
            OR: [
              { position: { gt: cursor.position } },
              {
                AND: [
                  { position: cursor.position },
                  {
                    OR: [
                      { createdAt: { lt: cursorDate } },
                      {
                        AND: [
                          { createdAt: cursorDate },
                          { id: { lt: cursor.id } }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          };
        } else {
          cursorClause = { OR: [{ createdAt: { lt: cursorDate } }, { AND: [{ createdAt: cursorDate }, { id: { lt: cursor.id } }] }] };
        }
        singleParentWhere.AND = [...(singleParentWhere.AND ?? []), cursorClause];
      }

      if (!isAdmin) {
        const accessConditions: any[] = [];
        if (fullAccessProjectIds.length > 0 && restrictedProjectIds.length > 0) {
          accessConditions.push({
            OR: [
              { projectId: { in: fullAccessProjectIds } },
              { projectId: { in: restrictedProjectIds }, assignee: { workspaceMember: { userId } } },
            ]
          });
        } else if (fullAccessProjectIds.length > 0) {
          accessConditions.push({ projectId: { in: fullAccessProjectIds } });
        } else if (restrictedProjectIds.length > 0) {
          accessConditions.push({ projectId: { in: restrictedProjectIds } });
          accessConditions.push({ assignee: { workspaceMember: { userId } } });
        }

        if (accessConditions.length > 0) {
          singleParentWhere.AND = [...(singleParentWhere.AND || []), ...accessConditions];
        }
      }

      const [rawTasks, parent] = await Promise.all([
        TaskRepository.findMany(
          singleParentWhere,
          { ...subtaskSelect, parentTaskId: true },
          undefined,
          pageSize + 1
        ),
        TaskRepository.findById(
          parentId,
          {
            ...(parentRelationSelect?.select || { id: true, name: true }),
            project: { select: { id: true, name: true, color: true } },
          }
        ),
      ]);

      const hasMore = rawTasks.length > pageSize;
      const finalTasks = (hasMore ? rawTasks.slice(0, pageSize) : rawTasks).map((t: any) => TasksService.mapToFlatMetadata(t));
      const nextCursor = hasMore && finalTasks.length > 0
        ? {
          id: finalTasks[finalTasks.length - 1].id,
          createdAt: finalTasks[finalTasks.length - 1].createdAt,
          position: finalTasks[finalTasks.length - 1].position
        }
        : undefined;
      return [{ parentTaskId: parentId, subTasks: finalTasks, totalCount: finalTasks.length, hasMore, nextCursor }];
    }

    // ── BATCH PATH ────────────────────────────────────────────────────────
    const batchSelect: any = { ...getTaskSelect("subtask", false, extraFields) };
    delete batchSelect._count;

    const rawSubTasksAll = (await TaskRepository.findMany(
      countWhere,
      { ...batchSelect, parentTaskId: true },
      undefined,
      TasksService.BATCH_HARD_LIMIT
    )) as any[];

    const subTasksMap = new Map<string, any[]>();
    const totalCountMap = new Map<string, number>();
    rawSubTasksAll.forEach((task: any) => {
      const pId = task.parentTaskId!;
      const currentCount = totalCountMap.get(pId) || 0;
      totalCountMap.set(pId, currentCount + 1);
      if (currentCount < pageSize) {
        if (!subTasksMap.has(pId)) subTasksMap.set(pId, []);
        subTasksMap.get(pId)!.push(TasksService.mapToFlatMetadata(task));
      }
    });

    const duration = performance.now() - startTime;
    if (duration > 150) logger.serverPerf("BATCH_SUBTASKS", duration, { count: parentTaskIds.length });

    return parentTaskIds.map(parentTaskId => {
      const subTasks = subTasksMap.get(parentTaskId) || [];
      const totalCount = totalCountMap.get(parentTaskId) || 0;
      const hasMore = totalCount > pageSize;
      const pagedSubTasks = hasMore ? subTasks.slice(0, pageSize) : subTasks;
      const nextCursor = hasMore && pagedSubTasks.length > 0
        ? {
          id: pagedSubTasks[pagedSubTasks.length - 1].id,
          createdAt: pagedSubTasks[pagedSubTasks.length - 1].createdAt,
          position: pagedSubTasks[pagedSubTasks.length - 1].position
        }
        : undefined;
      return { parentTaskId, subTasks: pagedSubTasks, totalCount, hasMore, nextCursor };
    });
  }

  /**
   * Batch subtask fetch with permission resolution.
   * Replaces exported `getSubTasksByParentIds` from src/data/task.
   */
  static async getSubTasksByParentIds(
    parentTaskIds: string[],
    workspaceId: string,
    projectId?: string,
    filters: Partial<import("@/types/task-filters").TaskFilters> = {},
    pageSize: number = 30,
    viewMode: string = "list",
    extraFields?: string[],
    userId?: string,
    skipPermissionsCheck: boolean = false,
    cursor?: any,
  ): Promise<BatchSubTasksResult> {
    try {
      if (parentTaskIds.length === 0) return [];
      const { isWorkspaceAdmin, fullAccessProjectIds, restrictedProjectIds, permissions } =
        await TasksService.resolveTaskPermissions(workspaceId, projectId, userId);
      if (!skipPermissionsCheck && !(permissions as any)?.workspaceMember) {
        throw new Error("User does not have access to this workspace");
      }
      const resolvedUserId = (permissions as any)?.userId || userId || "";
      return TasksService._getSubTasksByParentIdsInternal(
        parentTaskIds, workspaceId, projectId, resolvedUserId,
        isWorkspaceAdmin, fullAccessProjectIds, restrictedProjectIds,
        filters, pageSize, viewMode, extraFields, cursor,
      );
    } catch (error) {
      console.error("getSubTasksByParentIds failed", error);
      return parentTaskIds.map(parentTaskId => ({ parentTaskId, subTasks: [], totalCount: 0, hasMore: false }));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET TASK BY ID  (previously src/data/task/get-task-by-id.ts)
  // ─────────────────────────────────────────────────────────────────────────

  private static async _getTaskByIdInternal(
    taskId: string,
    userId: string,
    isMember: boolean,
  ) {
    const task = await TaskRepository.findTaskWithDetails(taskId, userId, isMember);
    if (!task) return null;
    if (isMember) {
      if (task.parentTaskId) {
        if (task.assignee?.workspaceMember?.userId !== userId) return null;
      } else {
        if (!task.subTasks || task.subTasks.length === 0) return null;
      }
    }
    return task;
  }

  /**
   * Get a single task by ID with RBAC.
   * Replaces exported `getTaskById` from src/data/task.
   */
  static async getTaskById(taskId: string, workspaceId: string, projectId: string, userId: string) {
    const { getUserPermissions } = await import("@/data/user/get-user-permissions");
    const permissions = await getUserPermissions(workspaceId, projectId, userId);
    if (!permissions.workspaceMemberId) return null;
    return TasksService._getTaskByIdInternal(taskId, userId, permissions.isMember);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET TASKS — cached RSC entry point (previously src/data/task/get-tasks.ts)
  // ─────────────────────────────────────────────────────────────────────────

  static async getTasks(opts: GetTasksOptions, userId: string) {
    return TasksService.listTasks(opts, userId);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MODULE-LEVEL TYPE EXPORTS
// Re-exported from src/data/task/index.ts shim for backwards compat.
// ─────────────────────────────────────────────────────────────────────────

export type BatchSubTasksResult = {
  parentTaskId: string;
  subTasks: any[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: any;
}[];

export type BatchSubTasksResponse = BatchSubTasksResult;
export type BatchSubTaskItem = BatchSubTasksResult[number];

export interface GetTasksOptions {
  workspaceId: string;
  projectId?: string;
  hierarchyMode?: "parents" | "children" | "all";
  groupBy?: "status";
  status?: string | string[];
  assigneeId?: string | string[];
  tagId?: string | string[];
  search?: string;
  dueAfter?: string | Date;
  dueBefore?: string | Date;
  startDate?: string | Date;
  endDate?: string | Date;
  filterParentTaskId?: string;
  onlyParents?: boolean;
  excludeParents?: boolean;
  onlySubtasks?: boolean;
  cursor?: import("@/lib/tasks/query-builder").TaskCursor;
  skip?: number;
  expandedProjectIds?: string[];
  limit?: number;
  includeSubTasks?: boolean;
  includeFacets?: boolean;
  view_mode?: "default" | "search" | "list" | "kanban" | "gantt" | "calendar";
  extraFields?: string[];
  sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
}

export type GetTasksResponse = Awaited<ReturnType<typeof TasksService.listTasks>>;
export type TaskByIdType = Awaited<ReturnType<typeof TasksService.getTaskById>>;

/**
 * Shape of task groups in Kanban view (grouped by status)
 */
export type SubTasksByStatusResponse = {
  tasks: import("@/types/task").WorkspaceTaskType[];
  totalCount: number;
  hasMore: boolean;
  currentPage?: number;
  nextCursor?: any;
};
