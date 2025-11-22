"use server";

import prisma from "@/lib/db"; // use the shared client
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";

export async function createNewProject(values: ProjectSchemaType): Promise<ApiResponse> {
    const user = await requireUser();

    // validation
    const validation = projectSchema.safeParse(values);
    if (!validation.success) {
        return {
            status: "error",
            message: "Invalid form data"
        };
    }

    if (!values?.workspaceId) {
        return {
            status: "error",
            message: "Invalid workspace id"
        };
    }

    try {
        // load workspace with members (so we ensure the workspace exists and fetch its members)
        const workspace = await prisma.workspace.findUnique({
            where: { id: values.workspaceId },
            include: {
                members: {
                    include: { user: true }, // so we can inspect userId if needed
                },
            },
        });

        if (!workspace) {
            return { status: "error", message: "Workspace not found" };
        }

        const workspaceMembers = workspace.members; // array of WorkspaceMember

        if (!workspaceMembers || workspaceMembers.length === 0) {
            return {
                status: "error",
                message: "No workspace members found for this workspace.",
            };
        }

        // check user is a member
        const isUserMember = workspaceMembers.some((m) => m.userId === user.id);
        if (!isUserMember) {
            return {
                status: "error",
                message: "Unauthorized to create project in this workspace.",
            };
        }

        // ensure memberAccess contains the current user
        if (!values.memberAccess || values.memberAccess.length === 0) {
            values.memberAccess = [user.id];
        } else if (!values.memberAccess.includes(user.id)) {
            values.memberAccess.push(user.id);
        }

        // map provided userIds (values.memberAccess) -> workspaceMemberId,
        // but only for those that actually exist in this workspace
        const workspaceMemberMap = new Map<string, string>(); // userId -> workspaceMemberId
        for (const wm of workspaceMembers) {
            workspaceMemberMap.set(wm.userId, wm.id);
        }

        const projectAccessCreates = values.memberAccess
            .map((userId) => {
                const wmId = workspaceMemberMap.get(userId);
                if (!wmId) return null; // skip userIds that are not workspace members
                return { workspaceMemberId: wmId, hasAccess: true };
            })
            .filter(Boolean) as { workspaceMemberId: string; hasAccess: boolean }[];

        // fail if no valid memberAccess could be resolved (shouldn't happen because current user is included)
        if (projectAccessCreates.length === 0) {
            return {
                status: "error",
                message: "No valid workspace members found for the provided memberAccess list.",
            };
        }

        // create project and related ProjectAccess rows inside a transaction
        await prisma.$transaction([
            prisma.project.create({
                data: {
                    name: validation.data.name,
                    description: validation.data.description ?? null,
                    workspaceId: values.workspaceId,
                    projectAccess: {
                        create: projectAccessCreates,
                    },
                },
            }),
        ]);

        return {
            status: "success",
            message: "Project created successfully"

        };
    } catch (err) {
        console.error("createNewProject error:", err);
        return {
            status: "error",
            message: "Something went wrong while creating the project.",
        };
    }
}
