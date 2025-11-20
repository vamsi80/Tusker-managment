import "server-only";

import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { requireUser } from "../user/require-user";

export async function adminGetprojects(id: string) {

    await requireUser();

    const data = await prisma.project.findUnique({
        where: {
            id: id,
        },
        select: {
            name: true,
            id: true,
            description: true,
            fileKey: true,
            start_date: true,
            end_date: true,
            status: true,
        }
    });

    if(!data) {
        return notFound();
    }

    return data;
}

export type AdminProjectsType = Awaited<ReturnType<typeof adminGetprojects>>;
