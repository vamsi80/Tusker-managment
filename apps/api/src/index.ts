import { Hono } from "hono";
import type { StatusCode } from "hono/utils/http-status";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getAuth, runRequestContext, initServices } from "./lib/registry";
import type { Env } from "./types";
import type { HonoVariables } from "./types";
import { authMiddleware } from "./hono/middleware/auth";
import { AppError } from "./lib/errors/app-error";

// Route imports
import cron from "./hono/routes/cron";
import { attendanceRouter } from "./hono/routes/attendance";
import tasks from "./hono/routes/tasks";
import projects from "./hono/routes/projects";
import tags from "./hono/routes/tags";
import workspaces from "./hono/routes/workspaces";
import authRoute from "./hono/routes/auth";
import comments from "./hono/routes/comments";
import reports from "./hono/routes/reports";
import memberTodos from "./hono/routes/member-todos";
import conversations from "./hono/routes/conversations";
import presence from "./hono/routes/presence";
import procurementVendors from "./hono/routes/procurement-vendors";
import procurementIndents from "./hono/routes/procurement-indents";
import procurementRfq from "./hono/routes/procurement-rfq";
import projectMaterials from "./hono/routes/project-materials";
import materials from "./hono/routes/materials";
import board from "./hono/routes/board";

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>().basePath("/api/v1");

// Create a fresh, request-scoped DB connection + auth instance for every request.
// Pusher/Resend are initialized once (HTTP-based, safe to share).
app.use("*", async (c, next) => {
    return runRequestContext(c.env, async () => {
        await next();
    });
});

// Response time header for observability
app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    c.header("X-Response-Time", `${Date.now() - start}ms`);
});

// Logger
app.use("*", logger());

// CORS
app.use("*", cors({
    origin: (origin, c) => {
        const env = c.env as Env;
        const extra = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((o: string) => o.trim()) : [];
        const allowed = [env.APP_URL, ...extra].filter(Boolean);
        if (!origin) return null;
        return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));

// Error handling
app.onError((err, c) => {
    if (err instanceof AppError) {
        return c.json({ success: false, error: err.message, code: err.code }, err.statusCode as StatusCode);
    }
    console.error(`[HONO_ERROR] ${err.message}`, err);
    return c.json({ success: false, error: "Internal Server Error" }, 500);
});

app.notFound((c) => c.json({
    success: false,
    error: "Not Found",
    message: `Route not found: ${c.req.method} ${c.req.url}`,
}, 404));

// Public routes
app.get("/health", (c) => c.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    env: (c.env as Env).ENVIRONMENT,
}));

app.route("/cron", cron);
// Custom public auth endpoints must come BEFORE the Better Auth catch-all
app.route("/auth", authRoute);
// Better Auth catch-all — handles sign-in, sign-up, session, OAuth, OTP, etc.
app.all("/auth/*", async (c) => {
    const auth = getAuth();
    return auth.handler(c.req.raw);
});

// Protected routes
app.use("*", authMiddleware);

app.route("/attendance", attendanceRouter);
app.route("/tasks", tasks);
app.route("/projects", projects);
app.route("/workspace-tags", tags);
app.route("/workspaces", workspaces);
app.route("/comments", comments);
app.route("/reports", reports);
app.route("/member-todos", memberTodos);
app.route("/conversations", conversations);
app.route("/presence", presence);
app.route("/procurement/vendors", procurementVendors);
app.route("/procurement/indents", procurementIndents);
app.route("/procurement/rfq", procurementRfq);
app.route("/projects", projectMaterials);
app.route("/materials", materials);
app.route("/board", board);

// Cloudflare Workers scheduled handler
async function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    initServices(env);
    return runRequestContext(env, async () => {
        const { CRON_JOBS } = await import("./server/crons/registry");
        const results = await Promise.allSettled(
            Object.values(CRON_JOBS).map(job => job())
        );
        results.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`[CRON] Job ${i} failed:`, r.reason);
            }
        });
    });
}

export default {
    fetch: app.fetch,
    scheduled,
};

export type AppType = typeof app;
