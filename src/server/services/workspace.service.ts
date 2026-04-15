import prisma from "@/lib/db";
import { generateInviteCode } from "@/utils/get-invite-code";
import {
  invalidateWorkspace,
  invalidateUserWorkspaces,
  invalidateWorkspaceMembers,
} from "@/lib/cache/invalidation";
import { revalidateTag } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { auth } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDailyReportStatusForUser } from "@/data/daily-report/get-daily-report-status";
import { getUserProjects } from "@/data/project/get-projects";
import { getWorkspaceTags } from "@/data/tag/get-tags";

export class WorkspaceService {
  /**
   * Create a new workspace
   */
  static async createWorkspace(data: {
    name: string;
    slug: string;
    ownerId: string;
  }) {
    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        slug: data.slug,
        ownerId: data.ownerId,
        inviteCode: generateInviteCode(),
        members: {
          create: {
            userId: data.ownerId,
            workspaceRole: "OWNER",
          },
        },
      },
    });

    // Invalidate caches
    (revalidateTag as any)(CacheTags.userWorkspaces(data.ownerId)[0], "layout");
    (revalidateTag as any)("workspaces", "layout");

    return workspace;
  }

  /**
   * Update workspace information
   */
  static async updateWorkspace(
    workspaceId: string,
    data: {
      name?: string;
      slug?: string;
    },
    actorId?: string,
  ) {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: data,
    });

    // Revalidate cache
    await invalidateWorkspace(workspaceId);

    // Record Activity
    if (actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, surname: true },
      });
      await recordActivity({
        userId: actorId,
        userName: actor?.name || actor?.surname || "Admin",
        workspaceId,
        action: "WORKSPACE_UPDATED",
        entityType: "WORKSPACE",
        entityId: workspaceId,
        newData: data,
        broadcastEvent: "workspace_update",
      });
    }

    return workspace;
  }

  /**
   * Delete a workspace
   */
  static async deleteWorkspace(workspaceId: string, ownerId: string) {
    // Verify ownership (Double check in service)
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace || workspace.ownerId !== ownerId) {
      throw new Error("Unauthorized or Workspace not found");
    }

    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    // Invalidate caches
    (revalidateTag as any)(CacheTags.userWorkspaces(ownerId)[0], "layout");
    (revalidateTag as any)("workspaces", "layout");
    const tags = CacheTags.workspace(workspaceId);
    tags.forEach((tag) => revalidateTag(tag, "layout" as any));

    return { success: true };
  }

  /**
   * Get workspace members
   */
  static async getMembers(workspaceId: string) {
    const workspaceMembers = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            phoneNumber: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return {
      workspaceMembers: workspaceMembers.map((m) => ({
        ...m,
        user: m.user ?? undefined,
      })),
    };
  }

  /**
   * Invite a new member to the workspace
   */
  static async inviteMember(
    values: InviteUserSchemaType,
    actor: { id: string; name: string },
  ) {
    const parsed = inviteUserSchema.safeParse(values);
    if (!parsed.success) {
      throw new Error("Invalid input data");
    }

    const { name, niceName, email, password, role, workspaceId, phoneNumber } =
      parsed.data;

    // 1. Pre-flight checks (Validation BEFORE any side effects)
    // Check Email
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingEmailUser) {
      throw new Error("A user with this email already exists.");
    }

    // Check Phone
    const cleanPhoneNumber =
      phoneNumber && phoneNumber.trim() !== "" ? phoneNumber.trim() : null;
    if (cleanPhoneNumber) {
      const existingPhoneUser = await prisma.user.findFirst({
        where: { phoneNumber: cleanPhoneNumber },
      });
      if (existingPhoneUser) {
        throw new Error(
          "This phone number is already associated with another account.",
        );
      }
    }

    let createdAuthUserId: string | undefined;

    try {
      // 2. Create auth user (Side effect outside Prisma)
      const authResult = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
      });

      const authUserId = authResult?.user?.id;
      if (!authUserId) {
        throw new Error("Failed to create auth user");
      }
      createdAuthUserId = authUserId;

      // 3. Link and Enrich in a Transaction (Internal Database)
      try {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: authUserId },
            data: {
              surname: niceName ?? null,
              phoneNumber: cleanPhoneNumber,
            },
          }),

          prisma.workspaceMember.create({
            data: {
              userId: authUserId,
              workspaceId,
              workspaceRole: role,
            },
          }),
        ]);
      } catch (transactionError) {
        console.error(
          "[WorkspaceService.inviteMember] Transaction Error:",
          transactionError,
        );
        // Re-throw to hit the main catch block for cleanup
        throw transactionError;
      }

      // 4. Invalidate caches
      await invalidateUserWorkspaces(authUserId);
      await invalidateWorkspaceMembers(workspaceId);

      // 5. Record Activity
      await recordActivity({
        userId: actor.id,
        userName: actor.name,
        workspaceId,
        action: "MEMBER_INVITED",
        entityType: "MEMBER",
        entityId: authUserId,
        newData: { email, name, role },
        broadcastEvent: "team_update",
      });

      return { success: true, userId: authUserId };
    } catch (err: any) {
      console.error("[WorkspaceService.inviteMember] Error:", err);

      // 6. ROBUST CLEANUP (Rollback)
      // If the transaction failed but the Auth user was created, we MUST wipe it.
      if (createdAuthUserId) {
        try {
          // Path A: Better-Auth internal state cleanup
          if ((auth.api as any).deleteUser) {
            await (auth.api as any).deleteUser({
              body: { userId: createdAuthUserId },
            });
          }

          // Path B: Direct DB cleanup (Safety net)
          // We do this outside a transaction to ensure it hits despite previous transaction failures
          await prisma.user.deleteMany({
            where: { id: createdAuthUserId },
          });
        } catch (cleanupErr) {
          console.error(
            "[WorkspaceService.inviteMember] Cleanup failed:",
            cleanupErr,
          );
        }
      }
      throw err;
    }
  }

  /**
   * Remove a member from the workspace
   */
  static async removeMember(
    workspaceId: string,
    memberId: string,
    currentUserId: string,
  ) {
    // 1. Fetch workspace and members
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { name: true, surname: true },
            },
          },
        },
      },
    });

    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const currentMember = workspace.members.find(
      (m) => m.userId === currentUserId,
    );
    if (
      !currentMember ||
      (currentMember.workspaceRole !== "OWNER" &&
        currentMember.workspaceRole !== "ADMIN")
    ) {
      throw new Error("Only workspace owners/admins can remove members");
    }

    const memberToDelete = workspace.members.find((m) => m.id === memberId);
    if (!memberToDelete) {
      throw new Error("Member not found in this workspace");
    }

    if (memberToDelete.userId === currentUserId) {
      throw new Error("You cannot remove yourself from the workspace");
    }

    if (memberToDelete.userId === workspace.ownerId) {
      throw new Error(
        "Cannot remove the workspace owner. Transfer ownership first.",
      );
    }

    const adminCount = workspace.members.filter(
      (m) => m.workspaceRole === "ADMIN",
    ).length;
    if (memberToDelete.workspaceRole === "ADMIN" && adminCount <= 1) {
      throw new Error("Cannot remove the last admin from the workspace.");
    }

    const userIdToDelete = memberToDelete.userId;
    const userName =
      memberToDelete.user?.name || memberToDelete.user?.surname || "User";

    // Check if they own other workspaces
    const ownedWorkspaces = await prisma.workspace.count({
      where: {
        ownerId: userIdToDelete,
        id: { not: workspaceId },
      },
    });

    if (ownedWorkspaces > 0) {
      throw new Error(
        `Cannot delete user "${userName}" because they own other workspaces. Please transfer ownership first.`,
      );
    }

    // 2. Execution Transaction
    await prisma.$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({
        where: { userId: userIdToDelete },
      });
      await tx.user.delete({
        where: { id: userIdToDelete },
      });
    });

    // 3. Delete from Better Auth
    try {
      if ((auth.api as any).removeUser) {
        await (auth.api as any).removeUser({
          body: { userId: userIdToDelete },
        });
      }
    } catch (authDeleteErr) {
      console.error("Failed to delete auth user:", authDeleteErr);
    }

    // 4. Invalidate caches
    await invalidateUserWorkspaces(userIdToDelete);
    await invalidateWorkspaceMembers(workspaceId);

    // 5. Record Activity
    await recordActivity({
      userId: currentUserId,
      userName:
        currentMember?.user?.name || currentMember?.user?.surname || "Someone",
      workspaceId,
      action: "MEMBER_REMOVED",
      entityType: "MEMBER",
      entityId: memberId,
      oldData: { memberId, name: userName },
      broadcastEvent: "team_update",
    });

    return {
      success: true,
      message: `User "${userName}" has been completely removed.`,
    };
  }

  /**
   * Update a member's role in the workspace
   */
  static async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: string,
    actorId: string,
  ) {
    // 1. Fetch member to check constraints
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { name: true, surname: true } } },
    });

    if (!member || member.workspaceId !== workspaceId) {
      throw new Error("Member not found in this workspace");
    }

    if (member.workspaceRole === "OWNER") {
      throw new Error("Cannot change the role of the workspace owner");
    }

    // 2. Update Role
    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { workspaceRole: role as any },
    });

    // 3. Invalidate caches
    await invalidateWorkspaceMembers(workspaceId);

    // 4. Record Activity
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { surname: true },
    });
    await recordActivity({
      userId: actorId,
      userName: actor?.surname || "Admin",
      workspaceId,
      action: "MEMBER_UPDATED",
      entityType: "MEMBER",
      entityId: memberId,
      newData: { role },
      oldData: { role: member.workspaceRole },
      broadcastEvent: "team_update",
    });

    return { success: true, data: updated };
  }

  /**
   * Get all workspaces for a user
   */
  static async getWorkspaces(userId: string) {
    const workspacesData = await prisma.workspace.findMany({
      where: {
        members: { some: { userId } },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true } },
        members: {
          where: { userId },
          select: { workspaceRole: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const workspaces = workspacesData.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      ownerId: workspace.ownerId,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      workspaceRole: workspace.members[0]?.workspaceRole || "VIEWER",
      memberCount: workspace._count.members,
    }));

    return { workspaces, totalCount: workspaces.length };
  }

  /**
   * Get workspace by ID with membership check
   */
  static async getWorkspaceById(workspaceId: string, userId: string) {
    const [workspace, member] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          id: true,
          name: true,
          description: true,
          slug: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
          legalName: true,
          gstNumber: true,
          panNumber: true,
          companyType: true,
          industry: true,
          msmeNumber: true,
          email: true,
          phone: true,
          website: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          country: true,
          pincode: true,
        },
      }),
      prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        select: {
          id: true,
          userId: true,
          workspaceId: true,
          workspaceRole: true,
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              email: true,
            },
          },
        },
      }),
    ]);

    if (!workspace || !member) return null;

    return { ...workspace, members: [member] };
  }

  /**
   * Get workspace members with pagination
   */
  static async getWorkspaceMembers(
    workspaceId: string,
    cursor?: string,
    limit: number = 10,
  ) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        workspaceRole: true,
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
      },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get lightweight metadata for layout
   */
  static async getWorkspaceMetadata(workspaceId: string, userId: string) {
    const [workspace, member] = await Promise.all([
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      prisma.workspaceMember.findFirst({
        where: { workspaceId, userId },
        select: { id: true },
      }),
    ]);

    if (!workspace || !member) return null;

    return { id: workspace.id, name: workspace.name };
  }

  /**
   * Get unread notifications count for a user in a workspace
   */
  static async getUnreadNotificationsCount(workspaceId: string, userId: string) {
    const perms = await getWorkspacePermissions(workspaceId, userId);
    if (!perms.workspaceMemberId) return 0;

    const where: any = {
      task: { workspaceId },
      userId: { not: userId },
      readBy: { none: { userId } }
    };

    if (!perms.isWorkspaceAdmin) {
      const privilegedProjectIds = [
        ...(perms.leadProjectIds || []),
        ...(perms.managedProjectIds || [])
      ];
      where.task.OR = [
        { assigneeId: userId },
        { createdById: userId },
        { reviewerId: userId },
        ...(privilegedProjectIds.length > 0
          ? [{ projectId: { in: privilegedProjectIds } }]
          : [])
      ];
    }

    return prisma.comment.count({ where });
  }

  /**
   * Unified Layout Data Fetch
   * Optimized for zero-weight shell hydration.
   */
  static async getWorkspaceLayoutData(workspaceId: string, userId: string) {
    const [
      workspaces,
      metadata,
      reportStatus,
      projects,
      permissions,
      unreadNotificationsCount,
      tags,
      projectUserMap,
      projectLeadersMap,
    ] = await Promise.all([
      this.getWorkspaces(userId),
      this.getWorkspaceMetadata(workspaceId, userId),
      getDailyReportStatusForUser(workspaceId, userId),
      getUserProjects(workspaceId),
      getWorkspacePermissions(workspaceId),
      this.getUnreadNotificationsCount(workspaceId, userId),
      getWorkspaceTags(workspaceId),
      this.getWorkspaceProjectMembersMap(workspaceId),
      this.getWorkspaceProjectManagersMap(workspaceId),
    ]);

    return {
      workspaces,
      metadata,
      reportStatus,
      projects,
      permissions,
      unreadNotificationsCount,
      tags,
      projectUserMap,
      projectLeadersMap,
    };
  }

  /**
   * Get Project Members Map for Kanban
   */
  static async getWorkspaceProjectMembersMap(workspaceId: string) {
    const projectMembers = await prisma.projectMember.findMany({
      where: { project: { workspaceId } },
      select: {
        projectId: true,
        workspaceMember: { select: { userId: true } },
      },
    });

    const projectUserMap: Record<string, string[]> = {};
    projectMembers.forEach((pm) => {
      if (!projectUserMap[pm.projectId]) {
        projectUserMap[pm.projectId] = [];
      }
      projectUserMap[pm.projectId].push(pm.workspaceMember.userId);
    });

    return projectUserMap;
  }

  /**
   * Get Project Managers Map for Kanban
   */
  static async getWorkspaceProjectManagersMap(workspaceId: string) {
    const managers = await prisma.projectMember.findMany({
      where: {
        project: { workspaceId },
        projectRole: "PROJECT_MANAGER",
        hasAccess: true,
        workspaceMember: {
          workspaceRole: { notIn: ["OWNER", "ADMIN"] },
        },
      },
      select: {
        projectId: true,
        workspaceMember: {
          select: {
            user: { select: { id: true, surname: true } },
          },
        },
      },
    });

    const pmMap: Record<
      string,
      Array<{ id: string; surname: string | null }>
    > = {};
    managers.forEach((m) => {
      const user = m.workspaceMember?.user;
      if (user) {
        if (!pmMap[m.projectId]) pmMap[m.projectId] = [];
        pmMap[m.projectId].push(user);
      }
    });

    return pmMap;
  }

  /**
   * Get data for task creation at workspace level
   */
  static async getWorkspaceTaskCreationData(
    workspaceId: string,
    userId: string,
  ) {
    const permissions = await getWorkspacePermissions(workspaceId);
    if (!permissions.workspaceMemberId) {
      return {
        projects: [],
        members: [],
        tags: [],
        parentTasks: [],
        permissions: {
          isWorkspaceAdmin: false,
          canCreateTasks: false,
          canCreateSubTasks: false,
        },
      };
    }

    const [projectsData, membersData, tagsData] = await Promise.all([
      getUserProjects(workspaceId),
      this.getMembers(workspaceId),
      getWorkspaceTags(workspaceId),
    ]);

    const projectIds = projectsData.map((p) => p.id);
    const parentTasksData = await prisma.task.findMany({
      where: {
        workspaceId,
        projectId: { in: projectIds },
        parentTaskId: null,
      },
      select: { id: true, name: true, projectId: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    return {
      projects: projectsData.map((p) => ({ id: p.id, name: p.name })),
      members: membersData.workspaceMembers.map((m) => ({
        id: m.id,
        workspaceMember: {
          id: m.id,
          user: { id: m.user?.id || "", surname: m.user?.surname || null },
        },
      })),
      tags: tagsData.map((tag) => ({ id: tag.id, name: tag.name })),
      parentTasks: parentTasksData.map((task) => ({
        id: task.id,
        name: task.name,
        projectId: task.projectId!,
      })),
      permissions: {
        isWorkspaceAdmin: permissions.isWorkspaceAdmin,
        canCreateTasks: permissions.isWorkspaceAdmin,
        canCreateSubTasks: true,
      },
    };
  }
  /**
   * Verify an invitation and add the user to the workspace
   */
  static async verifyInvitation(workspaceId: string, role: string, userId: string) {
    // Check if user already exists in workspace
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!existingMember) {
      // Add user to workspace
      await prisma.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          workspaceRole: role as any,
        },
      });
    }

    // Invalidate caches
    await invalidateUserWorkspaces(userId);
    await invalidateWorkspaceMembers(workspaceId);

    return { success: true, workspaceId };
  }
}
