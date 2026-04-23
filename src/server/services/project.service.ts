import prisma from "@/lib/db";
import { ProjectRole } from "@/generated/prisma";

export type ProjectMemberUI = {
  id: string; // userId
  userId: string;
  projectRole: ProjectRole;
  projectMemberId: string;
  user: {
    id: string;
    name: string | null;
    surname: string | null;
    email?: string;
    image?: string | null;
  };
  workspaceRole?: string;
};

export class ProjectService {
  /**
   * Get lightweight project metadata
   */
  static async getProjectMetadata(workspaceId: string, slug: string, userId: string) {
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
        OR: [{ slug }, { id: slug }]
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        workspaceId: true,
        workspace: {
          select: {
            members: {
              where: { userId },
              select: {
                id: true,
                workspaceRole: true,
              }
            }
          }
        },
        projectMembers: {
          where: { workspaceMember: { userId } },
          select: {
            projectRole: true
          }
        }
      }
    });

    if (!project || project.workspace.members.length === 0) {
      return null;
    }

    const workspaceMember = project.workspace.members[0];
    const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const projectMember = project.projectMembers[0];

    // Security check: Must be workspace admin or direct project member
    if (!isWorkspaceAdmin && !projectMember) {
      return null;
    }

    // Role display logic: Workspace OWNER/ADMIN override project roles
    let userRole = "";
    if (workspaceMember.workspaceRole === "OWNER") {
      userRole = "Owner";
    } else if (workspaceMember.workspaceRole === "ADMIN") {
      userRole = "Admin";
    } else if (projectMember) {
      userRole = projectMember.projectRole.split('_').map(word =>
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
   * Get project members
   */
  static async getMembers(projectId: string): Promise<ProjectMemberUI[]> {
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        projectRole: true,
        workspaceMember: {
          select: {
            userId: true,
            workspaceRole: true,
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                email: true,
                image: true,
              }
            }
          }
        }
      }
    });

    return projectMembers.map(m => ({
      id: m.workspaceMember.userId,
      userId: m.workspaceMember.userId,
      projectMemberId: m.id,
      projectRole: m.projectRole as ProjectRole,
      user: {
        ...m.workspaceMember.user,
        image: m.workspaceMember.user.image ?? null
      },
      workspaceRole: m.workspaceMember.workspaceRole
    }));
  }

  /**
   * Get project-level permissions for a user
   */
  static async getPermissions(workspaceId: string, projectId: string, userId: string) {
    const [workspaceMember, projectMember] = await Promise.all([
      prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
      }),
      prisma.projectMember.findFirst({
        where: {
          projectId,
          workspaceMember: { userId },
        },
      }),
    ]);

    if (!workspaceMember) {
      return {
        isWorkspaceAdmin: false,
        isProjectLead: false,
        isProjectManager: false,
        isMember: false,
        canCreateSubTask: false,
        canPerformBulkOperations: false,
        workspaceMemberId: null,
        workspaceRole: null,
        userId,
      };
    }

    const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const isProjectManager = projectMember?.projectRole === "PROJECT_MANAGER";
    const isProjectLead = projectMember?.projectRole === "LEAD";
    const isMember = !isWorkspaceAdmin && !isProjectManager && !isProjectLead && !!projectMember;
    const canCreateSubTask = isWorkspaceAdmin || isProjectManager || isProjectLead;
    const canPerformBulkOperations = isWorkspaceAdmin || isProjectManager || isProjectLead;

    return {
      isWorkspaceAdmin,
      isProjectManager,
      isProjectLead,
      isMember,
      canCreateSubTask,
      canPerformBulkOperations,
      workspaceMemberId: workspaceMember.id,
      workspaceRole: workspaceMember.workspaceRole,
      userId: workspaceMember.userId,
      projectMember: projectMember ? {
        id: projectMember.id,
        projectRole: projectMember.projectRole,
      } : null,
    };
  }

  /**
   * Aggregated Layout Data Fetch
   * Optimized for a single round-trip from the client's ProjectLayoutProvider
   */
  static async getProjectLayoutData(workspaceId: string, projectId: string, userId: string) {
    const { getWorkspaceTags } = await import("@/data/tag/get-tags");

    const [members, permissions, tags] = await Promise.all([
      this.getMembers(projectId),
      this.getPermissions(workspaceId, projectId, userId),
      getWorkspaceTags(workspaceId)
    ]);

    return {
      members,
      permissions,
      tags
    };
  }

  /**
   * Get available reviewers for a project
   */
  static async getProjectReviewers(projectId: string) {
    const members = await this.getMembers(projectId);
    // Filter for those who can actually review
    // Reviewers include: Project Manager, Lead (Project Roles)
    // AND Owner, Admin (Workspace Roles)
    return members
      .filter(m =>
        ["OWNER", "ADMIN"].includes(m.workspaceRole || "") ||
        ["LEAD", "PROJECT_MANAGER"].includes(m.projectRole)
      )
      .map(m => ({
        id: m.userId,
        surname: m.user.surname,
        role: (["OWNER", "ADMIN"].includes(m.workspaceRole || ""))
          ? (m.workspaceRole as string)
          : m.projectRole
      }));
  }
}
