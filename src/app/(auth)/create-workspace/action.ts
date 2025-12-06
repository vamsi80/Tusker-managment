"use server";

import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { workSpaceSchema, WorkSpaceSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";
import { generateInviteCode } from "@/utils/get-invite-code";

export async function createWorkSpace(values: WorkSpaceSchemaType): Promise<ApiResponse> {

    const user = await requireUser();

    try {
        const validation = workSpaceSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        await prisma.workspace.create({
            data: {
                ...validation.data,
                ownerId: user.id,
                inviteCode: generateInviteCode(),
                members: {
                    create: {
                        userId: user.id,
                        workspaceRole: "ADMIN",
                    }
                }
            },
        });

        return {
            status: "success",
            message: "Workspace created successfully",
        };

    } catch {
        return {
            status: "error",
            message: "Login before creating workspace",
        }
    }
}

export async function getUserWorkspaces() {
    const userWorkspace = await getUserWorkspaces();

    if (!userWorkspace) {
        return {
            status: "error",
            message: "You don't have any workspace.",
            workspaces: [],
        };
    }
}
