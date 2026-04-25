import crypto from "crypto";
import prisma from "@/lib/db";
import { generateInviteCode } from "@/utils/get-invite-code";
import {
  invalidateWorkspace,
  invalidateUserWorkspaces,
  invalidateWorkspaceMembers,
  invalidateUserPermissions,
} from "@/lib/cache/invalidation";
import { revalidateTag } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { auth } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { getDailyReportStatusForUser } from "@/data/daily-report/get-daily-report-status";

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
            emailVerified: true,
            _count: {
              select: {
                accounts: true,
              },
            },
          },
        },
        reportTo: {
          select: {
            user: {
              select: {
                surname: true,
              },
            },
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

    const { name, niceName, email, role, workspaceId, phoneNumber, designation, reportToId } =
      parsed.data;

    // 1. Pre-flight checks (Validation BEFORE any side effects)
    // Check Email
    const existingEmailUser = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: { where: { workspaceId } } }
    });

    if (existingEmailUser && existingEmailUser.workspaces.length > 0) {
      throw new Error("This user is already a member of this workspace.");
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
      // 2. Create user record (if not exists)
      // BETTER-AUTH: We create the user record first. 
      // The Account record (password) will be created when they set the password.
      const authUserId = existingEmailUser?.id ?? crypto.randomUUID();

      if (!existingEmailUser) {
        await prisma.user.create({
          data: {
            id: authUserId,
            email,
            name,
            surname: niceName ?? null,
            phoneNumber: cleanPhoneNumber,
            emailVerified: false,
          }
        });
      }

      // 2b. Generate Invitation Token
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      await prisma.verification.create({
        data: {
          id: crypto.randomUUID(),
          identifier: email,
          value: token,
          expiresAt,
        }
      });
      if (!authUserId) {
        throw new Error("Failed to create auth user");
      }
      createdAuthUserId = authUserId;

      // 3. Link and Enrich in a Transaction (Internal Database)
      try {
        await prisma.$transaction([
          prisma.workspaceMember.create({
            data: {
              userId: authUserId,
              workspaceId,
              workspaceRole: role,
              designation: designation || null,
              reportToId: reportToId || null,
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
      await invalidateUserPermissions(authUserId, workspaceId);

      // 5. Send Invitation Email (Refactored to include token)
      const { sendWorkspaceInvitationEmail } = await import("@/lib/auth");
      await sendWorkspaceInvitationEmail({
        email,
        name,
        workspaceId,
        role,
        token, // PASSING THE TOKEN
      });

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
   * Resend invitation email to a pending member
   */
  static async resendInvitation(workspaceId: string, memberId: string, actor: { id: string; name: string }) {
    // 1. Fetch member and workspace info
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        user: true,
        workspace: { select: { name: true } }
      }
    });

    if (!member || member.workspaceId !== workspaceId) {
      throw new Error("Member not found in this workspace.");
    }

    if (member.user.emailVerified) {
      throw new Error("User has already activated their account.");
    }

    // 2. Generate new token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Clean up old verification records for this email to avoid clutter
    await prisma.verification.deleteMany({
      where: { identifier: member.user.email }
    });

    // ERASE OLD PASSWORD ATTEMPTS & SESSIONS: 
    // If the user hasn't verified their email, we should delete their Account (password) 
    // and any existing sessions to ensure they start fresh when they click the new link.
    await prisma.account.deleteMany({
      where: {
        userId: member.userId,
        providerId: "credential"
      }
    });
    await prisma.session.deleteMany({
      where: { userId: member.userId }
    });

    await prisma.verification.create({
      data: {
        id: crypto.randomUUID(),
        identifier: member.user.email,
        value: token,
        expiresAt,
      }
    });

    // 3. Send Email
    const { sendWorkspaceInvitationEmail } = await import("@/lib/auth");
    await sendWorkspaceInvitationEmail({
      email: member.user.email,
      name: member.user.name || "Team Member",
      workspaceId,
      role: member.workspaceRole,
      token,
    });

    // 4. Record Activity
    await recordActivity({
      userId: actor.id,
      userName: actor.name,
      action: `RESENT_INVITATION`,
      entityId: member.id,
      workspaceId,
    });

    return { status: "success", message: "Invitation email resent successfully" };
  }

  /**
   * Accept invitation and set password
   */
  static async acceptInvitation(values: any) {
    const { email, token, password, name, niceName } = values;

    // 1. Verify token
    const verification = await prisma.verification.findFirst({
      where: {
        identifier: email,
        value: token,
        expiresAt: { gt: new Date() }
      }
    });

    if (!verification) {
      throw new Error("Invalid or expired invitation token");
    }

    // 2. Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true }
    });

    if (!user) {
      throw new Error("User not found");
    }

    // 3. Set password using Better Auth API or manual hash
    // We use signUpEmail to create the Account record if it doesn't exist, 
    // but Better Auth might fail if User already exists.
    // Recommended: Use setPassword if available, or manual create.
    // Since we are in the server, we can use the internal scrypt helper or just better-auth's setPassword

    try {
      // Better Auth setPassword requires a session or admin context
      // We'll use the internal password hashing logic to create the Account record manually for maximum reliability in this flow
      const { hashPassword } = await import("better-auth/crypto");
      const hashedPassword = await hashPassword(password);

      await prisma.$transaction(async (tx) => {
        // 1. Find existing credential account
        const existingAccount = await tx.account.findFirst({
          where: {
            userId: user.id,
            providerId: "credential"
          }
        });

        if (existingAccount) {
          // Update existing account
          await tx.account.update({
            where: { id: existingAccount.id },
            data: { password: hashedPassword }
          });
        } else {
          // Create new credential account
          await tx.account.create({
            data: {
              id: crypto.randomUUID(),
              userId: user.id,
              accountId: user.id,
              providerId: "credential",
              password: hashedPassword,
            },
          });
        }

        // 2. Mark email as verified and update profile info
        await tx.user.update({
          where: { id: user.id },
          data: {
            emailVerified: true,
            name: name || user.name,
            surname: niceName || user.surname
          }
        });

        // 3. Delete verification token
        await tx.verification.delete({
          where: { id: verification.id }
        });

        // 4. (Optional) Cleanup legacy 'email-password' accounts if they exist
        await tx.account.deleteMany({
          where: {
            userId: user.id,
            providerId: "email-password"
          }
        });
      });

      // 4. Invalidate Caches
      // Find all workspaces this user is a member of to refresh their status everywhere
      const userWorkspaces = await prisma.workspaceMember.findMany({
        where: { userId: user.id },
        select: { workspaceId: true }
      });

      for (const uw of userWorkspaces) {
        await invalidateWorkspaceMembers(uw.workspaceId);
      }

      await invalidateUserWorkspaces(user.id);

      return { success: true };
    } catch (err) {
      console.error("[WorkspaceService.acceptInvitation] Error:", err);
      throw new Error("Failed to set password. Please try again.");
    }
  }

  /**
   * Verify token for frontend loading state
   */
  static async verifyInvitationToken(token: string, email: string) {
    const verification = await prisma.verification.findFirst({
      where: {
        identifier: email,
        value: token,
        expiresAt: { gt: new Date() }
      }
    });
    return !!verification;
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
    await invalidateUserPermissions(userIdToDelete, workspaceId);

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
   * Update a member's information in the workspace
   */
  static async updateMember(
    workspaceId: string,
    memberId: string,
    data: {
      name: string;
      surname?: string | null;
      email: string;
      phoneNumber?: string | null;
      role: string;
      designation?: string | null;
      reportToId?: string | null;
    },
    actorId: string,
  ) {
    // 1. Fetch member to check constraints
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        workspaceRole: true,
        designation: true,
        reportToId: true,
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            phoneNumber: true
          }
        }
      }
    });

    if (!member || member.workspaceId !== workspaceId) {
      throw new Error("Member not found in this workspace");
    }

    if (member.workspaceRole === "OWNER" && data.role && data.role !== "OWNER") {
      throw new Error("Cannot change the role of the workspace owner. Transfer ownership first.");
    }

    const userId = member.userId;
    const oldEmail = member.user?.email || "";
    const isEmailChanged = data.email.toLowerCase() !== oldEmail.toLowerCase();

    // 2. Conflict Checks
    if (isEmailChanged) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingEmail) {
        throw new Error("This email address is already in use by another user.");
      }
    }

    if (data.phoneNumber && data.phoneNumber !== member.user?.phoneNumber) {
      const existingPhone = await prisma.user.findUnique({
        where: { phoneNumber: data.phoneNumber },
      });
      if (existingPhone) {
        throw new Error("This phone number is already associated with another account.");
      }
    }

    // 3. Execution Transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update User
      await tx.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          surname: data.surname,
          email: data.email,
          phoneNumber: data.phoneNumber,
          emailVerified: isEmailChanged ? false : undefined,
        },
      });

      // Update WorkspaceMember
      const updatedMember = await tx.workspaceMember.update({
        where: { id: memberId },
        data: {
          workspaceRole: data.role as any,
          designation: data.designation,
          reportToId: data.reportToId
        },
      });

      if (isEmailChanged) {
        // Handle Email Change Side Effects
        // Delete all accounts and sessions (forces full re-auth on all devices)
        await tx.account.deleteMany({
          where: { userId },
        });
        await tx.session.deleteMany({
          where: { userId },
        });

        // Generate new verification token
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        await tx.verification.deleteMany({
          where: { identifier: data.email },
        });

        await tx.verification.create({
          data: {
            id: crypto.randomUUID(),
            identifier: data.email,
            value: token,
            expiresAt,
          },
        });

        // Send Email
        const { sendWorkspaceInvitationEmail } = await import("@/lib/auth");
        await sendWorkspaceInvitationEmail({
          email: data.email,
          name: data.name,
          workspaceId,
          role: data.role,
          token,
        });
      }

      return updatedMember;
    });

    // 4. Invalidate caches
    await invalidateWorkspaceMembers(workspaceId);
    await invalidateUserWorkspaces(userId);
    await invalidateUserPermissions(userId, workspaceId);

    // 5. Record Activity
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { surname: true, name: true },
    });

    await recordActivity({
      userId: actorId,
      userName: actor?.surname || actor?.name || "Admin",
      workspaceId,
      action: "MEMBER_UPDATED",
      entityType: "MEMBER",
      entityId: memberId,
      newData: { ...data, emailChanged: isEmailChanged },
      oldData: {
        name: member.user?.name,
        surname: member.user?.surname,
        email: member.user?.email,
        phoneNumber: member.user?.phoneNumber,
        role: member.workspaceRole,
        designation: member.designation,
        reportToId: member.reportToId
      },
      broadcastEvent: "team_update",
    });

    return { success: true, data: result, emailChanged: isEmailChanged };
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
        ownerId: true,
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
      ownerId: workspace.ownerId,
      workspaceRole: workspace.members[0]?.workspaceRole || "VIEWER",
    }));

    return { workspaces };
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
   * Get workspace members (paginated)
   */
  static async getWorkspaceMembers(
    workspaceId: string,
    cursor?: string,
    limit: number = 10,
  ) {
    return prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
          },
        },
        reportTo: {
          select: {
            user: {
              select: {
                name: true,
                surname: true,
              },
            },
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
    const perms = await getWorkspacePermissions(workspaceId, userId, true);
    if (!perms.workspaceMemberId) return 0;

    const where: any = {
      task: { workspaceId },
      userId: { not: userId },
      readBy: { none: { userId } }
    };

    if (!perms.isWorkspaceAdmin) {
      // In lean mode, we might not have the project lists. 
      // We fall back to direct task involvement if lists are missing.
      const leadIds = (perms as any).leadProjectIds || [];
      const managedIds = (perms as any).managedProjectIds || [];
      const privilegedProjectIds = [...leadIds, ...managedIds];

      where.task.OR = [
        { assignee: { workspaceMember: { userId } } },
        { createdBy: { workspaceMember: { userId } } },
        { reviewer: { workspaceMember: { userId } } },
        ...(privilegedProjectIds.length > 0
          ? [{ projectId: { in: privilegedProjectIds } }]
          : [])
      ];
    }

    const unreadTasks = await prisma.comment.groupBy({
      by: ['taskId'],
      where
    });

    return unreadTasks.length;
  }

  /**
   * Unified Layout Data Fetch (LEAN)
   * Optimized to minimize RSC payload by only fetching what's needed for the shell.
   */
  static async getWorkspaceLayoutData(workspaceId: string, userId: string) {
    const [
      reportStatus,
      permissions,
      workspacesResult,
    ]: any[] = await Promise.all([
      getDailyReportStatusForUser(workspaceId, userId),
      getWorkspacePermissions(workspaceId, userId, true),
      this.getWorkspaces(userId),
    ]);

    const workspacesData = workspacesResult.workspaces || [];

    return {
      reportStatus,
      permissions,
      workspaces: { workspaces: workspacesData, totalCount: workspacesData.length },
    };
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
              user: { select: { id: true, surname: true } },
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
          user: { select: { id: true, surname: true, image: true } },
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
        if (!pmMap[pm.projectId]) pmMap[pm.projectId] = [];
        // Add to the front of the list, unless already there
        if (!pmMap[pm.projectId].some((u) => u.id === user.id)) {
          pmMap[pm.projectId].unshift(user as any);
        }
      }
    });

    return pmMap;
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

    // Record activity and broadcast update
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
    await recordActivity({
      userId,
      userName: user?.surname || user?.name || "New Member",
      workspaceId,
      action: "MEMBER_UPDATED", // Or a new action like MEMBER_JOINED
      broadcastEvent: "team_update",
    });

    return { success: true, workspaceId };
  }

  /**
   * Get all members with MANAGER role in a workspace
   */
  static async getWorkspaceManagers(workspaceId: string) {
    const managers = await prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        workspaceRole: {
          in: ["MANAGER", "ADMIN", "OWNER"],
        },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            surname: true,
          },
        },
      },
    });

    return managers.map((m) => ({
      id: m.id,
      surname: m.user?.surname || "Unknown",
    }));
  }

  /**
   * Update workspace attendance settings
   */
  static async updateAttendanceSettings(
    workspaceId: string,
    data: {
      lateThreshold: string;
      overtimeThreshold: string;
    },
    actorId: string,
  ) {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        lateThreshold: data.lateThreshold,
        overtimeThreshold: data.overtimeThreshold,
      },
    });

    // Invalidate cache
    await invalidateWorkspace(workspaceId);

    // Record Activity
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, surname: true },
    });
    
    await recordActivity({
      userId: actorId,
      userName: actor?.name || actor?.surname || "Admin",
      workspaceId,
      action: "ATTENDANCE_SETTINGS_UPDATED",
      entityType: "WORKSPACE",
      entityId: workspaceId,
      newData: data,
      broadcastEvent: "workspace_update",
    });

    return workspace;
  }
}
