import { getDb } from "@/lib/registry";

export class ProjectRepository {
  static async getWorkspaceMember(workspaceId: string, userId: string) {
    return getDb().workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { id: true, workspaceRole: true },
    });
  }

  static async getWorkspaceProjects(workspaceId: string, select: any, where: any = {}) {
    return getDb().project.findMany({
      where: { workspaceId, ...where },
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  static async getWorkspaceMembers(workspaceId: string) {
    return getDb().workspaceMember.findMany({
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
          }
        }
      }
    });
  }

  static async getProjectWithWorkspace(projectId: string) {
    return getDb().project.findFirst({
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
        },
        tags: true
      }
    });
  }

  static async getProjectMetadata(workspaceId: string, slug: string, userId: string) {
    return getDb().project.findFirst({
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
    return getDb().project.delete({
      where: { id: projectId },
    });
  }

  static async createProject(data: any) {
    return getDb().project.create({ data });
  }

  static async updateProject(projectId: string, data: any) {
    return getDb().project.update({
      where: { id: projectId },
      data,
    });
  }

  static async getProjectMembers(projectId: string) {
    return getDb().projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        projectRole: true,
        workspaceMember: {
          select: {
            id: true,
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
  }

  static async addProjectMembers(data: any[]) {
    return getDb().projectMember.createMany({ data });
  }

  static async removeProjectMembers(ids: string[]) {
    return getDb().projectMember.deleteMany({
      where: { id: { in: ids } }
    });
  }

  static async getProjectMembersByWorkspace(workspaceId: string) {
    return getDb().projectMember.findMany({
      where: { project: { workspaceId } },
      select: {
        id: true,
        projectId: true,
        workspaceMember: {
          select: {
            id: true,
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
  }

  static async updateProjectMember(id: string, data: any) {
    return getDb().projectMember.update({
      where: { id },
      data,
    });
  }

  static async getWorkspaceTags(workspaceId: string) {
    return getDb().tag.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" }
    });
  }

  static async getProjectTags(projectId: string) {
    const projectTags = await getDb().tag.findMany({
      where: {
        projects: {
          some: {
            id: projectId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        requirePurchase: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    if (projectTags.length > 0) {
      return projectTags;
    }

    return getDb().tag.findMany({
      where: {
        tasks: {
          some: {
            projectId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        requirePurchase: true,
      },
      orderBy: {
        name: "asc",
      },
    });
  }

  static async getProjectBySlug(workspaceId: string, slug: string) {
    return getDb().project.findFirst({
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
        updatedAt: true,
        projectManagerId: true,
        projectManager: {
          select: {
            id: true,
            designation: true,
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                image: true
              }
            }
          }
        }
      }
    });
  }

  static async getWorkspaceClients(workspaceId: string) {
    return getDb().clints.findMany({
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
