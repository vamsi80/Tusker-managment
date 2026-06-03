import { broadcastProjectUpdate } from "@/lib/realtime";
import { getPusher } from "@/lib/registry";
import { invalidateProjectTasks, invalidateProjectMembers } from "@/lib/cache/invalidation";

export class ProjectEvents {
  static async onProjectCreated(workspaceId: string, project: any) {
    await broadcastProjectUpdate(getPusher(), {
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
  }

  static async onProjectDeleted(workspaceId: string, projectId: string) {
    await Promise.all([
      invalidateProjectTasks(projectId),
    ]);
    await broadcastProjectUpdate(getPusher(), {
      workspaceId,
      type: "DELETE",
      projectId,
    });
  }

  static async onMembersAdded(workspaceId: string, projectId: string, userIds: string[]) {
    await Promise.all([
      invalidateProjectMembers(projectId),
    ]);
  }

  static async onMembersRemoved(workspaceId: string, projectId: string, userIds: string[]) {
    await Promise.all([
      invalidateProjectMembers(projectId),
    ]);
  }

  static async onMemberRoleUpdated(workspaceId: string, projectId: string, userId: string) {
    await Promise.all([
      invalidateProjectMembers(projectId),
    ]);
  }

  static async onMemberAccessToggled(workspaceId: string, projectId: string, userId: string) {
    await Promise.all([
      invalidateProjectMembers(projectId),
    ]);
  }
}
