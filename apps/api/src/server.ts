import { serve } from "@hono/node-server";
import app from "./hono";

// Env comes from the repo-root .env via node's --env-file flag (see package.json),
// which loads before any module here evaluates — module imports are hoisted, so
// loading it in this file would run too late for @tusker/core's env validation.
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[API] listening on http://localhost:${info.port}/api/v1`);
});

// Without this, a port clash surfaces through tsx/pnpm as a bare exit code
// (4294967295 on Windows) with the real cause scrolled off screen.
server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
        console.error(
            `\n[API] Port ${port} is already in use — another API process is probably still running.\n` +
            `      Stop it, or start this one on a different port with API_PORT=4001.\n` +
            `      Windows: netstat -ano | findstr :${port}   then: taskkill /PID <pid> /F\n`
        );
        process.exit(1);
    }
    throw err;
});
