
import { getDb } from "@/lib/registry";
import { generateInviteCode } from "@/utils/get-invite-code";
import { inviteUserSchema, InviteUserSchemaType } from "@tusker/shared";
import { getAuth } from "@/lib/registry";
import { recordActivity, broadcastActivity } from "@/lib/audit";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { ProjectService } from "./project";
import { getWorkspaceAuthorities } from "@/lib/involved-users";

export class WorkspaceService {
  /**
   * Create a new workspace
   */
  static async createWorkspace(data: {
    name: string;
    slug: string;
    ownerId: string;
  }) {
    const workspace = await getDb().workspace.create({
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

    // Invalidate caches - Handled via Client Store Real-time

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
    const workspace = await getDb().workspace.update({
      where: { id: workspaceId },
      data: data,
    });

    // Revalidate cache

    // Record Activity
    if (actorId) {
      const actor = await getDb().user.findUnique({
        where: { id: actorId },
        select: { name: true, surname: true },
      });
      await recordActivity(getDb(), {
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
    const workspace = await getDb().workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace || workspace.ownerId !== ownerId) {
      throw new Error("Unauthorized or Workspace not found");
    }

    await getDb().workspace.delete({
      where: { id: workspaceId },
    });

    // Invalidate caches - Handled via Client Store Real-time

    return { success: true };
  }

  /**
   * Get workspace members (paginated)
   */
  static async getMembers(workspaceId: string, page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = { workspaceId };
    if (search && search.trim() !== "") {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { surname: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [workspaceMembers, totalCount] = await Promise.all([
      getDb().workspaceMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { position: "asc" },
          { createdAt: "desc" }
        ],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              phoneNumber: true,
              email: true,
              emailVerified: true,
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
      }),
      getDb().workspaceMember.count({
        where
      })
    ]);

    return {
      workspaceMembers: workspaceMembers.map((m) => ({
        id: m.id,
        name: m.user?.name ?? "",
        surname: m.user?.surname ?? "",
        email: m.user?.email ?? "",
        phoneNumber: m.user?.phoneNumber ?? null,
        designation: m.designation ?? null,
        employeeId: m.employeeId ?? null,
        dateOfBirth: m.dateOfBirth ?? null,
        workspaceRole: m.workspaceRole,
        reportToName: m.reportTo?.user?.surname ?? null,
        reportToId: m.reportToId,
        workspaceId: m.workspaceId,
        userId: m.userId,
        status: m.user?.emailVerified || (m.user as any)?._count?.accounts > 0 ? "Verified" : "Pending",
        emailVerified: m.user?.emailVerified ?? false,
      })),
      totalCount,
    };
  }

  /**
   * Get all workspace members but ONLY minimal fields for filters.
   * This is extremely fast even with 1000+ members.
   */
  static async getMembersSlim(workspaceId: string) {
    const members = await getDb().workspaceMember.findMany({
      where: { workspaceId },
      select: {
        id: true,
        casualLeaveBalance: true,
        sickLeaveBalance: true,
        user: {
          select: {
            surname: true,
            email: true,
          }
        }
      },
      orderBy: [
        { position: "asc" },
        { user: { surname: "asc" } }
      ]
    });

    return members.map(m => ({
      id: m.id,
      surname: m.user?.surname || "Member",
      email: m.user?.email,
      casualLeaveBalance: m.casualLeaveBalance,
      sickLeaveBalance: m.sickLeaveBalance
    }));
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
    const existingEmailUser = await getDb().user.findUnique({
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
      const existingPhoneUser = await getDb().user.findFirst({
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
        await getDb().user.create({
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
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join("");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

      await getDb().verification.create({
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
      const [newMember] = await getDb().$transaction([
        getDb().workspaceMember.create({
          data: {
            userId: authUserId,
            workspaceId,
            workspaceRole: role,
            designation: designation || null,
            reportToId: reportToId || null,
          },
        }),
      ]);

      // 4. Invalidate caches

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
      await recordActivity(getDb(), {
        userId: actor.id,
        userName: actor.name,
        workspaceId,
        action: "MEMBER_INVITED",
        entityType: "MEMBER",
        entityId: newMember.id, // Use the actual WorkspaceMember ID
        newData: {
          email,
          name,
          surname: niceName || "",
          workspaceRole: role,
          designation: designation || null,
          status: "Pending",
          userId: authUserId
        },
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
          if ((getAuth().api as any).deleteUser) {
            await (getAuth().api as any).deleteUser({
              body: { userId: createdAuthUserId },
            });
          }

          // Path B: Direct DB cleanup (Safety net)
          // We do this outside a transaction to ensure it hits despite previous transaction failures
          await getDb().user.deleteMany({
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
    const member = await getDb().workspaceMember.findUnique({
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
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join("");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Clean up old verification records for this email to avoid clutter
    await getDb().verification.deleteMany({
      where: { identifier: member.user.email }
    });

    // ERASE OLD PASSWORD ATTEMPTS & SESSIONS: 
    // If the user hasn't verified their email, we should delete their Account (password) 
    // and any existing sessions to ensure they start fresh when they click the new link.
    await getDb().account.deleteMany({
      where: {
        userId: member.userId,
        providerId: "credential"
      }
    });
    await getDb().session.deleteMany({
      where: { userId: member.userId }
    });

    await getDb().verification.create({
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
    await recordActivity(getDb(), {
      userId: actor.id,
      userName: actor.name,
      action: `RESENT_INVITATION`,
      entityId: member.id,
      workspaceId,
    });

    return { status: "success", message: "Invitation email resent successfully" };
  }

  /**
   * Send password reset email to a member
   */
  static async resetMemberPassword(workspaceId: string, memberId: string, actor: { id: string; name: string }) {
    // 1. Fetch member info
    const member = await getDb().workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        user: true,
      }
    });

    if (!member || member.workspaceId !== workspaceId) {
      throw new Error("Member not found in this workspace.");
    }

    // 2. Trigger password reset through Better Auth
    // We use the email from the user record
    try {
      await (getAuth().api as any).requestPasswordReset({
        body: {
          email: member.user.email,
          redirectTo: "/reset-password",
        }
      });

      // 3. Record Activity
      await recordActivity(getDb(), {
        userId: actor.id,
        userName: actor.name,
        action: "REQUESTED_PASSWORD_RESET",
        entityId: member.id,
        workspaceId,
        newData: { memberName: member.user.name || member.user.email }
      });

      return { status: "success", message: "Password reset email sent successfully" };
    } catch (err: any) {
      console.error("[WorkspaceService.resetMemberPassword] Error:", err);
      throw new Error(err.message || "Failed to send password reset email");
    }
  }

  /**
   * Accept invitation and set password
   */
  static async acceptInvitation(values: any) {
    const { email, token, password, name, niceName } = values;

    // 1. Verify token
    const verification = await getDb().verification.findFirst({
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
    const user = await getDb().user.findUnique({
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

      await getDb().$transaction(async (tx) => {
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
      const userWorkspaces = await getDb().workspaceMember.findMany({
        where: { userId: user.id },
        select: { workspaceId: true }
      });

      for (const uw of userWorkspaces) {
      }


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
    const verification = await getDb().verification.findFirst({
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
    const workspace = await getDb().workspace.findUnique({
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
    const ownedWorkspaces = await getDb().workspace.count({
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
    await getDb().$transaction(async (tx) => {
      await tx.workspaceMember.deleteMany({
        where: { userId: userIdToDelete },
      });
      await tx.user.delete({
        where: { id: userIdToDelete },
      });
    });

    // 3. Delete from Better Auth
    try {
      if ((getAuth().api as any).removeUser) {
        await (getAuth().api as any).removeUser({
          body: { userId: userIdToDelete },
        });
      }
    } catch (authDeleteErr) {
      console.error("Failed to delete auth user:", authDeleteErr);
    }

    // 4. Invalidate caches

    // 5. Record Activity
    await recordActivity(getDb(), {
      userId: currentUserId,
      userName:
        currentMember?.user?.surname || (() => { throw new Error(`User surname missing for member: ${currentMember?.id}`); })(),
      workspaceId,
      action: "MEMBER_REMOVED",
      entityType: "MEMBER",
      entityId: memberId,
      oldData: { id: memberId, name: userName },
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
      employeeId?: string | null;
      dateOfBirth?: Date | string | null;
      reportToId?: string | null;
    },
    actorId: string,
  ) {
    // 1. Fetch member to check constraints
    const member = await getDb().workspaceMember.findUnique({
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
      const existingEmail = await getDb().user.findUnique({
        where: { email: data.email },
      });
      if (existingEmail) {
        throw new Error("This email address is already in use by another user.");
      }
    }

    if (data.phoneNumber && data.phoneNumber !== member.user?.phoneNumber) {
      const existingPhone = await getDb().user.findUnique({
        where: { phoneNumber: data.phoneNumber },
      });
      if (existingPhone) {
        throw new Error("This phone number is already associated with another account.");
      }
    }

    // 3. Execution Transaction
    const result = await getDb().$transaction(async (tx) => {
      // Update User
      await tx.user.update({
        where: { id: userId },
        data: {
          name: data.name,
          surname: data.surname ?? undefined,
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
          employeeId: data.employeeId,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          reportToId: data.reportToId && data.reportToId.trim() !== "" ? data.reportToId : null
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
        const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join("");
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

    // 5. Record Activity
    const actor = await getDb().user.findUnique({
      where: { id: actorId },
      select: { surname: true, name: true },
    });

    const authorities = await getWorkspaceAuthorities(getDb(), workspaceId);
    const targetUserIds = Array.from(new Set([...authorities, userId]));

    await recordActivity(getDb(), {
      userId: actorId,
      userName: actor?.surname || actor?.name || "Admin",
      workspaceId,
      action: "MEMBER_UPDATED",
      entityType: "MEMBER",
      entityId: memberId,
      newData: {
        ...data,
        workspaceRole: data.role,
        emailChanged: isEmailChanged
      },
      oldData: {
        name: member.user?.name,
        surname: member.user?.surname,
        email: member.user?.email,
        phoneNumber: member.user?.phoneNumber,
        designation: member.designation,
        workspaceRole: member.workspaceRole,
        reportToId: member.reportToId
      },
      broadcastEvent: "team_update",
      targetUserIds
    });

    return { success: true, data: result, emailChanged: isEmailChanged };
  }

  /**
   * Get all workspaces for a user
   */
  static async getWorkspaces(userId: string) {
    const workspacesData = await getDb().workspace.findMany({
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
      getDb().workspace.findUnique({
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
      getDb().workspaceMember.findFirst({
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
    return getDb().workspaceMember.findMany({
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
      getDb().workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, name: true },
      }),
      getDb().workspaceMember.findFirst({
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
  static async getUnreadNotificationsCount(workspaceId: string, userId: string, preFetchedPermissions?: any, preFetchedProjectIds?: string[]) {
    const perms = preFetchedPermissions || await getWorkspacePermissions(workspaceId, userId, true);
    if (!perms.workspaceMemberId) return 0;

    const where: any = {
      task: { workspaceId },
      userId: { not: userId },
      readBy: { none: { userId } }
    };

    if (!perms.isWorkspaceAdmin) {
      // Use provided project IDs if available (faster), otherwise fall back to perms
      const privilegedProjectIds = preFetchedProjectIds || [
        ...((perms as any).leadProjectIds || []),
        ...((perms as any).managedProjectIds || []),
        ...((perms as any).coordinatorProjectIds || [])
      ];

      where.task.OR = [
        { assignee: { workspaceMember: { userId } } },
        { createdBy: { workspaceMember: { userId } } },
        { reviewer: { workspaceMember: { userId } } },
        ...(privilegedProjectIds.length > 0
          ? [{ projectId: { in: privilegedProjectIds } }]
          : [])
      ];
    }

    // NOTE: Prisma groupBy uses prepared statements which are incompatible with
    // PgBouncer in transaction mode (Supabase port 6543). Use a raw count instead.
    const unreadResult: Array<{ count: number }> = await (getDb() as any).$queryRawUnsafe(
      `SELECT COUNT(DISTINCT c."taskId")::int AS count
       FROM "comment" c
       JOIN "Task" t ON t.id = c."taskId"
       WHERE t."workspaceId" = $1
         AND c."userId" != $2
         AND NOT EXISTS (
           SELECT 1 FROM "comment_read" cr
           WHERE cr."commentId" = c.id AND cr."userId" = $2
         )`,
      workspaceId,
      userId
    );
    return unreadResult[0]?.count ?? 0;
  }

  /**
   * Unified Layout Data Fetch (LEAN)
   * Optimized to minimize RSC payload by only fetching what's needed for the shell.
   */
  static async getWorkspaceLayoutData(workspaceId: string, userId: string) {
    const _layoutStart = performance.now(); // PERF_TEMP
    // All queries run concurrently — none depend on each other's results.
    // NOTE: unreadNotificationsCount excluded — client fetches it separately via /notifications/unread-count.
    const [
      permissions,
      workspacesResult,
      projects,
      tags,
    ]: any[] = await Promise.all([
      getWorkspacePermissions(workspaceId, userId, false),
      this.getWorkspaces(userId),
      ProjectService.getWorkspaceProjects(workspaceId, userId),
      ProjectService.getWorkspaceTags(workspaceId),
    ]);

    // Step 3: Efficiently construct the project leaders map from the fetched projects
    const pmMap: Record<string, Array<{ id: string; surname: string | null }>> = {};

    projects.forEach((p: any) => {
      const pm = p.projectManager;

      // If a manager is assigned, they MUST have a surname for the UI
      if (pm && !pm.surname && pm.surname !== "System") {
        throw new Error(`Data Integrity Error: Project Manager assigned to project "${p.name}" (${p.id}) is missing a surname.`);
      }

      // Skip "System" user and ensure pm exists
      pmMap[p.id] = (pm && pm.surname !== "System") ? [pm] : [];
    });

    const workspacesData = workspacesResult.workspaces || [];

    console.log(`[DB_TIMING] getWorkspaceLayoutData ${Math.round(performance.now() - _layoutStart)}ms`); // PERF_TEMP
    return {
      permissions,
      workspaces: { workspaces: workspacesData, totalCount: workspacesData.length },
      projects: projects || [],
      tags: tags || [],
      projectManagers: pmMap,
      unreadNotificationsCount: 0,
    };
  }

  /**
   * Get Project Assignments Map
   * Returns a map of projectId -> { id: string, memberId: string, surname: string, role: string }[]
   */
  static async getWorkspaceProjectAssignments(workspaceId: string) {
    const projectMembers = await getDb().projectMember.findMany({
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
   * Verify an invitation and add the user to the workspace
   */
  static async verifyInvitation(workspaceId: string, role: string, userId: string) {
    // Check if user already exists in workspace
    const existingMember = await getDb().workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!existingMember) {
      // Add user to workspace
      await getDb().workspaceMember.create({
        data: {
          workspaceId,
          userId,
          workspaceRole: role as any,
        },
      });
    }

    // Invalidate caches

    // Record activity and broadcast update
    const user = await getDb().user.findUnique({ where: { id: userId }, select: { name: true, surname: true } });
    await recordActivity(getDb(), {
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
    const managers = await getDb().workspaceMember.findMany({
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
      orderBy: { position: "asc" },
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
    const workspace = await getDb().workspace.update({
      where: { id: workspaceId },
      data: {
        lateThreshold: data.lateThreshold,
        overtimeThreshold: data.overtimeThreshold,
      },
    });

    // Invalidate cache

    // Record Activity
    const actor = await getDb().user.findUnique({
      where: { id: actorId },
      select: { name: true, surname: true },
    });

    await recordActivity(getDb(), {
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
