import { AppError } from "@/lib/errors/app-error";
import { ProjectRole as PrismaProjectRole } from "@/generated/prisma";
import {
  MinimalProjectData,
  ProjectListItem,
  FullProjectData,
  ProjectRole,
  ProjectMemberUI
} from "@/types/project";
import { ProjectRepository } from "./project.repository";
import { ProjectEvents } from "./project.events";
import { ProjectMapper } from "./project.mapper";
import { projectSchema, editProjectSchema, ProjectSchemaType, EditProjectSchemaType } from "@/lib/zodSchemas";
import { hasWorkspacePermission } from "@/lib/constants/workspace-access";
import { isProjectAdmin } from "@/lib/constants/project-access";
import { getUniqueRandomColor } from "@/lib/colors/project-colors";
import prisma from "@/lib/db";

export class ProjectService {
  /**
   * Get all projects in a workspace for a specific user
   */
  static async getWorkspaceProjects(workspaceId: string, userId: string): Promise<ProjectListItem[]> {
    const workspaceMember = await ProjectRepository.getWorkspaceMember(workspaceId, userId);
    if (!workspaceMember) return [];

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const isManager = workspaceMember.workspaceRole === "MANAGER";

    const projectSelect = {
      id: true,
      name: true,
      slug: true,
      color: true,
      createdBy: true,
      createdAt: true,
      projectMembers: {
        where: { workspaceMember: { userId } },
        select: { projectRole: true }
      }
    } as const;

    let where: any = {};
    if (!isOwnerOrAdmin) {
      if (isManager) {
        where = {
          OR: [
            { createdBy: userId },
            { projectMembers: { some: { workspaceMember: { userId }, hasAccess: true } } },
          ],
        };
      } else {
        where = {
          projectMembers: { some: { workspaceMember: { userId }, hasAccess: true } },
        };
      }
    }

    const projects = await ProjectRepository.getWorkspaceProjects(workspaceId, projectSelect, where);

    return projects.map(project => ProjectMapper.toProjectListItem(project, userId, isOwnerOrAdmin));
  }

  /**
   * Lightweight version for sidebar/layout
   */
  static async getMinimalWorkspaceProjects(workspaceId: string, userId: string): Promise<MinimalProjectData[]> {
    const workspaceMember = await ProjectRepository.getWorkspaceMember(workspaceId, userId);
    if (!workspaceMember) return [];

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";

    const where: any = {};
    if (!isOwnerOrAdmin) {
      where.OR = [
        { createdBy: userId },
        { projectMembers: { some: { workspaceMember: { userId }, hasAccess: true } } },
      ];
    }

    const select = { id: true, name: true, slug: true, color: true };
    return ProjectRepository.getWorkspaceProjects(workspaceId, select, where) as unknown as Promise<MinimalProjectData[]>;
  }

  /**
   * Get all workspace members (for project lead/manager selection)
   */
  static async getWorkspaceMembers(workspaceId: string) {
    const members = await ProjectRepository.getWorkspaceMembers(workspaceId);
    return members.map(ProjectMapper.toWorkspaceMemberListItem);
  }

  /**
   * Get all unique project members in a workspace
   */
  static async getWorkspaceProjectMembers(workspaceId: string): Promise<ProjectMemberUI[]> {
    const projectMembers = await ProjectRepository.getProjectMembersByWorkspace(workspaceId);

    return projectMembers
      .filter((m, index, self) =>
        index === self.findIndex((t) => t.workspaceMember.userId === m.workspaceMember.userId)
      )
      .map(ProjectMapper.toProjectMemberUI);
  }

  /**
   * Get project metadata
   */
  static async getProjectMetadata(workspaceId: string, slug: string, userId: string) {
    const project = await ProjectRepository.getProjectMetadata(workspaceId, slug, userId);

    if (!project || project.workspace.members.length === 0) {
      return null;
    }

    const workspaceMember = project.workspace.members[0];
    const isWorkspaceAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const projectMember = project.projectMembers[0];

    if (!isWorkspaceAdmin && !projectMember) {
      return null;
    }

    return ProjectMapper.toProjectMetadata(project, userId);
  }

  /**
   * Get full project data including client info
   */
  static async getFullProjectData(projectId: string, userId: string): Promise<FullProjectData | null> {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) return null;

    const currentUserMember = project.projectMembers.find(
      (pm) => pm.workspaceMember.userId === userId
    );

    if (!currentUserMember) {
      const isWorkspaceAdmin = project.workspace.members.some(
        m => m.userId === userId && (m.workspaceRole === "ADMIN" || m.workspaceRole === "OWNER")
      );
      if (!isWorkspaceAdmin) return null;
    }

    return ProjectMapper.toFullProjectData(project, userId);
  }

  /**
   * Create a project
   */
  static async createProject(userId: string, values: ProjectSchemaType) {
    const validation = projectSchema.safeParse(values);
    if (!validation.success) throw AppError.ValidationError("Invalid project data");

    const workspaceId = values.workspaceId!;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: true }
    });

    if (!workspace) throw AppError.NotFound("Workspace not found");

    const currentMember = workspace.members.find(m => m.userId === userId);
    if (!currentMember) throw AppError.Forbidden("Not a workspace member");

    if (!hasWorkspacePermission(currentMember.workspaceRole, "project:create")) {
      throw AppError.Forbidden("Insufficient permissions");
    }

    const isOwnerOrAdmin = currentMember.workspaceRole === "OWNER" || currentMember.workspaceRole === "ADMIN";
    const isManager = currentMember.workspaceRole === "MANAGER";

    let projectManagersToAdd: string[] = [];

    if (isOwnerOrAdmin) {
      if (values.projectManagers && values.projectManagers.length === 1) {
        projectManagersToAdd = values.projectManagers;
      } else {
        throw AppError.ValidationError("A project must have exactly one Project Manager");
      }
    } else if (isManager) {
      projectManagersToAdd = [userId];
    } else {
      throw AppError.Forbidden("Insufficient permissions");
    }

    const workspaceMemberMap = new Map(workspace.members.map(m => [m.userId, m.id]));

    // Validate manager is in workspace
    if (!workspaceMemberMap.has(projectManagersToAdd[0])) {
      throw AppError.ValidationError("Project manager must be a workspace member");
    }

    let finalColor = values.color;
    if (!finalColor) {
      const existing = await ProjectRepository.getWorkspaceProjects(workspaceId, { color: true });
      const usedColors = (existing as any[]).map(p => p.color).filter(Boolean);
      finalColor = getUniqueRandomColor(usedColors);
    }

    const newProject = await ProjectRepository.createProject({
      name: values.name,
      description: values.description,
      slug: values.slug,
      color: finalColor,
      workspaceId,
      createdBy: userId,
      projectMembers: {
        create: projectManagersToAdd.map(id => ({
          workspaceMemberId: workspaceMemberMap.get(id)!,
          hasAccess: true,
          projectRole: "PROJECT_MANAGER",
        })),
      },
      ...(values.companyName ? {
        clint: {
          create: {
            name: values.companyName,
            registeredCompanyName: values.registeredCompanyName,
            directorName: values.directorName,
            address: values.address,
            gstNumber: values.gstNumber,
            clintMembers: {
              create: {
                name: values.contactPerson,
                phoneNumber: values.phoneNumber,
              },
            },
          },
        },
      } : {}),
    });

    await ProjectEvents.onProjectCreated(workspaceId, newProject);
    return newProject;
  }

  /**
   * Update a project
   */
  static async updateProject(userId: string, values: EditProjectSchemaType) {
    const validation = editProjectSchema.safeParse(values);
    if (!validation.success) throw AppError.ValidationError("Invalid project data");

    const project = await ProjectRepository.getProjectWithWorkspace(values.projectId);
    if (!project) throw AppError.NotFound("Project not found");

    const permissions = await this.getPermissions(project.workspaceId, project.id, userId);
    if (!permissions.isWorkspaceAdmin && !isProjectAdmin(permissions.projectMember?.projectRole as any)) {
      throw AppError.Forbidden("Insufficient permissions");
    }

    if (values.slug && values.slug !== project.slug) {
      const existing = await prisma.project.findFirst({
        where: { workspaceId: project.workspaceId, slug: values.slug, id: { not: values.projectId } }
      });
      if (existing) throw AppError.ValidationError("Slug already exists");
    }

    const workspaceMemberMap = new Map(project.workspace.members.map(m => [m.userId, m.id]));

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: values.projectId },
        data: {
          name: values.name,
          description: values.description,
          slug: values.slug || project.slug,
        },
      });

      const clientRecord = project.clint[0];
      if (clientRecord) {
        await tx.clints.update({
          where: { id: clientRecord.id },
          data: {
            ...(values.companyName && { name: values.companyName }),
            ...(values.registeredCompanyName && { registeredCompanyName: values.registeredCompanyName }),
            ...(values.directorName && { directorName: values.directorName }),
            ...(values.address && { address: values.address }),
            ...(values.gstNumber && { gstNumber: values.gstNumber }),
          },
        });

        if (values.contactPerson || values.phoneNumber) {
          const clientMember = clientRecord.clintMembers[0];
          if (clientMember) {
            await tx.clintMembers.update({
              where: { id: clientMember.id },
              data: {
                ...(values.contactPerson && { name: values.contactPerson }),
                ...(values.phoneNumber && { phoneNumber: values.phoneNumber }),
              },
            });
          }
        }
      }

      if (values.projectManagers) {
        const requestedIds = values.projectManagers;
        const currentPMs = project.projectMembers.filter(pm => pm.projectRole === "PROJECT_MANAGER");
        const currentPMUserIds = currentPMs.map(pm => pm.workspaceMember.userId);

        const toAdd = requestedIds.filter(id => !currentPMUserIds.includes(id));
        const toRemove = currentPMUserIds.filter(id => !requestedIds.includes(id));

        for (const uid of toAdd) {
          const wmId = workspaceMemberMap.get(uid);
          if (wmId) {
            await tx.projectMember.upsert({
              where: { workspaceMemberId_projectId: { projectId: values.projectId, workspaceMemberId: wmId } },
              update: { projectRole: "PROJECT_MANAGER", hasAccess: true },
              create: { projectId: values.projectId, workspaceMemberId: wmId, projectRole: "PROJECT_MANAGER", hasAccess: true }
            });
          }
        }

        for (const uid of toRemove) {
          const pm = currentPMs.find(p => p.workspaceMember.userId === uid);
          if (pm) await tx.projectMember.update({ where: { id: pm.id }, data: { projectRole: "MEMBER" } });
        }
      }
    });

    await ProjectEvents.onProjectUpdated(project.workspaceId, project.id);
  }

  /**
   * Delete a project
   */
  static async deleteProject(userId: string, projectId: string) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    // Derive permission from already-loaded workspace members — no extra query needed
    const callerWsMember = project.workspace.members.find(m => m.userId === userId);
    const isWorkspaceAdmin = callerWsMember?.workspaceRole === "OWNER" || callerWsMember?.workspaceRole === "ADMIN";
    const isOwner = project.workspace.ownerId === userId;

    if (!isWorkspaceAdmin && !isOwner) {
      throw AppError.Forbidden("Only workspace owners and admins can delete projects");
    }

    await ProjectRepository.deleteProject(projectId);
    await ProjectEvents.onProjectDeleted(project.workspaceId, projectId);
  }

  /**
   * Add members to project
   */
  static async addMembers(userId: string, projectId: string, memberUserIds: string[]) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    // Derive permission from already-loaded data — saves 2 extra queries
    const callerWsMember = project.workspace.members.find(m => m.userId === userId);
    const callerPrMember = project.projectMembers.find(pm => pm.workspaceMember.userId === userId);
    const isWorkspaceAdmin = callerWsMember?.workspaceRole === "OWNER" || callerWsMember?.workspaceRole === "ADMIN";
    const isProjectManager = isWorkspaceAdmin || callerPrMember?.projectRole === "PROJECT_MANAGER";

    if (!isWorkspaceAdmin && !isProjectManager) {
      throw AppError.Forbidden("Only workspace admins and project managers can add members");
    }

    const workspaceMemberMap = new Map(project.workspace.members.map(m => [m.userId, m.id]));
    const existingIds = new Set(project.projectMembers.map(pm => pm.workspaceMember.userId));

    const addedUserIds = memberUserIds.filter(id => !existingIds.has(id) && workspaceMemberMap.has(id));
    const newMembers = addedUserIds.map(id => ({
      projectId,
      workspaceMemberId: workspaceMemberMap.get(id)!,
      hasAccess: true,
      projectRole: "MEMBER" as PrismaProjectRole
    }));

    if (newMembers.length > 0) {
      await ProjectRepository.addProjectMembers(newMembers);
      await ProjectEvents.onMembersAdded(project.workspaceId, projectId, addedUserIds);
    }
  }

  /**
   * Remove members from project
   */
  static async removeMembers(userId: string, projectId: string, memberUserIds: string[]) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    // Derive permission from already-loaded data — saves 2 extra queries
    const callerWsMember = project.workspace.members.find(m => m.userId === userId);
    const callerPrMember = project.projectMembers.find(pm => pm.workspaceMember.userId === userId);
    const isWorkspaceAdmin = callerWsMember?.workspaceRole === "OWNER" || callerWsMember?.workspaceRole === "ADMIN";
    const isProjectManager = isWorkspaceAdmin || callerPrMember?.projectRole === "PROJECT_MANAGER";

    if (!isWorkspaceAdmin && !isProjectManager) {
      throw AppError.Forbidden("Insufficient permissions");
    }

    const toRemove = project.projectMembers.filter(pm => memberUserIds.includes(pm.workspaceMember.userId));
    if (toRemove.length === 0) return;

    const currentManagers = project.projectMembers.filter(pm => pm.projectRole === "PROJECT_MANAGER");
    const remainingManagers = currentManagers.filter(pm => !memberUserIds.includes(pm.workspaceMember.userId));

    if (currentManagers.length > 0 && remainingManagers.length === 0) {
      throw AppError.ValidationError("Cannot remove all project managers");
    }

    await ProjectRepository.removeProjectMembers(toRemove.map(pm => pm.id));
    await ProjectEvents.onMembersRemoved(project.workspaceId, projectId, toRemove.map(pm => pm.workspaceMember.userId));
  }

  /**
   * Update member role
   */
  static async updateMemberRole(userId: string, projectId: string, targetUserId: string, newRole: ProjectRole) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    // Derive permission from already-loaded data — saves 2 extra queries
    const callerWsMember = project.workspace.members.find(m => m.userId === userId);
    const callerPrMember = project.projectMembers.find(pm => pm.workspaceMember.userId === userId);
    const isWorkspaceAdmin = callerWsMember?.workspaceRole === "OWNER" || callerWsMember?.workspaceRole === "ADMIN";
    const isProjectManager = isWorkspaceAdmin || callerPrMember?.projectRole === "PROJECT_MANAGER";

    if (!isWorkspaceAdmin && !isProjectManager) {
      throw AppError.Forbidden("Insufficient permissions");
    }

    const targetMember = project.projectMembers.find(pm => pm.workspaceMember.userId === targetUserId);
    if (!targetMember) throw AppError.NotFound("Member not found in project");

    if (targetMember.projectRole === "PROJECT_MANAGER" && newRole !== "PROJECT_MANAGER") {
      const managers = project.projectMembers.filter(pm => pm.projectRole === "PROJECT_MANAGER");
      if (managers.length === 1) throw AppError.ValidationError("Cannot demote last project manager");
    }

    if (newRole === "PROJECT_MANAGER" && targetMember.projectRole !== "PROJECT_MANAGER") {
      await prisma.projectMember.updateMany({
        where: { projectId, projectRole: "PROJECT_MANAGER" },
        data: { projectRole: "MEMBER" }
      });
    }

    await ProjectRepository.updateProjectMember(targetMember.id, { projectRole: newRole });
    await ProjectEvents.onMemberRoleUpdated(project.workspaceId, projectId, targetUserId);
  }

  /**
   * Toggle member access
   */
  static async toggleMemberAccess(userId: string, projectId: string, targetUserId: string) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    // Derive permission from already-loaded data — saves 2 extra queries
    const callerWsMember = project.workspace.members.find(m => m.userId === userId);
    const callerPrMember = project.projectMembers.find(pm => pm.workspaceMember.userId === userId);
    const isWorkspaceAdmin = callerWsMember?.workspaceRole === "OWNER" || callerWsMember?.workspaceRole === "ADMIN";
    const isProjectManager = isWorkspaceAdmin || callerPrMember?.projectRole === "PROJECT_MANAGER";

    if (!isWorkspaceAdmin && !isProjectManager) {
      throw AppError.Forbidden("Insufficient permissions");
    }

    const targetMember = project.projectMembers.find(pm => pm.workspaceMember.userId === targetUserId);
    if (!targetMember) throw AppError.NotFound("Member not found in project");

    await ProjectRepository.updateProjectMember(targetMember.id, { hasAccess: !targetMember.hasAccess });
    await ProjectEvents.onMemberAccessToggled(project.workspaceId, projectId, targetUserId);
  }

  /**
   * Static helpers from original service
   */
  static async getMembers(projectId: string): Promise<ProjectMemberUI[]> {
    const members = await ProjectRepository.getProjectMembers(projectId);
    return members.map(ProjectMapper.toProjectMemberUI);
  }

  static async getPermissions(workspaceId: string, projectId: string, userId: string) {
    const [workspaceMember, projectMember] = await Promise.all([
      prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        include: { user: { select: { surname: true } } }
      }),
      prisma.projectMember.findFirst({
        where: { projectId, workspaceMember: { userId } },
      }),
    ]);

    if (!workspaceMember) return {
      isWorkspaceAdmin: false, isProjectLead: false, isProjectManager: false, isMember: false,
      canCreateSubTask: false, canPerformBulkOperations: false, workspaceMemberId: null,
      workspaceRole: null, userId: null, userSurname: null, projectMember: null
    };

    return ProjectMapper.toPermissions(workspaceMember, projectMember);
  }

  static async getProjectLayoutData(workspaceId: string, projectId: string, userId: string) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) throw AppError.NotFound("Project not found");

    const [members, permissions] = await Promise.all([
      this.getMembers(projectId),
      this.getPermissions(project.workspaceId, projectId, userId),
    ]);

    return { members, permissions };
  }

  static async getProjectReviewers(projectId: string) {
    const project = await ProjectRepository.getProjectWithWorkspace(projectId);
    if (!project) return [];

    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: project.workspaceId, workspaceRole: { in: ["OWNER", "ADMIN"] } },
      include: { user: true }
    });

    const leads = project.projectMembers.filter(pm => ["PROJECT_MANAGER", "LEAD"].includes(pm.projectRole));

    const reviewerMap = new Map<string, any>();
    admins.forEach(m => reviewerMap.set(m.userId, { id: m.userId, surname: m.user.surname || "", role: m.workspaceRole }));
    leads.forEach(pm => {
      if (!reviewerMap.has(pm.workspaceMember.userId)) {
        reviewerMap.set(pm.workspaceMember.userId, {
          id: pm.workspaceMember.userId,
          surname: pm.workspaceMember.user?.surname || "",
          role: pm.projectRole
        });
      }
    });

    return Array.from(reviewerMap.values());
  }

  static async getWorkspaceProjectAssignments(workspaceId: string) {
    const members = await prisma.projectMember.findMany({
      where: { project: { workspaceId } },
      include: { workspaceMember: { include: { user: { select: { surname: true } } } } }
    });

    const assignments: Record<string, any[]> = {};
    members.forEach(pm => {
      if (!assignments[pm.projectId]) assignments[pm.projectId] = [];
      assignments[pm.projectId].push({
        memberId: pm.id, id: pm.workspaceMember.userId,
        surname: pm.workspaceMember.user?.surname || "Member", role: pm.projectRole
      });
    });
    return assignments;
  }

  static async getWorkspaceProjectLeaders(workspaceId: string) {
    const [projectMembers, workspaceAdmins, projects] = await Promise.all([
      prisma.projectMember.findMany({
        where: { project: { workspaceId }, projectRole: { in: ["PROJECT_MANAGER", "LEAD"] }, hasAccess: true },
        include: { workspaceMember: { include: { user: { select: { id: true, surname: true, name: true, image: true } } } } }
      }),
      prisma.workspaceMember.findMany({
        where: { workspaceId, workspaceRole: { in: ["OWNER", "ADMIN"] } },
        include: { user: { select: { id: true, surname: true } } }
      }),
      prisma.project.findMany({ where: { workspaceId }, select: { id: true } })
    ]);

    const pmMap: Record<string, any[]> = {};
    projects.forEach(p => pmMap[p.id] = workspaceAdmins.map(wa => wa.user).filter(Boolean));
    projectMembers.forEach(pm => {
      const user = pm.workspaceMember?.user;
      if (user) {
        if (!pmMap[pm.projectId]) pmMap[pm.projectId] = workspaceAdmins.map(wa => wa.user).filter(Boolean);
        if (!pmMap[pm.projectId].some(u => u.id === user.id)) pmMap[pm.projectId].unshift(user);
      }
    });
    return pmMap;
  }

  static async getWorkspaceTags(workspaceId: string) {
    return ProjectRepository.getWorkspaceTags(workspaceId);
  }

  static async getProjectBySlug(workspaceId: string, slug: string) {
    return ProjectRepository.getProjectBySlug(workspaceId, slug);
  }
}
