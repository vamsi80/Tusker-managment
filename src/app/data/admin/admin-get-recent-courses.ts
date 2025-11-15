import "server-only";

import prisma from "@/lib/db";
import { requireAdmin } from "./require-admin";

export async function getRecentCourses() {
    await requireAdmin();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const data = await prisma.course.findMany({
        orderBy: {
            createdAt: 'desc'
        },

        take: 2,

        select: {
            id: true,
            title: true,
            smallDescription: true,
            duration: true,
            level: true,
            status: true,
            price: true,
            fileKey: true,
            slug: true,
        },
    })
    return data;
}