import "server-only";
import { requireAdmin } from "./require-admin";
import prisma from "@/lib/db";
import { notFound } from "next/navigation";
export async function adminGetCourse(id: string) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await requireAdmin();

    const data = await prisma.course.findUnique({
        where: {
            id: id
        },
        select: {
            id: true,
            title: true,
            description: true,
            smallDescription: true,
            duration: true,
            level: true,
            status: true,
            price: true,
            fileKey: true,
            slug: true,
            category: true,
            chapters: {
                select: {
                    id: true,
                    title: true,
                    position: true,
                    lessons: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            thumbnailKey: true,
                            videoKey: true,
                            position: true

                        }
                    }
                }
            }
        }
    });

    if (!data) {
        return notFound();
    }

    return data
}

export type AdminCourseType = Awaited<ReturnType<typeof adminGetCourse>>
