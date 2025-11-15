"use server";


import { auth } from "@/lib/auth";
// import prisma from "@/lib/db";
import { PrismaClient } from "@/generated/prisma";
import { ApiResponse } from "@/lib/types";
import { courseSchema, CourseSchemaType } from "@/lib/zodSchemas";
import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { request } from "@arcjet/next";
import { stripe } from "@/lib/stripe";

const prisma = new PrismaClient();

const aj = arcjet.withRule(
    fixedWindow({
        mode: 'LIVE',
        window: "1m",
        max: 5,
    })
);

export async function createCourse(values: CourseSchemaType): Promise<ApiResponse> {

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
                }
            } else {

                return {
                    status: "error",
                    message: "Your are a bot! if this is a mistake please contact support"
                }
            }
        }

        const validation = courseSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid validation form data"
            }
        }

        const data = await stripe.products.create({
            name: validation.data.title,
            description: validation.data.smallDescription,
            default_price_data: {
                currency: "inr",
                unit_amount: validation.data.price * 100
            }
        });

        await prisma.course.create({
            data: {
                ...validation.data,
                userId: session?.user.id as string,
                stripePriceId: data.default_price as string,
            },
        });

        return {
            status: "success",
            message: "Course created successfully",
        };
    } catch {
        return {
            status: "error",
            message: "Error creating course",
        }
    }
}
