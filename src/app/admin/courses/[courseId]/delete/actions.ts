"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import prisma from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";

const aj = arcjet
.withRule(
    fixedWindow({
        mode: 'LIVE',
        window: "1m",
        max: 5,
    })
);

export async function deleteCourse(courseId: string): Promise<ApiResponse> {

    const session = await requireAdmin();

    try {
        const req = await request();
        const decision = await aj.protect(req, {
            fingerprint: session.user.id
        });

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
                return {
                    status: "error",
                    message: "Too many requests, please try again later"
                };
            } else {
                return {
                    status: "error",
                    message: "Your are a bot! if this is a mistake please contact support"
                }
            }
        }

        await prisma.course.delete({
            where: {
                id: courseId
            }
        });

        revalidatePath("/admin/courses");

        return {
            status: "success",
            message: "Course deleted successfully"
        };

    } catch (error) {
        console.error("Error deleting course:", error);
        return {
            status: "error",
            message: "Failed to deleting course"
        };
    }
}