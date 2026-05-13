import prisma from "@/lib/db";

export class ProjectRepository {
  static async getWorkspaceMember(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true, workspaceRole: true },
    });
  }

  static async getWorkspaceProjects(workspaceId: string, select: any, where: any = {}) {
    return prisma.project.findMany({
      where: { workspaceId, ...where },
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  static async getWorkspaceMembers(workspaceId: string) {
    return prisma.workspaceMember.findMany({
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
  }

  static async getProjectWithWorkspace(projectId: string) {
    return prisma.project.findFirst({
      where: {
        OR: [
          { id: projectId },
          { slug: projectId }
        ]
      },
      include: {
        workspace: {
          include: {
            members: {
              include: { user: true }
            }
          }
        },
        projectManager: {
          include: { user: true }
        },
        projectMembers: {
          include: {
            workspaceMember: {
              include: { user: true }
            }
          }
        },
        clint: {
          include: {
            clintMembers: true
          }
        }
      }
    });
  }

  static async getProjectMetadata(workspaceId: string, slug: string, userId: string) {
    return prisma.project.findFirst({
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
              select: { id: true, workspaceRole: true }
            }
          }
        },
        projectMembers: {
          where: { workspaceMember: { userId } },
          select: { projectRole: true }
        }
      }
    });
  }

  static async deleteProject(projectId: string) {
    return prisma.project.delete({
      where: { id: projectId },
    });
  }

  static async createProject(data: any) {
    return prisma.project.create({ data });
  }

  static async updateProject(projectId: string, data: any) {
    return prisma.project.update({
      where: { id: projectId },
      data,
    });
  }

  static async getProjectMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        workspaceMember: {
          include: { user: true }
        }
      }
    });
  }

  static async addProjectMembers(data: any[]) {
    return prisma.projectMember.createMany({ data });
  }

  static async removeProjectMembers(ids: string[]) {
    return prisma.projectMember.deleteMany({
      where: { id: { in: ids } }
    });
  }

  static async getProjectMembersByWorkspace(workspaceId: string) {
    return prisma.projectMember.findMany({
      where: { project: { workspaceId } },
      include: {
        workspaceMember: {
          include: { user: true }
        }
      }
    });
  }

  static async updateProjectMember(id: string, data: any) {
    return prisma.projectMember.update({
      where: { id },
      data,
    });
  }

  static async getWorkspaceTags(workspaceId: string) {
    return prisma.tag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" }
    });
  }

  static async getProjectBySlug(workspaceId: string, slug: string) {
    return prisma.project.findFirst({
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
        description: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  static async getWorkspaceClients(workspaceId: string) {
    return prisma.clints.findMany({
      where: {
        workspaceId
      },
      include: {
        clintMembers: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }
}
