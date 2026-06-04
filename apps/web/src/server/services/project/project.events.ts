import { invalidateWorkspaceProjects, invalidateProjectTasks, invalidateProjectMembers, invalidateUserPermissions } from "@/lib/cache/invalidation";
import { broadcastProjectUpdate } from "@/lib/realtime";

export class ProjectEvents {
  static async onProjectCreated(workspaceId: string, project: any) {
    await invalidateWorkspaceProjects(workspaceId);
    await broadcastProjectUpdate({
      workspaceId,
      type: "CREATE",
      projectId: project.id,
      payload: {
        ...project,
        canManageMembers: true,
      }
    });
  }

  static async onProjectUpdated(workspaceId: string, projectId: string) {
    await invalidateWorkspaceProjects(workspaceId);
  }

  static async onProjectDeleted(workspaceId: string, projectId: string) {
    await Promise.all([
      invalidateWorkspaceProjects(workspaceId),
      invalidateProjectTasks(projectId),
    ]);
    await broadcastProjectUpdate({
      workspaceId,
      type: "DELETE",
      projectId,
    });
  }

  static async onMembersAdded(workspaceId: string, projectId: string, userIds: string[]) {
    await Promise.all([
      invalidateWorkspaceProjects(workspaceId),
      invalidateProjectMembers(projectId),
      ...userIds.map((userId) => invalidateUserPermissions(userId, workspaceId, projectId))
    ]);
  }

  static async onMembersRemoved(workspaceId: string, projectId: string, userIds: string[]) {
    await Promise.all([
      invalidateWorkspaceProjects(workspaceId),
      invalidateProjectMembers(projectId),
      ...userIds.map((userId) => invalidateUserPermissions(userId, workspaceId, projectId))
    ]);
  }

  static async onMemberRoleUpdated(workspaceId: string, projectId: string, userId: string) {
    await Promise.all([
      invalidateWorkspaceProjects(workspaceId),
      invalidateProjectMembers(projectId),
      invalidateUserPermissions(userId, workspaceId, projectId)
    ]);
  }

  static async onMemberAccessToggled(workspaceId: string, projectId: string, userId: string) {
    await Promise.all([
      invalidateWorkspaceProjects(workspaceId),
      invalidateProjectMembers(projectId),
      invalidateUserPermissions(userId, workspaceId, projectId)
    ]);
  }
}
