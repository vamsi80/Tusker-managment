import prisma from "@/lib/db";
import { generateInviteCode } from "@/utils/get-invite-code";
import { invalidateWorkspacesCache } from "@/data/workspace/get-workspaces";
import { invalidateWorkspace, invalidateUserWorkspaces, invalidateWorkspaceMembers } from "@/lib/cache/invalidation";
import { revalidateTag } from "next/cache";
import { CacheTags } from "@/data/cache-tags";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { auth } from "@/lib/auth";
import { recordActivity } from "@/lib/audit";

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
                    }
                }
            },
        });

        // Invalidate caches
        invalidateWorkspacesCache(data.ownerId);
        (revalidateTag as any)(CacheTags.userWorkspaces(data.ownerId)[0], 'layout');
        (revalidateTag as any)('workspaces', 'layout');

        return workspace;
    }

    /**
     * Update workspace information
     */
    static async updateWorkspace(workspaceId: string, data: {
        name?: string;
        slug?: string;
    }, actorId?: string) {
        const workspace = await prisma.workspace.update({
            where: { id: workspaceId },
            data: data,
        });

        // Revalidate cache
        await invalidateWorkspace(workspaceId);

        // Record Activity
        if (actorId) {
            const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true, surname: true } });
            await recordActivity({
                userId: actorId,
                userName: actor?.name || actor?.surname || "Admin",
                workspaceId,
                action: "WORKSPACE_UPDATED",
                entityType: "WORKSPACE",
                entityId: workspaceId,
                newData: data,
                broadcastEvent: "workspace_update"
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
        (revalidateTag as any)(CacheTags.userWorkspaces(ownerId)[0], 'layout');
        (revalidateTag as any)("workspaces", 'layout');
        const tags = CacheTags.workspace(workspaceId);
        tags.forEach(tag => revalidateTag(tag, "layout" as any));

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
                    }
                }
            }
        });

        return {
            workspaceMembers: workspaceMembers.map(m => ({
                ...m,
                user: m.user ?? undefined
            }))
        };
    }

    /**
     * Invite a new member to the workspace
     */
    static async inviteMember(values: InviteUserSchemaType, actor: { id: string; name: string }) {
        const parsed = inviteUserSchema.safeParse(values);
        if (!parsed.success) {
            throw new Error("Invalid input data");
        }

        const {
            name,
            niceName,
            email,
            password,
            role,
            workspaceId,
            phoneNumber,
        } = parsed.data;

        // 1. Pre-flight checks (Validation BEFORE any side effects)
        // Check Email
        const existingEmailUser = await prisma.user.findUnique({
            where: { email }
        });
        if (existingEmailUser) {
            throw new Error("A user with this email already exists.");
        }

        // Check Phone
        const cleanPhoneNumber = phoneNumber && phoneNumber.trim() !== "" ? phoneNumber.trim() : null;
        if (cleanPhoneNumber) {
            const existingPhoneUser = await prisma.user.findFirst({
                where: { phoneNumber: cleanPhoneNumber }
            });
            if (existingPhoneUser) {
                throw new Error("This phone number is already associated with another account.");
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
                console.error("[WorkspaceService.inviteMember] Transaction Error:", transactionError);
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
                broadcastEvent: "team_update"
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
                            body: { userId: createdAuthUserId }
                        });
                    }
                    
                    // Path B: Direct DB cleanup (Safety net)
                    // We do this outside a transaction to ensure it hits despite previous transaction failures
                    await prisma.user.deleteMany({
                        where: { id: createdAuthUserId }
                    });
                } catch (cleanupErr) {
                    console.error("[WorkspaceService.inviteMember] Cleanup failed:", cleanupErr);
                }
            }
            throw err;
        }
    }

    /**
     * Remove a member from the workspace
     */
    static async removeMember(workspaceId: string, memberId: string, currentUserId: string) {
        // 1. Fetch workspace and members
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                members: {
                    include: {
                        user: {
                            select: { name: true, surname: true }
                        }
                    }
                }
            }
        });

        if (!workspace) {
            throw new Error("Workspace not found");
        }

        const currentMember = workspace.members.find((m) => m.userId === currentUserId);
        if (!currentMember || (currentMember.workspaceRole !== "OWNER" && currentMember.workspaceRole !== "ADMIN")) {
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
            throw new Error("Cannot remove the workspace owner. Transfer ownership first.");
        }

        const adminCount = workspace.members.filter((m) => m.workspaceRole === "ADMIN").length;
        if (memberToDelete.workspaceRole === "ADMIN" && adminCount <= 1) {
            throw new Error("Cannot remove the last admin from the workspace.");
        }

        const userIdToDelete = memberToDelete.userId;
        const userName = memberToDelete.user?.name || memberToDelete.user?.surname || "User";

        // Check if they own other workspaces
        const ownedWorkspaces = await prisma.workspace.count({
            where: {
                ownerId: userIdToDelete,
                id: { not: workspaceId },
            },
        });

        if (ownedWorkspaces > 0) {
            throw new Error(`Cannot delete user "${userName}" because they own other workspaces. Please transfer ownership first.`);
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
                    body: { userId: userIdToDelete }
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
            userName: currentMember?.user?.name || currentMember?.user?.surname || "Someone",
            workspaceId,
            action: "MEMBER_REMOVED",
            entityType: "MEMBER",
            entityId: memberId,
            oldData: { memberId, name: userName },
            broadcastEvent: "team_update"
        });

        return { success: true, message: `User "${userName}" has been completely removed.` };
    }

    /**
     * Update a member's role in the workspace
     */
    static async updateMemberRole(workspaceId: string, memberId: string, role: string, actorId: string) {
        // 1. Fetch member to check constraints
        const member = await prisma.workspaceMember.findUnique({
            where: { id: memberId },
            include: { user: { select: { name: true, surname: true } } }
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
        const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { surname: true } });
        await recordActivity({
            userId: actorId,
            userName: actor?.surname || "Admin",
            workspaceId,
            action: "MEMBER_UPDATED",
            entityType: "MEMBER",
            entityId: memberId,
            newData: { role },
            oldData: { role: member.workspaceRole },
            broadcastEvent: "team_update"
        });

        return { success: true, data: updated };
    }
}
