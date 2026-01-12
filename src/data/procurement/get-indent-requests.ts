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

        // Fetch indent requests
        const indentRequests = await db.indentDetails.findMany({
            where: {
                project: {
                    workspaceId: workspaceId,
                },
            },
            include: {
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
                requestor: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                image: true,
                            },
                        },
                    },
                },
                items: {
                    include: {
                        material: {
                            select: {
                                id: true,
                                name: true
                            }
                        },
                        unit: {
                            select: {
                                abbreviation: true
                            }
                        },
                        vendor: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                assignee: {
                    select: {
                        user: {
                            select: {
                                name: true,
                                image: true,
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

export type IndentRequestWithRelations = Awaited<ReturnType<typeof getIndentRequests>>["indentRequests"][number];
