"use server";

import prisma from "@/lib/db";
import { requireUser } from "@/app/data/user/require-user";

// Get parent tasks with pagination
export async function getProjectTasks(projectId: string, page: number = 1, pageSize: number = 10) {
    const user = await requireUser();

    try {
        const skip = (page - 1) * pageSize;

        // Get total count for pagination
        const totalCount = await prisma.task.count({
            where: {
                projectId: projectId,
                parentTaskId: null,
            },
        });

        // Get tasks for the project (only parent tasks, not subtasks)
        const tasks = await prisma.task.findMany({
            where: {
                projectId: projectId,
                parentTaskId: null, // Only get parent tasks
            },
            include: {
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
                                        id: true,
                                        name: true,
                                        surname: true,
                                        image: true,
                                    },
                                },
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        subTasks: true, // Just get the count, not the actual subtasks
                    },
                },
            },
            orderBy: {
                position: 'asc',
            },
            skip,
            take: pageSize,
        });

        return {
            tasks,
            totalCount,
            totalPages: Math.ceil(totalCount / pageSize),
            currentPage: page,
            hasMore: skip + tasks.length < totalCount,
        };
    } catch (error) {
        console.error("Error fetching project tasks:", error);
        return {
            tasks: [],
            totalCount: 0,
            totalPages: 0,
            currentPage: 1,
            hasMore: false,
        };
    }
}

// Get subtasks for a specific parent task with pagination
export async function getTaskSubTasks(parentTaskId: string, page: number = 1, pageSize: number = 10) {
    const user = await requireUser();

    try {
        const skip = (page - 1) * pageSize;

        // Get total count for pagination
        const totalCount = await prisma.task.count({
            where: {
                parentTaskId: parentTaskId,
            },
        });

        const subTasks = await prisma.task.findMany({
            where: {
                parentTaskId: parentTaskId,
            },
            include: {
                assignee: {
                    include: {
                        workspaceMember: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
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
            skip,
            take: pageSize,
        });

        return {
            subTasks,
            totalCount,
            hasMore: skip + subTasks.length < totalCount,
            currentPage: page,
        };
    } catch (error) {
        console.error("Error fetching subtasks:", error);
        return {
            subTasks: [],
            totalCount: 0,
            hasMore: false,
            currentPage: 1,
        };
    }
}

export type ProjectTasksResponse = Awaited<ReturnType<typeof getProjectTasks>>;
export type ProjectTaskType = ProjectTasksResponse['tasks'];
export type SubTasksResponse = Awaited<ReturnType<typeof getTaskSubTasks>>;
export type SubTaskType = SubTasksResponse['subTasks'];
