import prisma from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Keep-Warm Cron Job
 * 
 * Prevents Neon database from going to sleep (cold starts).
 * Should be called every 4 minutes via cron service.
 * 
 * Free cron services:
 * - Vercel Cron (if deployed on Vercel)
 * - cron-job.org
 * - UptimeRobot
 */
export async function GET() {
    try {
        const startTime = Date.now();

        // Simple query to keep connection alive
        await prisma.$queryRaw`SELECT 1`;

        const duration = Date.now() - startTime;

        return NextResponse.json({
            status: "ok",
            message: "Database connection kept warm",
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Keep-warm error:", error);
        return NextResponse.json({
            status: "error",
            error: String(error),
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
