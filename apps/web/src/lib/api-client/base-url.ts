/**
 * Resolve the Worker API base (`…/api/v1`) for server-side fetches.
 *
 * Server-side fetches (RSC, route handlers) bypass Next.js rewrites, so they
 * must hit the Worker's absolute URL directly. In development that is always the
 * local Worker over HTTP, so the session-cookie host matches the browser's.
 */
export function getApiBaseUrl(): string {
    // In development always use the local worker — server-side fetches bypass Next.js
    // rewrites, so using the production Worker URL here would hit the wrong host and
    // fail session validation (different cookie names, secrets, etc.).
    if (process.env.NODE_ENV !== "production") {
        return "http://localhost:8787/api/v1";
    }
    const host =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.NEXT_PUBLIC_CF_WORKER_URL ||
        "http://localhost:8787";
    return `${host}/api/v1`;
}
