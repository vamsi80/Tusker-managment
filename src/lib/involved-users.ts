import prisma from "./db";

/**
 * Fetches all unique User IDs involved in a task.
 * Involved users include:
 * - Task Creator
 * - Task Assignee
 * - Task Reviewer
 * - All unique commenters on the task
 * 
 * @param taskId - ID of the task or subtask
 * @returns Array of unique User IDs
 */
/**
 * Fetches all unique User IDs involved in a task.
 * Involved users include:
 * - Workspace Owners and Admins
 * - Project Managers
 * - Task Creator, Assignee, Reviewer
 * - All unique commenters on the task
 * 
 * @param taskId - ID of the task or subtask
 * @returns Array of unique User IDs
 */
export async function getTaskInvolvedUserIds(taskId: string): Promise<string[]> {
  try {
    // 1. Fetch Task details including participants and workspace/project context
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        createdById: true,
        assigneeId: true,
        reviewerId: true,
        projectId: true,
        project: {
          select: {
            workspaceId: true,
          },
        },
        comments: {
          select: {
            userId: true,
          },
          where: {
            isDeleted: false,
          },
        },
      },
    });

    if (!task) return [];

    const involvedUserIds = new Set<string>();
    const workspaceId = task.project.workspaceId;
    const projectId = task.projectId;

    // 2. Add individual commenters
    task.comments.forEach(c => involvedUserIds.add(c.userId));

    // 3. Add Workspace Owners and Admins
    const workspaceAuthorities = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        workspaceRole: { in: ["OWNER", "ADMIN", "MANAGER"] },
      },
      select: { userId: true },
    });
    workspaceAuthorities.forEach(m => involvedUserIds.add(m.userId));

    // 4. Add Project Managers
    const projectManagers = await prisma.projectMember.findMany({
      where: {
        projectId,
        projectRole: { in: ["PROJECT_MANAGER", "LEAD"] },
      },
      select: {
        workspaceMember: {
          select: { userId: true },
        },
      },
    });
    projectManagers.forEach(m => {
      if (m.workspaceMember?.userId) {
        involvedUserIds.add(m.workspaceMember.userId);
      }
    });

    // 5. Add Task participants (Creator, Assignee, Reviewer)
    const projectMemberIds = [
      task.createdById,
      task.assigneeId,
      task.reviewerId,
    ].filter((id): id is string => !!id);

    if (projectMemberIds.length > 0) {
      const participants = await prisma.projectMember.findMany({
        where: { id: { in: projectMemberIds } },
        select: {
          workspaceMember: {
            select: { userId: true },
          },
        },
      });

      participants.forEach(m => {
        if (m.workspaceMember?.userId) {
          involvedUserIds.add(m.workspaceMember.userId);
        }
      });
    }

    return Array.from(involvedUserIds);
  } catch (error) {
    console.error(`[GET_INVOLVED_USERS_ERROR] Failed for task ${taskId}:`, error);
    return [];
  }
}
