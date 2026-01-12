"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserPermissions } from "@/data/user/get-user-permissions";

const materialItemSchema = z.object({
    materialId: z.string(),
    quantity: z.number(),
    unitId: z.string().optional(),
    estimatedPrice: z.number().optional().nullable(),
    vendorId: z.string().optional().nullable(),
});

const createIndentRequestSchema = z.object({
    workspaceId: z.string(),
    name: z.string().min(3),
    projectId: z.string(),
    taskId: z.string().optional(),
    description: z.string().optional(),
    expectedDelivery: z.date().optional(),
    materials: z.array(materialItemSchema).optional(),
    requiresVendor: z.boolean().default(true),
    assignedTo: z.string(),
});

type CreateIndentRequestInput = z.infer<typeof createIndentRequestSchema>;

export async function createIndentRequest(input: CreateIndentRequestInput) {
    try {
        // Validate input
        const validatedData = createIndentRequestSchema.parse(input);

        // Get authenticated user
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            return { success: false, error: "Unauthorized" };
        }

        const userId = session.user.id;

        // Verify user has access to the workspace
        const workspaceMember = await db.workspaceMember.findFirst({
            where: {
                workspaceId: validatedData.workspaceId,
                userId: userId,
            },
        });

        if (!workspaceMember) {
            return { success: false, error: "You don't have access to this workspace" };
        }


        // Check permissions using the centralized utility
        const permissions = await getUserPermissions(validatedData.workspaceId, validatedData.projectId);

        if (!permissions.isWorkspaceAdmin && !permissions.isProjectLead) {
            return { success: false, error: "Only Admin or Project Lead can create indents for this project" };
        }

        // Verify assignedTo member belongs to workspace
        const itemRequestor = await db.workspaceMember.findUnique({
            where: { id: validatedData.assignedTo }
        });

        if (!itemRequestor || itemRequestor.workspaceId !== validatedData.workspaceId) {
            return { success: false, error: "Invalid assignee selected" };
        }


        // Verify project belongs to workspace
        const project = await db.project.findFirst({
            where: {
                id: validatedData.projectId,
                workspaceId: validatedData.workspaceId,
            },
        });

        if (!project) {
            return { success: false, error: "Invalid project" };
        }

        // If taskId is provided, verify it belongs to the project
        if (validatedData.taskId) {
            const task = await db.task.findFirst({
                where: {
                    id: validatedData.taskId,
                    projectId: validatedData.projectId,
                },
            });

            if (!task) {
                return { success: false, error: "Invalid task" };
            }
        }

        // Generate unique indent key
        const lastIndent = await db.indentDetails.findFirst({
            where: {
                projectId: validatedData.projectId,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: {
                key: true,
            },
        });

        let indentNumber = 1;
        if (lastIndent?.key) {
            const match = lastIndent.key.match(/IND-(\d+)/);
            if (match) {
                indentNumber = parseInt(match[1]) + 1;
            }
        }

        const indentKey = `IND-${indentNumber.toString().padStart(3, "0")}`;

        // Create indent request with status history and items
        const indentRequest = await db.indentDetails.create({
            data: {
                key: indentKey,
                name: validatedData.name,
                projectId: validatedData.projectId,
                taskId: validatedData.taskId || null,
                description: validatedData.description || null,
                expectedDelivery: validatedData.expectedDelivery || null,
                requiresVendor: validatedData.requiresVendor ?? true,
                requestedBy: workspaceMember.id,
                assignedTo: validatedData.assignedTo,
                items: validatedData.materials ? {
                    create: validatedData.materials.map((item) => ({
                        materialId: item.materialId,
                        quantity: item.quantity,
                        unitId: item.unitId,
                        estimatedPrice: item.estimatedPrice || null,
                        vendorId: item.vendorId || null,
                    })),
                } : undefined,

            },
            include: {
                project: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        // Update ProcurementTask status if applicable
        if (validatedData.taskId) {
            await db.procurementTask.updateMany({
                where: { taskId: validatedData.taskId },
                data: { indentCreated: true }
            });
        }

        // Revalidate the procurement page
        revalidatePath(`/w/${validatedData.workspaceId}/procurement`);

        return {
            success: true,
            data: {
                id: indentRequest.id,
                key: indentRequest.key,
                name: indentRequest.name,
            },
        };
    } catch (error) {
        console.error("Error creating indent request:", error);

        if (error instanceof z.ZodError) {
            return { success: false, error: "Invalid input data" };
        }

        return { success: false, error: "Failed to create indent request" };
    }
}
