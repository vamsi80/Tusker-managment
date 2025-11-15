import "server-only";

import prisma from "@/lib/db";
import { notFound } from "next/navigation";

export async function getIndividualCourse(slug: string) {

    const course = await prisma.course.findUnique({
        where: {
            slug: slug,
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
            category: true,
            chapters: {
                select: {
                    id: true,
                    title: true,
                    lessons: {
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            videoKey: true,
                            thumbnailKey: true,
                            position: true,
                        },
                        orderBy: {
                            position: "asc",
                        },
                    },
                },
                orderBy: {
                    position: "asc",
                }
            }
        }
    });

    if (!course) {
        return notFound();
    }

    return course;
}