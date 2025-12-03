"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

export async function getProjectTasks(projectId: string) {
    const user = await requireUser();

    try {
        // Get tasks for the project (only parent tasks, not subtasks)
        const tasks = await prisma.task.findMany({
            where: {
                projectId: projectId,
                parentTaskId: null, // Only get parent tasks
            },
            include: {
                subTasks: {
                    include: {
                        assignee: {
                            include: {
                                workspaceMember: {
                                    include: {
                                        user: {
                                            select: {
                                                name: true,
                                                surname: true,
                                                image: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        position: 'asc',
                    },
                },
                createdBy: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                surname: true,
                                image: true,
                            },
                        },
                    },
                },
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: {
                position: 'asc',
            },
        });

        return tasks;
    } catch (error) {
        console.error("Error fetching project tasks:", error);
        return [];
    }
}

export type ProjectTaskType = Awaited<ReturnType<typeof getProjectTasks>>;

