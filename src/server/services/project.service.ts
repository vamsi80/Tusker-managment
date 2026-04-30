import prisma from "@/lib/db";
import { AppError } from "@/lib/errors/app-error";
import { ProjectRole as PrismaProjectRole } from "@/generated/prisma";
import {
  ProjectMember,
  MinimalProjectData,
  ProjectListItem,
  FullProjectData,
  ProjectRole,
  ProjectMemberUI
} from "@/types/project";

export class ProjectService {
  /**
   * Get all projects in a workspace for a specific user
   * Implements strict visibility rules.
   */
  static async getWorkspaceProjects(workspaceId: string, userId: string): Promise<ProjectListItem[]> {
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
      select: {
        id: true,
        workspaceRole: true,
      },
    });

    if (!workspaceMember) return [];

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";
    const isManager = workspaceMember.workspaceRole === "MANAGER";

    const projectSelect = {
      id: true,
      name: true,
      slug: true,
      color: true,
      createdBy: true,
      projectMembers: {
        where: {
          workspaceMember: { userId }
        },
        select: {
          projectRole: true,
        }
      }
    } as const;

    let projects;

    if (isOwnerOrAdmin) {
      projects = await prisma.project.findMany({
        where: { workspaceId },
        select: projectSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    } else if (isManager) {
      projects = await prisma.project.findMany({
        where: {
          workspaceId,
          OR: [
            { createdBy: userId },
            {
              projectMembers: {
                some: { workspaceMember: { userId }, hasAccess: true },
              },
            },
          ],
        },
        select: projectSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    } else {
      projects = await prisma.project.findMany({
        where: {
          workspaceId,
          projectMembers: {
            some: { workspaceMember: { userId }, hasAccess: true },
          },
        },
        select: projectSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    }

    return projects.map(project => {
      const userProjectMember = project.projectMembers[0];
      const isProjectManager = userProjectMember?.projectRole === "PROJECT_MANAGER";
      const isCreator = project.createdBy === userId;

      return {
        id: project.id,
        name: project.name,
        slug: project.slug,
        color: project.color,
        canManageMembers: isOwnerOrAdmin || isProjectManager || isCreator,
      };
    });
  }

  /**
   * Lightweight version for sidebar/layout
   */
  static async getMinimalWorkspaceProjects(workspaceId: string, userId: string): Promise<MinimalProjectData[]> {
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
      select: {
        workspaceRole: true,
      },
    });

    if (!workspaceMember) return [];

    const isOwnerOrAdmin = workspaceMember.workspaceRole === "OWNER" || workspaceMember.workspaceRole === "ADMIN";

    const where: any = { workspaceId };

    if (!isOwnerOrAdmin) {
      where.OR = [
        { createdBy: userId },
        {
          projectMembers: {
            some: { workspaceMember: { userId }, hasAccess: true },
          },
        },
      ];
    }

    return prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  /**
   * Get all workspace members (for project lead/manager selection)
   * Self-contained logic to avoid calling WorkspaceService.
   */
  static async getWorkspaceMembers(workspaceId: string) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        userId: true,
        workspaceRole: true,
        designation: true,
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
    });

    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      workspaceRole: m.workspaceRole,
      designation: m.designation,
      user: m.user
    }));
  }

  /**
   * Get all unique project members in a workspace
   */
  static async getWorkspaceProjectMembers(workspaceId: string): Promise<ProjectMemberUI[]> {
    const projectMembers = await prisma.projectMember.findMany({
      where: { project: { workspaceId } },
      select: {
        id: true,
        projectId: true,
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

    const uniqueMembers = new Map<string, ProjectMemberUI>();
    projectMembers.forEach(m => {
      const userId = m.workspaceMember.userId;
      if (!uniqueMembers.has(userId)) {
        uniqueMembers.set(userId, {
          id: userId,
          userId: userId,
          projectId: m.projectId,
          projectMemberId: m.id,
          projectRole: m.projectRole as ProjectRole,
          user: {
            ...m.workspaceMember.user,
            image: m.workspaceMember.user.image ?? null
          }
        });
      }
    });

    return Array.from(uniqueMembers.values());
  }

  /**
   * Get project metadata
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

    if (!isWorkspaceAdmin && !projectMember) {
      return null;
    }

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
   * Get full project data including client info
   */
  static async getFullProjectData(projectId: string, userId: string): Promise<FullProjectData | null> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectMembers: {
          include: {
            workspaceMember: {
              include: {
                user: {
                  select: {
                    id: true,
                    surname: true,
                  }
                }
              }
            }
          }
        },
        clint: {
          take: 1,
          include: {
            clintMembers: { take: 1 }
          }
        }
      },
    });

    if (!project) return null;

    const currentUserMember = project.projectMembers.find(
      (pm) => pm.workspaceMember.userId === userId
    );

    if (!currentUserMember) {
      const workspaceMember = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: project.workspaceId,
          userId: userId,
          workspaceRole: { in: ["ADMIN", "OWNER"] }
        }
      });
      if (!workspaceMember) return null;
    }

    const projectMembers: ProjectMember[] = project.projectMembers.map((pm) => ({
      id: pm.id,
      userId: pm.workspaceMember.userId,
      userName: pm.workspaceMember.user?.surname || "Unknown",
      projectRole: pm.projectRole as ProjectRole,
      hasAccess: pm.hasAccess,
    }));

    const projectManagers = project.projectMembers
      .filter(pm => pm.projectRole === "PROJECT_MANAGER")
      .map(pm => pm.workspaceMember.userId);

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      slug: project.slug,
      color: project.color,
      workspaceId: project.workspaceId,
      projectLead: projectManagers[0] || null,
      projectManagers,
      memberAccess: project.projectMembers.map(pm => pm.workspaceMember.userId),
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
   * Get a single project by slug or ID
   */
  static async getProjectBySlug(workspaceId: string, slug: string) {
    return prisma.project.findFirst({
      where: {
        workspaceId,
        OR: [
          { slug },
          { id: slug }
        ]
      },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        workspaceId: true,
        description: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  /**
   * Get project members
   */
  static async getMembers(projectId: string): Promise<ProjectMemberUI[]> {
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        projectId: true,
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
      projectId: m.projectId,
      projectMemberId: m.id,
      projectRole: m.projectRole as PrismaProjectRole,
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
   * Get workspace tags
   * Self-contained logic to avoid external dependencies.
   */
  static async getWorkspaceTags(workspaceId: string) {
    return prisma.tag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" }
    });
  }

  /**
   * Aggregated Layout Data Fetch
   */
  static async getProjectLayoutData(workspaceIdOrSlug: string, projectId: string, userId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });

    if (!project) throw AppError.NotFound("Project not found");
    const workspaceId = project.workspaceId;

    const [members, permissions] = await Promise.all([
      this.getMembers(projectId),
      this.getPermissions(workspaceId, projectId, userId),
    ]);

    return {
      members,
      permissions,
    };
  }

  /**
   * Get available reviewers for a project
   */
  static async getProjectReviewers(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });

    if (!project) return [];

    // 1. Get Workspace Admins and Owners (Always eligible)
    const admins = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: project.workspaceId,
        workspaceRole: { in: ["OWNER", "ADMIN"] }
      },
      include: { user: true }
    });

    // 2. Get All Project Members (LEAD and PM only)
    const projectMembers = await prisma.projectMember.findMany({
      where: {
        projectId: projectId,
        projectRole: { in: ["PROJECT_MANAGER", "LEAD"] }
      },
      include: {
        workspaceMember: {
          include: {
            user: {
              select: { id: true, surname: true }
            }
          }
        }
      }
    });

    const reviewerMap = new Map<string, any>();

    // Add admins first
    admins.forEach(m => {
      reviewerMap.set(m.userId, {
        id: m.userId,
        surname: m.user.surname || "",
        role: m.workspaceRole
      });
    });

    // Add project members if not already added as admins
    projectMembers.forEach(pm => {
      const userId = pm.workspaceMember.userId;
      if (!reviewerMap.has(userId)) {
        reviewerMap.set(userId, {
          id: userId,
          surname: pm.workspaceMember.user?.surname || "",
          role: pm.projectRole
        });
      }
    });

    return Array.from(reviewerMap.values());
  }

  /**
   * Get Project Assignments Map
   * Returns a map of projectId -> { id: string, memberId: string, surname: string, role: string }[]
   */
  static async getWorkspaceProjectAssignments(workspaceId: string) {
    const projectMembers = await prisma.projectMember.findMany({
      where: { project: { workspaceId } },
      select: {
        id: true, // ProjectMember record ID
        projectId: true,
        projectRole: true,
        workspaceMember: {
          select: {
            userId: true,
            user: { select: { surname: true } }
          }
        },
      },
    });

    const projectAssignments: Record<string, { id: string; memberId: string; surname: string; role: string }[]> = {};
    projectMembers.forEach((pm) => {
      if (!projectAssignments[pm.projectId]) {
        projectAssignments[pm.projectId] = [];
      }
      projectAssignments[pm.projectId].push({
        memberId: pm.id,
        id: pm.workspaceMember.userId,
        surname: pm.workspaceMember.user?.surname || "Member",
        role: pm.projectRole
      });
    });

    return projectAssignments;
  }

  /**
   * Get Project Leaders Map
   * Returns a map of projectId -> { id, surname, image }[]
   */
  static async getWorkspaceProjectLeaders(workspaceId: string) {
    const [projectMembers, workspaceAdmins, projects] = await Promise.all([
      prisma.projectMember.findMany({
        where: {
          project: { workspaceId },
          projectRole: { in: ["PROJECT_MANAGER", "LEAD"] },
          hasAccess: true,
        },
        select: {
          projectId: true,
          workspaceMember: {
            select: {
              user: { select: { id: true, surname: true, name: true, image: true } },
            },
          },
        },
      }),
      prisma.workspaceMember.findMany({
        where: {
          workspaceId,
          workspaceRole: { in: ["OWNER", "ADMIN"] },
        },
        select: {
          user: { select: { id: true, surname: true } },
        },
      }),
      prisma.project.findMany({
        where: { workspaceId },
        select: { id: true },
      }),
    ]);

    const pmMap: Record<
      string,
      Array<{ id: string; surname: string | null }>
    > = {};

    // 1. Initialize map with projects and workspace admins as default leaders
    projects.forEach((p) => {
      pmMap[p.id] = workspaceAdmins.map((wa) => wa.user).filter(Boolean) as any;
    });

    // 2. Add explicit project managers/leads (at the front if they exist)
    projectMembers.forEach((pm) => {
      const user = pm.workspaceMember?.user;
      if (user) {
        if (!pmMap[pm.projectId]) {
          // Initialize with workspace admins if project was not in the initial list
          pmMap[pm.projectId] = workspaceAdmins.map((wa) => wa.user).filter(Boolean) as any;
        }
        // Add to the front of the list, unless already there
        if (!pmMap[pm.projectId].some((u) => u.id === user.id)) {
          pmMap[pm.projectId].unshift(user as any);
        }
      }
    });

    return pmMap;
  }
}
