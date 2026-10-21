import { after } from "next/server";
import app from "api";

/**
 * The Hono API (apps/api) mounted into Next.
 *
 * The app is already a plain fetch handler with basePath "/api/v1", so this
 * segment lines up with its own routing and nothing inside it changes. Serving
 * it from the web app keeps /api/v1 same-origin: no CORS preflight, no
 * SameSite=None, and no second deployment to keep in sync. apps/api keeps its
 * node server (src/server.ts) for local work and stands alone if ever needed.
 */

// Reports (exceljs/jspdf) and the AI routes outrun the default limit.
export const maxDuration = 60;

// Hono's c.executionCtx.waitUntil, backed by Next's after(): a route can finish
// work after its response (the DM push that waits to see if it's read) without
// the function being frozen mid-way.
const executionCtx = {
  waitUntil: (promise: Promise<unknown>) => after(promise),
  passThroughOnException: () => {},
  props: {},
};

// This is all hono/vercel's handle() does. Calling app.fetch directly keeps
// `hono` out of this app's manifest, where it would only ever be a dependency
// on that one helper - apps/api already owns it.
const handler = (request: Request) => app.fetch(request, undefined, executionCtx);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
