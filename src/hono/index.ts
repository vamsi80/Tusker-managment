import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import cron from "./routes/cron";
import units from "./routes/units";
import { attendanceRouter } from "./routes/attendance";
import tasks from "./routes/tasks";
import projects from "./routes/projects";
import tags from "./routes/tags";
import workspaces from "./routes/workspaces";
import { HonoVariables } from "./types";
import { authMiddleware } from "./middleware/auth";
import { AppError } from "../lib/errors/app-error";

/**
 * Main Hono Application
 * basePath: /api/v1
 */
const app = new Hono<{ Variables: HonoVariables }>().basePath("/api/v1");

// Global Middleware
app.use("*", logger());

// CORS Configuration
app.use(
    "*",
    cors({
        origin: (origin) => {
            if (process.env.NODE_ENV === "development") return origin;
            const allowed = [process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
            return allowed.includes(origin) ? origin : allowed[0];
        },
        credentials: true,
    })
);

/**
 * Global Error Handling
 */
app.onError((err, c) => {
    console.error(`[HONO_ERROR] ${err.message}`, err);

    if (err instanceof AppError) {
        return c.json(
            {
                success: false,
                error: err.message,
                code: err.code,
            },
            err.statusCode as any
        );
    }

    return c.json(
        {
            success: false,
            error: err.message || "Internal Server Error",
        },
        500
    );
});

/**
 * Public Routes (No Auth Required)
 */

// Health Check
app.get("/health", (c) => {
    return c.json({
        success: true,
        status: "ok",
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV,
    });
});

// Cron Job Routes (Secret-based Auth)
app.route("/cron", cron);

/**
 * Protected Routes (Auth Middleware Applied)
 */
app.use("*", authMiddleware);

// Units API
app.route("/units", units);

// Attendance API
app.route("/attendance", attendanceRouter);

// Tasks API
app.route("/tasks", tasks);

// Projects API
app.route("/projects", projects);

// Tags API
app.route("/tags", tags);

// Workspaces API
app.route("/workspaces", workspaces);


export default app;
export type AppType = typeof app;
