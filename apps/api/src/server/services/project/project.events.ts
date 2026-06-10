import { broadcastProjectUpdate, broadcastTeamUpdate } from "@/lib/realtime";

export class ProjectEvents {
  static async onProjectCreated(workspaceId: string, project: any) {
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
    await broadcastProjectUpdate({
      workspaceId,
      type: "UPDATE",
      projectId,
    });
  }

  static async onProjectDeleted(workspaceId: string, projectId: string) {
    await broadcastProjectUpdate({
      workspaceId,
      type: "DELETE",
      projectId,
    });
  }

  static async onMembersAdded(workspaceId: string, projectId: string, userIds: string[]) {
    await broadcastTeamUpdate({
      workspaceId,
      type: "UPDATE",
      payload: { projectId, action: "MEMBERS_ADDED", userIds },
    });
  }

  static async onMembersRemoved(workspaceId: string, projectId: string, userIds: string[]) {
    await broadcastTeamUpdate({
      workspaceId,
      type: "UPDATE",
      payload: { projectId, action: "MEMBERS_REMOVED", userIds },
    });
  }

  static async onMemberRoleUpdated(workspaceId: string, projectId: string, userId: string) {
    await broadcastTeamUpdate({
      workspaceId,
      type: "UPDATE",
      payload: { projectId, action: "MEMBER_ROLE_UPDATED", userId },
    });
  }

  static async onMemberAccessToggled(workspaceId: string, projectId: string, userId: string) {
    await broadcastTeamUpdate({
      workspaceId,
      type: "UPDATE",
      payload: { projectId, action: "MEMBER_ACCESS_TOGGLED", userId },
    });
  }
}
