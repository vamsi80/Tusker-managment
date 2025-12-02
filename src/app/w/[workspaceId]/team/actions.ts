"use server";

import { revalidatePath } from "next/cache";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { resend } from "@/lib/resend";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { ApiResponse } from "@/lib/types";
import { requireAdmin } from "@/app/data/workspace/requireAdmin";

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
