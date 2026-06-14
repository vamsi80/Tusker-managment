import {
  ProjectListItem,
  ProjectRole,
  ProjectMemberUI,
  ProjectMember,
  FullProjectData
} from "@/types/project";

export interface DBWorkspaceMemberPermissionsInput {
  id: string;
  userId: string;
  workspaceRole: string;
  designation?: string | null;
  user?: {
    id: string;
    name?: string | null;
    surname?: string | null;
    email?: string | null;
  } | null;
}

export interface DBProjectMemberPermissionsInput {
  id: string;
  projectId?: string;
  projectRole: string;
  hasAccess?: boolean;
  workspaceMember?: {
    userId: string;
    workspaceRole: string;
    user: {
      id: string;
      name?: string | null;
      surname?: string | null;
      email?: string | null;
      image?: string | null;
    };
  };
}

export interface DBProjectListItemInput {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  createdAt: Date;
  createdBy: string | null;
  projectMembers: Array<{
    projectRole: string;
  }>;
  projectManager?: {
    user?: {
      id: string;
      surname: string;
    } | null;
  } | null;
}

export interface DBProjectMetadataInput {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  workspaceId: string;
  workspace: {
    members: Array<{
      workspaceRole: string;
    }>;
  };
  projectMembers: Array<{
    projectRole: string;
  }>;
}

export interface DBFullProjectDataInput {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  color: string | null;
  workspaceId: string;
  projectManagerId: string | null;
  projectManager?: {
    user?: {
      id: string;
      surname: string;
    } | null;
  } | null;
  projectMembers: Array<{
    id: string;
    projectRole: string;
    hasAccess: boolean;
    workspaceMemberId: string;
    workspaceMember: {
      userId: string;
      user?: {
        surname: string | null;
      } | null;
    };
  }>;
  clint?: {
    name?: string | null;
    registeredCompanyName?: string | null;
    directorName?: string | null;
    address?: string | null;
    gstNumber?: string | null;
    clintMembers?: Array<{
      name?: string | null;
      phoneNumber?: string | null;
    }> | null;
  } | null;
  tags?: Array<{
    id: string;
  }> | null;
}

export class ProjectMapper {
  /**
   * Map database project to ProjectListItem for workspace list
   */
  static toProjectListItem(project: DBProjectListItemInput, userId: string, isOwnerOrAdmin: boolean): ProjectListItem {
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
  static toWorkspaceMemberListItem(m: DBWorkspaceMemberPermissionsInput) {
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
  static toProjectMemberUI(m: DBProjectMemberPermissionsInput): ProjectMemberUI {
    if (!m.workspaceMember) {
      throw new Error("workspaceMember is required for mapping project member UI");
    }
    return {
      id: m.workspaceMember.userId,
      userId: m.workspaceMember.userId,
      projectId: m.projectId || "",
      projectMemberId: m.id,
      projectRole: m.projectRole as ProjectRole,
      user: {
        id: m.workspaceMember.user.id,
        name: m.workspaceMember.user.name || "",
        surname: m.workspaceMember.user.surname || "",
        email: m.workspaceMember.user.email || "",
        image: m.workspaceMember.user.image || null,
      },
      workspaceRole: m.workspaceMember.workspaceRole
    };
  }

  /**
   * Map project metadata
   */
  static toProjectMetadata(project: DBProjectMetadataInput, userId: string) {
    const workspaceMember = project.workspace.members[0];
    if (!workspaceMember) {
      throw new Error("Workspace member is required for project metadata mapping");
    }
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
      canPerformBulkOperations: isWorkspaceAdmin || (projectMember?.projectRole === "LEAD" || projectMember?.projectRole === "PROJECT_MANAGER" || projectMember?.projectRole === "PROJECT_COORDINATOR"),
      userRole
    };
  }

  /**
   * Map to FullProjectData
   */
  static toFullProjectData(project: DBFullProjectDataInput, userId: string): FullProjectData {
    const projectMembers: ProjectMember[] = project.projectMembers.map((pm) => ({
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
      memberAccess: project.projectMembers.map((pm) => pm.workspaceMemberId),
      projectMembers,
      companyName: project.clint?.name || null,
      registeredCompanyName: project.clint?.registeredCompanyName || null,
      directorName: project.clint?.directorName || null,
      address: project.clint?.address || null,
      gstNumber: project.clint?.gstNumber || null,
      contactPerson: project.clint?.clintMembers?.[0]?.name || null,
      phoneNumber: project.clint?.clintMembers?.[0]?.phoneNumber || null,
      tagIds: project.tags?.map((t) => t.id) || [],
    };
  }

  /**
   * Map database permissions
   */
  static toPermissions(workspaceMember: DBWorkspaceMemberPermissionsInput, projectMember: DBProjectMemberPermissionsInput | null | undefined) {
    const isWAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const isPManager = isWAdmin || projectMember?.projectRole === "PROJECT_MANAGER";
    const isCoordinator = !isWAdmin && projectMember?.projectRole === "PROJECT_COORDINATOR";
    const isPLead = isWAdmin || projectMember?.projectRole === "LEAD";
    const isMem = !isWAdmin && !isPManager && !isCoordinator && !isPLead && !!projectMember;

    return {
      isWorkspaceAdmin: isWAdmin,
      isProjectManager: isPManager,
      isProjectCoordinator: isCoordinator,
      isProjectLead: isPLead,
      isMember: isMem,
      canCreateSubTask: isWAdmin || isPManager || isCoordinator || isPLead,
      canPerformBulkOperations: isWAdmin || isPManager || isCoordinator || isPLead,
      workspaceMemberId: workspaceMember.id,
      workspaceRole: workspaceMember.workspaceRole,
      userId: workspaceMember.userId,
      userSurname: workspaceMember.user?.surname || null,
      projectMember: projectMember ? { id: projectMember.id, projectRole: projectMember.projectRole } : null,
    };
  }
}
