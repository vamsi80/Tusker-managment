import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getProjectReviewers } from "@/actions/project/get-project-reviewers";

/**
 * Main Hono Application
 * This API is used by both the Web client and Mobile apps.
 */
const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Error Handling
app.onError((err, c) => {
    console.error(`[API_ERROR] ${err.message}`);
    return c.json({ error: "Internal Server Error", message: err.message }, 500);
});

/**
 * Routes
 */

// Project Reviewers
app.get("/projects/:projectId/reviewers", async (c) => {
    const projectId = c.req.param("projectId");

    if (!projectId) {
        return c.json({ error: "Project ID is required" }, 400);
    }

    try {
        const reviewers = await getProjectReviewers(projectId);
        return c.json(reviewers);
    } catch (error) {
        throw new Error("Failed to fetch project reviewers");
    }
});

export default app;
export type AppType = typeof app;
