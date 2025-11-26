import { requireUser } from "../user/require-user";
import prisma from "@/lib/db";
import { notFound } from "next/navigation";

export const getProjectDetails = async (projectId: string) => {
    await requireUser()
    const data = await prisma.project.findMany({
        where: {
            id: projectId
        },
        select: {
            id: true,
            name: true,
            tasks: {
                select:{
                    id: true,
                    name: true,
                    subTasks:{
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            createdAt: true,
                            dueDate: true,
                            priority: true,
                            status: true
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: "desc",
        },
    })
    if (!data) {
        return notFound();
    }
    return data;
}

export type ProjectDetailsType = Awaited<ReturnType<typeof getProjectDetails>>;
