"use server";

import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { inviteUserSchema, InviteUserSchemaType } from "@/lib/zodSchemas";
import { broadcastTeamUpdate } from "@/lib/realtime";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

/**
 * Shared logic to invite a user to a workspace.
 * Used by both Server Actions and API Route Handlers.
 */
export async function inviteMemberAction(
    values: InviteUserSchemaType
): Promise<ApiResponse> {
    const permissions = await getWorkspacePermissions(values.workspaceId);
    if (!permissions.isWorkspaceAdmin) {
        return { status: "error", message: "Only workspace admins can invite members." };
    }

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
        email,
        password,
        role,
        workspaceId,
        phoneNumber,
    } = parsed.data;

    let createdAuthUserId: string | undefined;

    try {
        // Create auth user
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
                    phoneNumber: phoneNumber ?? null,
                },
                update: {
                    name,
                    surname: niceName ?? null,
                    phoneNumber: phoneNumber ?? null,
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

        // Invalidate caches
        revalidatePath(`/w/${workspaceId}/team`);
        const { invalidateUserWorkspaces, invalidateWorkspaceMembers } = await import('@/lib/cache/invalidation');
        await invalidateUserWorkspaces(authUserId);
        await invalidateWorkspaceMembers(workspaceId);

        // Broadcast real-time update
        broadcastTeamUpdate({
            workspaceId,
            type: "INVITE",
            payload: { email, name, role },
        });

        return {
            status: "success",
            message: "Invitation sent successfully.",
        };
    } catch (err: any) {
        console.error("inviteMemberAction error:", err);

        // Cleanup auth user on failure
        if (createdAuthUserId) {
            try {
                if ((auth.api as any).deleteUser) {
                    await (auth.api as any).deleteUser({ userId: createdAuthUserId });
                } else if ((auth.api as any).admin?.deleteUser) {
                    await (auth.api as any).admin.deleteUser({ userId: createdAuthUserId });
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
