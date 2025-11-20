"use server";

import { PrismaClient } from "@/generated/prisma";
import { ApiResponse } from "@/lib/types";
import { projectSchema, ProjectSchemaType } from "@/lib/zodSchemas";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { requireUser } from "@/app/data/user/require-user";

const prisma = new PrismaClient();

const aj = arcjet.withRule(
    fixedWindow({
        mode: 'LIVE',
        window: "1m",
        max: 5,
    })
);

export async function createProject(values: ProjectSchemaType): Promise<ApiResponse> {

    const session = await requireUser();

    try {
        const req = await request();
        const decision = await aj.protect(req, {
            fingerprint: session.id
        });

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
                return {
                    status: "error",
                    message: "Too many requests, please try again later"
                }
            } else {

                return {
                    status: "error",
                    message: "Your are a bot! if this is a mistake please contact support"
                }
            }
        }

        const validation = projectSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: values?.workspaceId },
            include: {
                projects: { select: { id: true } },
            },
        });

        const validatedData = projectSchema.parse(values);

        const workspaceMembers = await prisma.workspaceMember.findMany({
            where: {
                workspaceId: values.workspaceId,
            },
        });

        const isUserMember = workspaceMembers.some(
            (member) => member.userId === session.id
        );

        if (!isUserMember) {
            throw new Error("Unauthorized to create project in this workspace.");
        }

        if (validatedData.memberAccess?.length === 0) {
            validatedData.memberAccess = [session.id];
        } else if (!validatedData.memberAccess?.includes(session.id)) {
            validatedData?.memberAccess?.push(session.id);
        }

        await prisma.project.create({
            data: {
                ...validation.data,
                members: {
                    create: validatedData.memberAccess?.map((userId) => ({
                        workspaceMemberId: workspaceMembers.find(
                            (member) => member.userId === userId
                        )?.id!,
                        hasAccess: true,
                        user:{
                            connect: {
                                id: userId
                            }
                        }
                    })),
                }
            },
        });

        return {
            status: "success",
            message: "Course created successfully",
        };
    } catch {
        return {
            status: "error",
            message: "Error creating course",
        }
    }
}
