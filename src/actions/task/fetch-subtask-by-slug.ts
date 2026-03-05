"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/lib/auth/require-user";

export async function fetchSubTaskBySlugAction(workspaceId: string, slugOrId: string) {
    try {
        const user = await requireUser();

        // Check if user is a member of the workspace
        const member = await prisma.workspaceMember.findFirst({
            where: {
                workspaceId,
                userId: user.id
            }
        });

        if (!member) {
            return { success: false, error: "Access denied" };
        }

        // Fetch task by ID or Slug
        const task = await prisma.task.findFirst({
            where: {
                workspaceId,
                OR: [
                    { id: slugOrId },
                    { taskSlug: slugOrId }
                ]
            },
            include: {
                assignee: {
                    select: {
                        id: true,
                        // name: true,
                        surname: true,
                        // image: true
                    }
                },
                tag: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        workspaceId: true
                    }
                },
                parentTask: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true
                    }
                },
                _count: {
                    select: {
                        reviewComments: true
                    }
                }
            }
        });

        if (!task) {
            return { success: false, error: "Task not found" };
        }

        return {
            success: true,
            subTask: task
        };

    } catch (error) {
        console.error("Error fetching subtask by slug:", error);
        return { success: false, error: "Internal server error" };
    }
}
