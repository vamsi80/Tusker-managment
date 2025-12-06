"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { ApiResponse } from "@/lib/types";
import { requireAdmin } from "@/app/data/workspace/requireAdmin";
import { requireUser } from "@/app/data/user/require-user";

/**
 * Invite a user: create auth user, upsert app user, upsert workspace membership.
 * Better Auth automatically sends verification email on signup.
 * Uses a Prisma transaction for DB operations and attempts
 * to clean up the auth user if DB operations fail.
 */
export async function inviteUserToWorkspace(
    values: InviteUserSchemaType
): Promise<ApiResponse> {

    await requireAdmin(values.workspaceId);

    const parsed = inviteUserSchema.safeParse(values);
    if (!parsed.success) {
        return {
            status: "error",
            message: "Invalid input data",
        };
    }

    const {
        name,
        niceName,
        contactNumber,
        email,
        password,
        role,
        workspaceId,
    } = parsed.data;

    let createdAuthUserId: string | undefined;

    try {
        // Create auth user - Better Auth will automatically send verification email
        // due to emailVerification.sendOnSignUp: true in auth config
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

        // Create user and workspace member records
        await prisma.$transaction([
            prisma.user.upsert({
                where: { id: authUserId },
                create: {
                    id: authUserId,
                    name,
                    email,
                    surname: niceName ?? null,
                    contactNumber: contactNumber ?? null,
                    // Don't manually set emailVerified - Better Auth manages this
                },
                update: {
                    name,
                    surname: niceName ?? null,
                    contactNumber: contactNumber ?? null,
                    email,
                },
            }),

            prisma.workspaceMember.upsert({
                where: {
                    userId_workspaceId: {
                        userId: authUserId,
                        workspaceId,
                    },
                },
                create: {
                    userId: authUserId,
                    workspaceId,
                    workspaceRole: role,
                },
                update: {
                    workspaceRole: role,
                },
            }),
        ]);

        // Better Auth automatically sends verification email on signup
        // The verification email is the only email sent - no separate invitation email

        console.log(`Invitation sent to ${email} for workspace ${workspaceId} as ${role}`);
        console.log("User will receive verification email and must verify before signing in");

        // Invalidate caches
        revalidatePath(`/w/${workspaceId}/team`);

        // Invalidate the new user's workspace cache and workspace members cache
        const { invalidateUserWorkspaces, invalidateWorkspaceMembers } = await import("@/app/data/user/invalidate-project-cache");
        await invalidateUserWorkspaces(authUserId);
        await invalidateWorkspaceMembers(workspaceId);

        return {
            status: "success",
            message: "Invitation sent successfully. User must verify their email before signing in.",
        };
    } catch (err: any) {
        console.error("inviteUserTransactional error:", err);

        // If auth user was created but DB work failed, try to delete the created auth user to avoid orphan accounts
        if (createdAuthUserId) {
            try {
                if ((auth.api as any).deleteUser) {
                    await (auth.api as any).deleteUser({ userId: createdAuthUserId });
                } else if ((auth.api as any).admin?.deleteUser) {
                    await (auth.api as any).admin.deleteUser({ userId: createdAuthUserId });
                } else {
                    console.warn(
                        "No admin deleteUser available on auth.api — manual cleanup may be required for",
                        createdAuthUserId
                    );
                }
            } catch (cleanupErr) {
                console.error("Failed to delete auth user after DB error:", cleanupErr);
            }
        }

        return {
            status: "error",
            message: "Failed to invite user",
        };
    }
}

/**
 * Delete a workspace member and completely remove the user from the system.
 * This includes deleting from: users table, workspace members, project members, tasks, and Better Auth.
 */
export async function deleteWorkspaceMember(
    workspaceMemberId: string,
    workspaceId: string
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        // 1. Check if workspace exists and get member info
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: {
                members: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        if (!workspace) {
            return {
                status: "error",
                message: "Workspace not found.",
            };
        }

        // 2. Check if current user is an admin
        const currentMember = workspace.members.find((m) => m.userId === user.id);
        if (!currentMember || currentMember.workspaceRole !== "ADMIN") {
            return {
                status: "error",
                message: "Only workspace admins can remove members.",
            };
        }

        // 3. Find the member to delete
        const memberToDelete = workspace.members.find((m) => m.id === workspaceMemberId);
        if (!memberToDelete) {
            return {
                status: "error",
                message: "Member not found in this workspace.",
            };
        }

        // 4. Prevent admin from deleting themselves
        if (memberToDelete.userId === user.id) {
            return {
                status: "error",
                message: "You cannot remove yourself from the workspace.",
            };
        }

        // 5. Prevent deletion of workspace owner (creator)
        if (memberToDelete.userId === workspace.ownerId) {
            return {
                status: "error",
                message: "Cannot remove the workspace owner. Transfer ownership first.",
            };
        }

        // 6. Prevent deletion of last admin
        const adminCount = workspace.members.filter((m) => m.workspaceRole === "ADMIN").length;
        if (memberToDelete.workspaceRole === "ADMIN" && adminCount <= 1) {
            return {
                status: "error",
                message: "Cannot remove the last admin from the workspace.",
            };
        }

        const userIdToDelete = memberToDelete.userId;
        const userName = memberToDelete.user?.name || "User";

        // 7. Check if user owns any other workspaces
        const ownedWorkspaces = await prisma.workspace.count({
            where: {
                ownerId: userIdToDelete,
                id: { not: workspaceId },
            },
        });

        if (ownedWorkspaces > 0) {
            return {
                status: "error",
                message: `Cannot delete user "${userName}" because they own other workspaces. Please transfer ownership first.`,
            };
        }

        // 8. Delete the user completely from the system
        // The cascade relationships will handle:
        // - Sessions (onDelete: Cascade)
        // - Accounts (onDelete: Cascade)
        // - WorkspaceMembers (onDelete: Cascade)
        //   - ProjectMembers (onDelete: Cascade via WorkspaceMember)
        //   - Tasks created by this member (onDelete: Cascade via WorkspaceMember)
        // - Workspace ownership (onDelete: Cascade if they own the current workspace)

        await prisma.$transaction(async (tx) => {
            // First, delete all workspace members for this user
            // This will cascade to project members and tasks
            await tx.workspaceMember.deleteMany({
                where: { userId: userIdToDelete },
            });

            // Then delete the user from the users table
            // This will cascade to sessions and accounts
            await tx.user.delete({
                where: { id: userIdToDelete },
            });
        });

        // 9. Delete the user from Better Auth
        try {
            if ((auth.api as any).deleteUser) {
                await (auth.api as any).deleteUser({ userId: userIdToDelete });
            } else if ((auth.api as any).admin?.deleteUser) {
                await (auth.api as any).admin.deleteUser({ userId: userIdToDelete });
            } else {
                console.warn(
                    "No admin deleteUser available on auth.api — auth user may need manual cleanup for",
                    userIdToDelete
                );
            }
        } catch (authDeleteErr) {
            console.error("Failed to delete auth user (user already deleted from DB):", authDeleteErr);
            // Continue anyway since the DB user is already deleted
        }

        // 10. Invalidate caches
        const { revalidateTag } = await import("next/cache");
        revalidateTag(`workspace-members-${workspaceId}`);
        revalidateTag(`user-workspaces-${userIdToDelete}`);

        return {
            status: "success",
            message: `User "${userName}" has been completely removed from the system.`,
        };
    } catch (err) {
        console.error("Error removing workspace member:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while removing the member. Please try again later.",
        };
    }
}
