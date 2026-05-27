import "server-only";

import prisma from "@/lib/db";
import { WorkspaceRole, ProjectRole } from "@/generated/prisma";
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

  static async findById(taskId: string, selectOverride?: any) {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: selectOverride || { id: true, name: true, status: true, createdById: true, parentTaskId: true, projectId: true, taskSlug: true, subtaskCount: true },
    });
  }

  static async findBySlug(workspaceId: string, slug: string, select: any) {
    return prisma.task.findFirst({
      where: { workspaceId, taskSlug: slug },
      select,
    });
  }

  static async findBySlugOrId(workspaceId: string, slugOrId: string, select?: any) {
    return prisma.task.findFirst({
      where: {
        workspaceId,
        OR: [{ id: slugOrId }, { taskSlug: slugOrId }],
      },
      select: select || getTaskSelect("default"),
    });
  }

  static async findTaskProjectId(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });
    return task?.projectId || null;
  }

  static async findProjectId(taskId: string) {
    return this.findTaskProjectId(taskId);
  }

  static async findProjectSlug(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { slug: true },
    });
    return project?.slug || null;
  }

  static async findTaskBasic(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, name: true, status: true, createdById: true, parentTaskId: true, projectId: true, taskSlug: true, subtaskCount: true },
    });
  }

  static async findTaskWithDetails(taskId: string, userId: string, isMember: boolean) {
    return prisma.task.findUnique({
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

  static async create(data: any) {
    return prisma.task.create({
      data,
      include: {
        tags: { select: { id: true, name: true } },
        assignee: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } } } },
        reviewer: { select: { id: true, workspaceMember: { select: { userId: true, user: { select: { id: true, surname: true } } } } } },
      }
    });
  }

  static async createTask(data: any) {
    return this.create(data);
  }

  static async update(taskId: string, data: any) {
    return prisma.task.update({
      where: { id: taskId },
      data,
    });
  }

  static async updateTaskWithActivity(taskId: string, data: any, activityData: any) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data,
      });
      const commentActivity = await tx.activity.create({
        data: {
          subTaskId: taskId,
          ...activityData,
        },
      });
      return { updated, commentActivity };
    });
  }

  static async updateTaskAndParentCount(
    taskId: string,
    data: any,
    parentTaskId: string | null,
    wasCompleted: boolean,
    isNowCompleted: boolean
  ) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.update({
        where: { id: taskId },
        data,
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
    return prisma.task.update({
      where: { id: taskId },
      data: { startDate, dueDate, days },
    });
  }

  static async delete(taskId: string) {
    return prisma.task.delete({
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
    return prisma.$transaction(async (tx) => {
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
    newStatus: any,
    authorId: string,
    activityData: any,
    parentTaskId: string | null,
    wasCompleted: boolean,
    isNowCompleted: boolean
  ) {
    return prisma.$transaction(async (tx) => {
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
          attachment: activityData.attachment,
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

  static async createSubTask({ parentTaskId, taskData }: { parentTaskId: string; taskData: any }) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: taskData,
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

  static async bulkCreateTasks(tasks: any[]) {
    return prisma.$transaction(async (tx) => {
      const createdTasks = [];
      for (const t of tasks) {
        createdTasks.push(await tx.task.create({ data: t }));
      }
      return createdTasks;
    });
  }

  static async reorderSubtasks(parentTaskId: string, taskIds: string[]) {
    return prisma.$transaction(
      taskIds.map((id, index) =>
        prisma.task.update({
          where: { id, parentTaskId },
          data: { position: index },
        })
      )
    );
  }

  // ─── List & Relationships ──────────────────────────────────────────────────

  static async findMany(where: any, select?: any, sorts?: any, limit?: number, cursor?: any) {
    return prisma.task.findMany({
      where,
      select: select || undefined,
      orderBy: buildOrderBy(sorts, "list"),
      take: limit ? limit + 1 : undefined,
      cursor: cursor ? { id: cursor.id } : undefined,
      skip: cursor ? 1 : undefined,
    });
  }

  static async findTasksByIds(ids: string[], select?: any) {
    return prisma.task.findMany({
      where: { id: { in: ids } },
      select: select || { id: true, name: true, status: true, taskSlug: true },
    });
  }

  static async findFullTasksByIds(ids: string[]) {
    return prisma.task.findMany({
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
    return prisma.task.findUnique({
      where: { id: taskId },
      select: {
        Task_TaskDependency_A: { select: { id: true, name: true, status: true } },
        Task_TaskDependency_B: { select: { id: true, name: true, status: true } },
      },
    });
  }

  static async addDependency(taskId: string, dependsOnId: string) {
    return prisma.task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { connect: { id: dependsOnId } } },
    });
  }

  static async addDependencies(taskId: string, dependsOnIds: string[]) {
    return prisma.task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { connect: dependsOnIds.map(id => ({ id })) } },
    });
  }

  static async removeDependency(taskId: string, dependsOnId: string) {
    return prisma.task.update({
      where: { id: taskId },
      data: { Task_TaskDependency_A: { disconnect: { id: dependsOnId } } },
    });
  }

  static async findTaskWithDependencies(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: { Task_TaskDependency_A: { select: { id: true } } },
    });
  }

  static async findDependencyGraph(taskIds: string[]) {
    return prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true,
        Task_TaskDependency_A: { select: { id: true } },
        Task_TaskDependency_B: { select: { id: true } },
      },
    });
  }

  static async findSubtasksExpansion(where: any, select: any, orderBy: any, take: number) {
    return prisma.task.findMany({ where, select, orderBy, take });
  }

  static async findTasksByWhere(where: any, limit: number, select: any, orderBy: any) {
    return prisma.task.findMany({
      where,
      take: limit + 1,
      select,
      orderBy,
    });
  }

  static async findTasksByStatus(where: any, limit: number, select: any, orderBy: any) {
    return this.findTasksByWhere(where, limit, select, orderBy);
  }

  static async findTaskCount(where: any) {
    return prisma.task.count({ where });
  }

  static async countTasks(where: any) {
    return this.findTaskCount(where);
  }

  // ─── Member resolution ────────────────────────────────────────────────────

  static async findProjectMember(projectId: string, userId: string, workspaceId: string) {
    return prisma.projectMember.findFirst({
      where: { projectId, workspaceMember: { userId, workspaceId } },
      select: { id: true },
    });
  }

  static async findWorkspaceMember(userId: string, workspaceId: string) {
    return prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { id: true, workspaceRole: true },
    });
  }

  static async createProjectMember(data: any) {
    return prisma.projectMember.create({ data });
  }

  static async autoJoinAdmin(projectId: string, workspaceMemberId: string) {
    return prisma.projectMember.upsert({
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
    const member = await prisma.projectMember.findFirst({
      where: {
        projectId,
        workspaceMember: { userId, workspaceId },
      },
      select: { id: true },
    });
    return member?.id || null;
  }

  static async findProjectContext(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true, slug: true },
    });
  }

  static async findProjectMembersWithUsers(projectId: string) {
    return prisma.projectMember.findMany({
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
    return prisma.tag.findMany({
      where: { workspaceId },
      select: { id: true, name: true, requirePurchase: true },
    });
  }

  static async findLastParentPosition(projectId: string) {
    return prisma.task.findFirst({
      where: { projectId, parentTaskId: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
  }

  static async findLastSubtaskPosition(parentTaskId: string) {
    return prisma.task.findFirst({
      where: { parentTaskId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
  }

  static async findAssigneeRole(assigneeId: string) {
    return prisma.projectMember.findUnique({
      where: { id: assigneeId },
      select: { projectRole: true },
    });
  }

  static async findUserForActivity(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, surname: true },
    });
  }

  static async findTaskForCommentContext(workspaceId: string, slugOrId: string) {
    return prisma.task.findFirst({
      where: {
        workspaceId,
        OR: [{ id: slugOrId }, { taskSlug: slugOrId }],
      },
      select: { id: true, projectId: true, assigneeId: true, reviewerId: true },
    });
  }

  static async findInvolvedMembersForTask(workspaceId: string, projectId: string, assigneeId: string | null, reviewerId: string | null) {
    return prisma.projectMember.findMany({
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
        workspaceMember: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, name: true, surname: true, image: true, email: true } },
          },
        },
      },
    });
  }

  static async groupByStatus(where: any) {
    return prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
  }

  static async groupByAssignee(where: any) {
    return prisma.task.groupBy({
      by: ['assigneeId'],
      where,
      _count: { _all: true },
    });
  }

  static async groupByProjectId(where: any) {
    return prisma.task.groupBy({
      by: ['projectId'],
      where,
      _count: { id: true },
    });
  }

  static async findTasksForExpansion(where: any, select: any) {
    return prisma.task.findMany({
      where,
      select,
    });
  }
}
