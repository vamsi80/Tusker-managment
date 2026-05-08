import {
  ProjectListItem,
  ProjectRole,
  ProjectMemberUI,
  ProjectMember,
  FullProjectData
} from "@/types/project";

export class ProjectMapper {
  /**
   * Map database project to ProjectListItem for workspace list
   */
  static toProjectListItem(project: any, userId: string, isOwnerOrAdmin: boolean): ProjectListItem {
    const userProjectMember = project.projectMembers[0];
    const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
    const isCreator = project.createdBy === userId;

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color,
      canManageMembers: isOwnerOrAdmin || isProjectManager || isCreator,
      projectRole: userProjectMember?.projectRole as ProjectRole,
      createdAt: project.createdAt.toISOString(),
      projectManager: project.projectManager?.user ? {
        id: project.projectManager.user.id,
        surname: project.projectManager.user.surname
      } : undefined,
    };
  }

  /**
   * Map workspace member to a standard format for selection
   */
  static toWorkspaceMemberListItem(m: any) {
    return {
      id: m.id,
      userId: m.userId,
      workspaceRole: m.workspaceRole,
      designation: m.designation,
      name: m.user?.name,
      surname: m.user?.surname,
      email: m.user?.email,
    };
  }

  /**
   * Map database member to ProjectMemberUI
   */
  static toProjectMemberUI(m: any): ProjectMemberUI {
    return {
      id: m.workspaceMember.userId,
      userId: m.workspaceMember.userId,
      projectId: m.projectId,
      projectMemberId: m.id,
      projectRole: m.projectRole as ProjectRole,
      user: {
        ...m.workspaceMember.user,
        image: m.workspaceMember.user.image ?? null
      },
      workspaceRole: m.workspaceMember.workspaceRole
    };
  }

  /**
   * Map project metadata
   */
  static toProjectMetadata(project: any, userId: string) {
    const workspaceMember = project.workspace.members[0];
    const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const projectMember = project.projectMembers[0];

    let userRole = "";
    if (workspaceMember.workspaceRole === "OWNER") {
      userRole = "Owner";
    } else if (workspaceMember.workspaceRole === "ADMIN") {
      userRole = "Admin";
    } else if (projectMember) {
      userRole = projectMember.projectRole.split('_').map((word: string) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    }

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      color: project.color,
      workspaceId: project.workspaceId,
      userId,
      canPerformBulkOperations: isWorkspaceAdmin || (projectMember?.projectRole === "LEAD" || projectMember?.projectRole === "PROJECT_MANAGER"),
      userRole
    };
  }

  /**
   * Map to FullProjectData
   */
  static toFullProjectData(project: any, userId: string): FullProjectData {
    const projectMembers: ProjectMember[] = project.projectMembers.map((pm: any) => ({
      id: pm.id,
      userId: pm.workspaceMember.userId,
      userName: pm.workspaceMember.user?.surname || "Unknown",
      projectRole: pm.projectRole as ProjectRole,
      hasAccess: pm.hasAccess,
    }));

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      slug: project.slug,
      color: project.color,
      workspaceId: project.workspaceId,
      projectManagerId: project.projectManagerId,
      projectManager: project.projectManager?.user ? {
        id: project.projectManager.user.id,
        surname: project.projectManager.user.surname,
      } : undefined,
      memberAccess: project.projectMembers.map((pm: any) => pm.workspaceMember.userId),
      projectMembers,
      companyName: project.clint[0]?.name || null,
      registeredCompanyName: project.clint[0]?.registeredCompanyName || null,
      directorName: project.clint[0]?.directorName || null,
      address: project.clint[0]?.address || null,
      gstNumber: project.clint[0]?.gstNumber || null,
      contactPerson: project.clint[0]?.clintMembers[0]?.name || null,
      phoneNumber: project.clint[0]?.clintMembers[0]?.phoneNumber || null,
    };
  }

  /**
   * Map database permissions
   */
  static toPermissions(workspaceMember: any, projectMember: any) {
    const isWAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const isPManager = isWAdmin || projectMember?.projectRole === "PROJECT_MANAGER";
    const isPLead = isWAdmin || projectMember?.projectRole === "LEAD";
    const isMem = !isWAdmin && !isPManager && !isPLead && !!projectMember;

    return {
      isWorkspaceAdmin: isWAdmin,
      isProjectManager: isPManager,
      isProjectLead: isPLead,
      isMember: isMem,
      canCreateSubTask: isWAdmin || isPManager || isPLead,
      canPerformBulkOperations: isWAdmin || isPManager || isPLead,
      workspaceMemberId: workspaceMember.id,
      workspaceRole: workspaceMember.workspaceRole,
      userId: workspaceMember.userId,
      userSurname: workspaceMember.user?.surname || null,
      projectMember: projectMember ? { id: projectMember.id, projectRole: projectMember.projectRole } : null,
    };
  }
}
