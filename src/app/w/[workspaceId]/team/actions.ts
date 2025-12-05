"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { resend } from "@/lib/resend";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { ApiResponse } from "@/lib/types";
import { requireAdmin } from "@/app/data/workspace/requireAdmin";
import { requireUser } from "@/app/data/user/require-user";

/**
 * Invite a user: create auth user, upsert app user, upsert workspace membership,
 * send invite email. Uses a Prisma transaction for DB operations and attempts
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

        await prisma.$transaction([
            prisma.user.upsert({
                where: { id: authUserId },
                create: {
                    id: authUserId,
                    name,
                    email,
                    surname: niceName ?? null,
                    contactNumber: contactNumber ?? null,
                    emailVerified: false,
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

        const verificationLink = `${process.env.BETTER_AUTH_URL}/sign-in?workspaceId=${encodeURIComponent(
            workspaceId
        )}&role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}`;

        console.log("Verification link:", verificationLink);

        await resend.emails.send({
            from: "onboarding@yourdomain.com",
            to: email,
            subject: "You've been invited to join a workspace",
            html: `
        <p>Hi ${name},</p>
        <p>You've been invited to join workspace <strong>${workspaceId}</strong> as <strong>${role}</strong>.</p>
        <p>Click the link below to sign in and join:</p>
        <p><a href="${verificationLink}">Join Workspace</a></p>
      `,
        });

        // Invalidate caches
        revalidatePath(`/w/${workspaceId}/team`);

        // Invalidate the new user's workspace cache and workspace members cache
        const { invalidateUserWorkspaces, invalidateWorkspaceMembers } = await import("@/app/data/user/invalidate-project-cache");
        await invalidateUserWorkspaces(authUserId);
        await invalidateWorkspaceMembers(workspaceId);

        return {
            status: "success",
            message: "Invitation sent successfully",
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

        // 6. Delete the workspace member (cascades to project members)
        await prisma.workspaceMember.delete({
            where: { id: workspaceMemberId },
        });

        // 7. Invalidate caches
        const { revalidateTag } = await import("next/cache");
        revalidateTag(`workspace-members-${workspaceId}`);
        revalidateTag(`user-workspaces-${memberToDelete.userId}`);

        return {
            status: "success",
            message: `Member "${memberToDelete.user?.name}" has been removed from the workspace.`,
        };
    } catch (err) {
        console.error("Error removing workspace member:", err);
        return {
            status: "error",
            message: "An unexpected error occurred while removing the member. Please try again later.",
        };
    }
}
