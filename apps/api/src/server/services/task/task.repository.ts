
import { getDb } from "@/lib/registry";
import { WorkspaceRole, ProjectRole, Prisma, TaskStatus } from "@/generated/prisma";
import {
  getTaskSelect,
  buildOrderBy,
} from "@/lib/tasks/query-builder";

/**
 * TaskRepository — all raw Prisma queries for the task domain.
 * No business logic. No permission checks. No event firing.
 */
export class TaskRepository {
  // ─── Single Record ────────────────────────────────────────────────────────

  static async findById(taskId: string, selectOverride?: Prisma.TaskSelect) {
    return getDb().task.findUnique({
      where: { id: taskId },
      select: selectOverride || { id: true, name: true, status: true, createdById: true, parentTaskId: true, projectId: true, taskSlug: true, subtaskCount: true },
    });
  }

  static async findBySlug(workspaceId: string, slug: string, select: Prisma.TaskSelect) {
    return getDb().task.findFirst({
      where: { workspaceId, taskSlug: slug },
      select,
    });
  }

  static async findBySlugOrId(workspaceId: string, slugOrId: string, select?: Prisma.TaskSelect) {
    return getDb().task.findFirst({
      where: {
        workspaceId,
        OR: [{ id: slugOrId }, { taskSlug: slugOrId }],
      },
      select: select || getTaskSelect("default"),
    });
  }

  static async findTaskProjectId(taskId: string) {
    const task = await getDb().task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    return task?.projectId || null;
  }

  static async findProjectId(taskId: string) {
    return this.findTaskProjectId(taskId);
  }

  static async findProjectSlug(projectId: string) {
    const project = await getDb().project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    return project?.slug || null;
  }

  static async findTaskBasic(taskId: string) {
    return getDb().task.findUnique({
      where: { id: taskId },
      select: { id: true, name: true, status: true, createdById: true, parentTaskId: true, projectId: true, taskSlug: true, subtaskCount: true },
    });
  }

  static async findTaskWithDetails(taskId: string, userId: string, isMember: boolean) {
    return getDb().task.findUnique({
      where: { id: taskId },
      select: {
        id: true, name: true, taskSlug: true, description: true, status: true,
        startDate: true, dueDate: true, days: true, projectId: true,
        workspaceId: true, parentTaskId: true, reviewerId: true, createdAt: true, updatedAt: true,
        tags: { select: { id: true, name: true } },
        reviewer: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, name: true, surname: true } } } } } },
        createdBy: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, name: true, surname: true } } } } } },
        assignee: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, name: true, surname: true } } } } } },
        project: { select: { id: true, name: true, color: true } },
        parentTask: { select: { id: true, name: true } },
        subTasks: isMember
          ? { where: { assignee: { workspaceMember: { userId } } }, select: { id: true, name: true, taskSlug: true, description: true, status: true, startDate: true, days: true, tags: { select: { id: true, name: true } }, assignee: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { surname: true } } } } } }, _count: { select: { activities: true } } } }
          : { select: { id: true, name: true, taskSlug: true, description: true, status: true, startDate: true, days: true, tags: { select: { id: true, name: true } }, assignee: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { surname: true } } } } } }, _count: { select: { activities: true } } } },
        _count: {
          select: {
            subTasks: isMember ? { where: { assignee: { workspaceMember: { userId } } } } : true,
            activities: true,
          },
        },
      },
    });
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  static async create(data: Prisma.TaskCreateInput | Prisma.TaskUncheckedCreateInput) {
    return getDb().task.create({
      data: data as any,
      include: {
        tags: { select: { id: true, name: true } },
        assignee: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } } } },
        reviewer: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } } } },
      }
    });
  }

  static async createTask(data: Prisma.TaskCreateInput | Prisma.TaskUncheckedCreateInput) {
    return this.create(data);
  }

  static async update(taskId: string, data: Prisma.TaskUpdateInput | Prisma.TaskUncheckedUpdateInput) {
    return getDb().task.update({
      where: { id: taskId },
      data: data as any,
    });
  }

  static async updateTaskWithActivity(taskId: string, data: Prisma.TaskUpdateInput | Prisma.TaskUncheckedUpdateInput, activityData: Record<string, unknown>) {
    return getDb().$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: data as any,
      });
      const commentActivity = await tx.activity.create({
        data: {
          subTaskId: taskId,
          ...(activityData as unknown as Prisma.ActivityUncheckedCreateWithoutSubTaskInput),
        },
      });
      return { updated, commentActivity };
    });
  }

  static async updateTaskAndParentCount(
    taskId: string,
    data: Prisma.TaskUpdateInput | Prisma.TaskUncheckedUpdateInput,
    parentTaskId: string | null,
    wasCompleted: boolean,
    isNowCompleted: boolean
  ) {
    return getDb().$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: data as any,
      });
      if (parentTaskId) {
        if (!wasCompleted && isNowCompleted) {
          await tx.task.update({
            where: { id: parentTaskId },
            data: { completedSubtaskCount: { increment: 1 } },
          });
        } else if (wasCompleted && !isNowCompleted) {
          await tx.task.update({
            where: { id: parentTaskId },
            data: { completedSubtaskCount: { decrement: 1 } },
          });
        }
      }
      return task;
    });
  }

  static async updateDates(taskId: string, startDate: Date | null, dueDate: Date | null, days: number | null) {
    return getDb().task.update({
      where: { id: taskId },
      data: { startDate, dueDate, days },
    });
  }

  static async delete(taskId: string) {
    return getDb().task.delete({
      where: { id: taskId },
    });
  }

  static async deleteTask({
    taskId,
    parentTaskId,
    projectId,
    position,
    wasCompleted
  }: {
    taskId: string;
    parentTaskId?: string | null;
    projectId: string;
    position: number;
    wasCompleted?: boolean;
  }) {
    return getDb().$transaction(async (tx) => {
      // 1. Delete the task
      const task = await tx.task.delete({
        where: { id: taskId },
      });

      if (parentTaskId) {
        await tx.task.update({
          where: { id: parentTaskId },
          data: { 
            subtaskCount: { decrement: 1 },
            ...(wasCompleted ? { completedSubtaskCount: { decrement: 1 } } : {})
          },
        });
      }

      // 3. Shift positions of subsequent tasks
      if (parentTaskId) {
        // Shift subtasks of the same parent
        await tx.task.updateMany({
          where: {
            parentTaskId,
            position: { gt: position },
          },
          data: {
            position: { decrement: 1 },
          },
        });
      } else {
        // Shift parent tasks in the same project
        await tx.task.updateMany({
          where: {
            projectId,
            parentTaskId: null,
            position: { gt: position },
          },
          data: {
            position: { decrement: 1 },
          },
        });
      }

      return task;
    });
  }

  static async updateStatus(
    taskId: string,
    newStatus: TaskStatus,
    authorId: string,
    activityData: {
      authorId: string;
      workspaceId: string;
      text: string;
      attachment?: Prisma.InputJsonValue | null;
    },
    parentTaskId: string | null,
    wasCompleted: boolean,
    isNowCompleted: boolean
  ) {
    return getDb().$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data: { status: newStatus },
      });

      await tx.activity.create({
        data: {
          subTaskId: taskId,
          authorId: activityData.authorId,
          workspaceId: activityData.workspaceId,
          text: activityData.text,
          attachment: activityData.attachment || Prisma.DbNull,
        },
      });

      if (parentTaskId) {
        if (!wasCompleted && isNowCompleted) {
          await tx.task.update({
            where: { id: parentTaskId },
            data: { completedSubtaskCount: { increment: 1 } },
          });
        } else if (wasCompleted && !isNowCompleted) {
          await tx.task.update({
            where: { id: parentTaskId },
            data: { completedSubtaskCount: { decrement: 1 } },
          });
        }
      }

      return task;
    });
  }

  static async createSubTask({ parentTaskId, taskData }: { parentTaskId: string; taskData: Prisma.TaskCreateInput | Prisma.TaskUncheckedCreateInput }) {
    return getDb().$transaction(async (tx) => {
      const task = await tx.task.create({
        data: taskData as any,
        include: {
          tags: {
            select: { id: true, name: true }
          },
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
          }
        }
      });
      await tx.task.update({
        where: { id: parentTaskId },
        data: { 
          isParent: true,
          subtaskCount: { increment: 1 },
          ...(taskData.status === "COMPLETED" ? { completedSubtaskCount: { increment: 1 } } : {})
        },
      });
      return task;
    });
  }

  static async bulkCreateTasks(tasks: Prisma.TaskCreateInput[]) {
    return getDb().$transaction(async (tx) => {
      const createdTasks = [];
      for (const t of tasks) {
        createdTasks.push(await tx.task.create({ data: t }));
      }
      return createdTasks;
    });
  }

  static async reorderSubtasks(parentTaskId: string, taskIds: string[]) {
    return getDb().$transaction(
      taskIds.map((id, index) =>
        getDb().task.update({
          where: { id, parentTaskId },
          data: { position: index },
        })
      )
    );
  }

  // ─── List & Relationships ──────────────────────────────────────────────────

  static async findMany(
    where: Prisma.TaskWhereInput,
    select?: Prisma.TaskSelect,
    sorts?: Array<{ field: string; direction: "asc" | "desc" }>,
    limit?: number,
    cursor?: { id: string } | null,
    viewMode?: string,
    projectId?: string
  ) {
    return getDb().task.findMany({
      where,
      select: select || undefined,
      orderBy: buildOrderBy(sorts, viewMode || "list", projectId),
      take: limit ? limit + 1 : undefined,
      cursor: cursor ? { id: cursor.id } : undefined,
      skip: cursor ? 1 : undefined,
    });
  }

  static async findTasksByIds(ids: string[], select?: Prisma.TaskSelect) {
    return getDb().task.findMany({
      where: { id: { in: ids } },
      select: select || { id: true, name: true, status: true, taskSlug: true },
    });
  }

  static async findFullTasksByIds(ids: string[]) {
    return getDb().task.findMany({
      where: { id: { in: ids } },
      include: {
        assignee: { include: { workspaceMember: { include: { user: true } } } },
        reviewer: { include: { workspaceMember: { include: { user: true } } } },
        tags: true,
        _count: { select: { subTasks: true } },
      },
    });
  }

  static async findDependencies(taskId: string) {
    return getDb().task.findUnique({
      where: { id: taskId },
      select: {
        Task_TaskDependency_A: { select: { id: true, name: true, status: true } },
        Task_TaskDependency_B: { select: { id: true, name: true, status: true } },
      },
    });
  }

  static async addDependency(taskId: string, dependsOnId: string) {
    return getDb().task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { connect: { id: dependsOnId } } },
    });
  }

  static async addDependencies(taskId: string, dependsOnIds: string[]) {
    return getDb().task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { connect: dependsOnIds.map(id => ({ id })) } },
    });
  }

  static async removeDependency(taskId: string, dependsOnId: string) {
    return getDb().task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { disconnect: { id: dependsOnId } } },
    });
  }

  static async findTaskWithDependencies(taskId: string) {
    return getDb().task.findUnique({
      where: { id: taskId },
      select: { Task_TaskDependency_A: { select: { id: true } } },
    });
  }

  static async findDependencyGraph(taskIds: string[]) {
    return getDb().task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        Task_TaskDependency_A: { select: { id: true } },
        Task_TaskDependency_B: { select: { id: true } },
      },
    });
  }

  static async findSubtasksExpansion(
    where: Prisma.TaskWhereInput,
    select: Prisma.TaskSelect,
    orderBy: Prisma.TaskOrderByWithRelationInput | Prisma.TaskOrderByWithRelationInput[],
    take: number
  ) {
    return getDb().task.findMany({ where, select, orderBy, take });
  }

  static async findTasksByWhere(
    where: Prisma.TaskWhereInput,
    limit: number,
    select: Prisma.TaskSelect,
    orderBy: Prisma.TaskOrderByWithRelationInput | Prisma.TaskOrderByWithRelationInput[]
  ) {
    return getDb().task.findMany({
      where,
      take: limit + 1,
      select,
      orderBy,
    });
  }

  static async findTasksByStatus(
    where: Prisma.TaskWhereInput,
    limit: number,
    select: Prisma.TaskSelect,
    orderBy: Prisma.TaskOrderByWithRelationInput | Prisma.TaskOrderByWithRelationInput[]
  ) {
    return this.findTasksByWhere(where, limit, select, orderBy);
  }

  static async findTaskCount(where: Prisma.TaskWhereInput) {
    return getDb().task.count({ where });
  }

  static async countTasks(where: Prisma.TaskWhereInput) {
    return this.findTaskCount(where);
  }

  // ─── Member resolution ────────────────────────────────────────────────────

  static async findProjectMember(projectId: string, userId: string, workspaceId: string) {
    return getDb().projectMember.findFirst({
      where: { projectId, workspaceMember: { userId, workspaceId } },
      select: { id: true },
    });
  }

  static async findWorkspaceMember(userId: string, workspaceId: string) {
    return getDb().workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true, workspaceRole: true },
    });
  }

  static async createProjectMember(data: Prisma.ProjectMemberCreateInput | Prisma.ProjectMemberUncheckedCreateInput) {
    return getDb().projectMember.create({ data: data as any });
  }

  static async autoJoinAdmin(projectId: string, workspaceMemberId: string) {
    return getDb().projectMember.upsert({
      where: {
        workspaceMemberId_projectId: {
          workspaceMemberId,
          projectId
        }
      },
      update: {},
      create: {
        projectId,
        workspaceMemberId,
        projectRole: ProjectRole.MEMBER,
        hasAccess: true
      }
    });
  }

  static async findProjectMemberId(userId: string, projectId: string, workspaceId: string) {
    const member = await getDb().projectMember.findFirst({
      where: {
        projectId,
        workspaceMember: { userId, workspaceId },
      },
      select: { id: true },
    });
    return member?.id || null;
  }

  static async findProjectContext(projectId: string) {
    return getDb().project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, slug: true },
    });
  }

  static async findProjectMembersWithUsers(projectId: string) {
    return getDb().projectMember.findMany({
      where: { projectId },
      include: {
        workspaceMember: {
          include: {
            user: { select: { email: true, id: true, surname: true } },
          },
        },
      },
    });
  }

  static async findWorkspaceTags(workspaceId: string) {
    return getDb().tag.findMany({
      where: { workspaceId },
      select: { id: true, name: true, requirePurchase: true },
    });
  }

  static async findLastParentPosition(projectId: string) {
    return getDb().task.findFirst({
      where: { projectId, parentTaskId: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
  }

  static async findLastSubtaskPosition(parentTaskId: string) {
    return getDb().task.findFirst({
      where: { parentTaskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
  }

  static async findAssigneeRole(assigneeId: string) {
    return getDb().projectMember.findUnique({
      where: { id: assigneeId },
      select: { projectRole: true },
    });
  }

  static async findUserForActivity(userId: string) {
    return getDb().user.findUnique({
      where: { id: userId },
      select: { name: true, surname: true },
    });
  }

  static async findTaskForCommentContext(workspaceId: string, slugOrId: string) {
    return getDb().task.findFirst({
      where: {
        workspaceId,
        OR: [{ id: slugOrId }, { taskSlug: slugOrId }],
      },
      select: { id: true, projectId: true, assigneeId: true, reviewerId: true },
    });
  }

  static async findInvolvedMembersForTask(workspaceId: string, projectId: string, assigneeId: string | null, reviewerId: string | null) {
    return getDb().projectMember.findMany({
      where: {
        projectId,
        OR: [
          { projectRole: ProjectRole.PROJECT_MANAGER },
          { projectRole: ProjectRole.PROJECT_COORDINATOR },
          { workspaceMember: { workspaceRole: WorkspaceRole.ADMIN } },
          assigneeId ? { id: assigneeId } : {},
          reviewerId ? { id: reviewerId } : {},
        ].filter((condition) => Object.keys(condition).length > 0),
      },
      select: {
        id: true,
        projectRole: true,
        workspaceMember: {
          select: {
            id: true,
            userId: true,
            workspaceRole: true,
            user: { select: { id: true, name: true, surname: true, image: true, email: true } },
          },
        },
      },
    });
  }

  static async groupByStatus(where: Prisma.TaskWhereInput) {
    return getDb().task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  static async groupByAssignee(where: Prisma.TaskWhereInput) {
    return getDb().task.groupBy({
      by: ['assigneeId'],
      where,
      _count: { _all: true },
    });
  }

  static async groupByProjectId(where: Prisma.TaskWhereInput) {
    return getDb().task.groupBy({
      by: ['projectId'],
      where,
      _count: { id: true },
    });
  }

  static async findTasksForExpansion(where: Prisma.TaskWhereInput, select: Prisma.TaskSelect) {
    return getDb().task.findMany({
      where,
      select,
    });
  }
}
