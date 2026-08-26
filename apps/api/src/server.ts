import { serve } from "@hono/node-server";
import app from "./hono";

// Env comes from the repo-root .env via node's --env-file flag (see package.json),
// which loads before any module here evaluates — module imports are hoisted, so
// loading it in this file would run too late for @tusker/core's env validation.
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[API] listening on http://localhost:${info.port}/api/v1`);
});
