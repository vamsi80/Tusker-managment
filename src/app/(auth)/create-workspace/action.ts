"use server";

import { PrismaClient } from "@/generated/prisma";
import { ApiResponse } from "@/lib/types";
import { workSpaceSchema, WorkSpaceSchemaType } from "@/lib/zodSchemas";
import { requireUser } from "@/app/data/user/require-user";

const prisma = new PrismaClient();

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
                ownerId: user.id as string,
                members:{
                    create:{
                        userId: user.id as string,
                        role: "ADMIN",
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
