import { Hono } from "hono";
import { getDb } from "@/lib/registry";
import { CRON_JOBS } from "../../server/crons/registry";

const cron = new Hono();

const verifyCronSecret = (c: any) => {
    const authHeader = c.req.header("authorization");
    const secret = c.env?.CRON_SECRET || "";
    if (!secret) return true;
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
