import { broadcastProjectUpdate } from "@/lib/realtime";
import { getPusher } from "@/lib/registry";

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

  static async onProjectUpdated(_workspaceId: string, _projectId: string) {}

  static async onProjectDeleted(workspaceId: string, projectId: string) {
    await broadcastProjectUpdate(getPusher(), {
      workspaceId,
      type: "DELETE",
      projectId,
    });
  }

  static async onMembersAdded(_workspaceId: string, _projectId: string, _userIds: string[]) {}

  static async onMembersRemoved(_workspaceId: string, _projectId: string, _userIds: string[]) {}

  static async onMemberRoleUpdated(_workspaceId: string, _projectId: string, _userId: string) {}

  static async onMemberAccessToggled(_workspaceId: string, _projectId: string, _userId: string) {}
}
