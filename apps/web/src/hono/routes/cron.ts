import { Hono } from "hono";
import prisma from "@/lib/db";
import { CRON_JOBS } from "../../server/crons/registry";

const cron = new Hono();

// Helper to verify CRON_SECRET
const verifyCronSecret = (c: any) => {
    const authHeader = c.req.header("authorization");
    if (!process.env.CRON_SECRET) return true; // Fail open if no secret set (not recommended but allows local dev)
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
};

/**
 * Trigger a specific job by name
 * POST /api/v1/cron/trigger
 * Body: { job: "reconcileAttendance" }
 */
cron.post("/trigger", async (c) => {
    if (!verifyCronSecret(c)) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const { job } = await c.req.json();
    const handler = CRON_JOBS[job];

    if (!handler) {
        return c.json({ error: `Job '${job}' not found in registry` }, 404);
    }

    try {
        const result = await handler();
        return c.json(result);
    } catch (error: any) {
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * Legacy support for auto-absence (now calls registry)
 */
cron.get("/auto-absence", async (c) => {
    if (!verifyCronSecret(c)) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    const result = await CRON_JOBS.reconcileAttendance();
    return c.json(result);
});

/**
 * Keep-Warm Job
 */
cron.get("/keep-warm", async (c) => {
    try {
        const startTime = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const duration = Date.now() - startTime;

        return c.json({
            status: "ok",
            message: "Database connection kept warm",
            duration: `${duration}ms`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Keep-warm error:", error);
        return c.json({
            status: "error",
            error: String(error),
            timestamp: new Date().toISOString()
        }, 500);
    }
});

export default cron;
