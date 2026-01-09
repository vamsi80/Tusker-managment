"use server";

import { cache } from "react";
import prisma from "@/lib/db";

export const getProcurementTasks = cache(async (workspaceId: string) => {
    try {
        const procurementTasks = await prisma.procurementTask.findMany({
            where: { workspaceId },
            include: {
                task: {
                    select: {
                        id: true,
                        name: true,
                        taskSlug: true,
                        status: true,
                        startDate: true,
                        description: true,
                        assignee: {
                            select: {
                                workspaceMember: {
                                    select: {
                                        user: {
                                            select: {
                                                name: true,
                                                image: true,
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return procurementTasks;
    } catch (error) {
        console.error("Error fetching procurement tasks:", error);
        return [];
    }
});

export type ProcurementTaskWithRelations = Awaited<ReturnType<typeof getProcurementTasks>>[number];
