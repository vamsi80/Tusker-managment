"use server";

import { PrismaClient } from "@/generated/prisma";
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";

const prisma = new PrismaClient();

export async function createNewProject(values: ProjectSchemaType): Promise<ApiResponse> {

    const user = await requireUser();

    try {
        const validation = projectSchema.safeParse(values);

        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        if(!values?.workspaceId){
            return {
                status: "error",
                message: "Invalid workspace id"
            }
        }

        // const workspace = await prisma.workspace.findUnique({
        //     where: {
        //         id: values.workspaceId
        //     },
        //     include: {
        //         projects: {
        //             select: {
        //                 id: true,
        //             }
        //         },
        //     },
        // });

        const workspaceMembers = await prisma.workspaceMember.findMany({
            where: {
                workspaceId: values.workspaceId,
            },
        });

        const isUserMember = workspaceMembers.some(
            (member) => member.userId === user.id
        );

        if (!isUserMember) {
            return {
                status: "error",
                message: "Unauthorized to create project in this workspace.",
            }
        }

        if (values.memberAccess?.length === 0) {
            values.memberAccess = [user.id];
        } else if (!values.memberAccess?.includes(user.id)) {
            values.memberAccess?.push(user.id);
        }

        await prisma.project.create({
            data: {
                ...validation.data,
                workspaceId: values.workspaceId,
                projectAccess: {
                    create: values.memberAccess?.map((userId) => ({
                        workspaceMemberId: workspaceMembers.find(
                            (member) => member.userId === userId
                        )?.id!,
                        hasAccess: true,
                    })),
                },
            },
        });

        return {
            status: "success",
            message: "project created successfully",
        };

    } catch {
        return {
            status: "error",
            message: "Somting went wrong, please try again later",
        }
    }
}
