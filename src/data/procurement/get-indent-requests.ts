import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export async function getIndentRequests(workspaceId: string) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user?.id) {
            throw new Error("Unauthorized");
        }

        const userId = session.user.id;

        // Verify user has access to workspace
        const workspaceMember = await db.workspaceMember.findFirst({
            where: {
                workspaceId: workspaceId,
                userId: userId,
            },
        });

        if (!workspaceMember) {
            throw new Error("Access denied");
        }

        // Fetch indent requests with only indent-level details
        const indentRequests = await db.indentDetails.findMany({
            where: {
                project: {
                    workspaceId: workspaceId,
                },
            },
            select: {
                id: true,
                key: true,
                name: true,
                projectId: true,
                taskId: true,
                expectedDelivery: true,
                assignedTo: true,
                description: true,
                requiresVendor: true,
                createdAt: true,
                project: {
                    select: {
                        id: true,
                        name: true,
                        workspaceId: true,
                    },
                },
                task: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                    },
                },
                assignee: {
                    select: {
                        id: true,
                        user: {
                            select: {
                                name: true,
                                image: true,
                            },
                        },
                    },
                },
                // Include items only for edit functionality
                items: {
                    select: {
                        id: true,
                        materialId: true,
                        quantity: true,
                        unitId: true,
                        vendorId: true,
                        estimatedPrice: true,
                        status: true,
                        material: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        unit: {
                            select: {
                                id: true,
                                abbreviation: true,
                            },
                        },
                        vendor: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        return {
            indentRequests,
            workspaceMember,
        };
    } catch (error) {
        console.error("Error fetching indent requests:", error);
        throw error;
    }
}

// Type now exported from @/data/procurement
