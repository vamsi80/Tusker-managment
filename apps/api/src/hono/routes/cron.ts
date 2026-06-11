import { Hono } from "hono";
import type { Context } from "hono";
import { getDb } from "@/lib/registry";
import { CRON_JOBS } from "../../server/crons/registry";
import type { Env } from "../../types";

const cron = new Hono<{ Bindings: Env }>();

const verifyCronSecret = (c: Context<{ Bindings: Env }>) => {
    const authHeader = c.req.header("authorization");
    const secret = c.env?.CRON_SECRET;
    if (!secret) return false; // fail-closed: deny all if secret not configured
    return authHeader === `Bearer ${secret}`;
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
    } catch (error: unknown) {
        return c.json({ success: false, error: (error as { message?: string }).message ?? "An error occurred" }, 500);
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
        await getDb().$queryRaw`SELECT 1`;
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
