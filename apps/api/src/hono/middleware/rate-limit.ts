import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env, HonoVariables } from "../../types";

/**
 * Rate limiting backed by the Cloudflare Workers Rate Limiting bindings
 * (configured in wrangler.toml). Two limiters are mounted:
 *
 *  - apiRateLimiter  → all authenticated routes, keyed by user id (reliable
 *    regardless of proxying). Protects against scraping / DB exhaustion.
 *  - authRateLimiter → sensitive public auth + invitation paths only, keyed by
 *    best-effort client IP. Protects against brute force / OTP abuse.
 *
 * Fail-open: if a binding is missing (e.g. local runs without it), requests pass
 * through rather than taking the API down.
 *
 * Caveat: browser auth traffic is proxied through the web app's Next.js rewrites,
 * so the Worker's `cf-connecting-ip` is the proxy's IP. We therefore prefer the
 * forwarded client IP. This is best-effort and spoofable by clients hitting the
 * Worker directly — edge rate limiting (Cloudflare WAF / Vercel) on the true
 * client IP is the recommended defense-in-depth follow-up.
 */

function clientIp(c: Context): string {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return c.req.header("cf-connecting-ip") ?? "unknown";
}

function tooManyRequests(c: Context, retryAfterSeconds = 60) {
    c.header("Retry-After", String(retryAfterSeconds));
    return c.json(
        { success: false, error: "Too many requests", code: "RATE_LIMITED" },
        429,
    );
}

/**
 * Sensitive Better Auth + custom auth paths worth throttling. Deliberately
 * EXCLUDES `/auth/get-session` (hit on nearly every server render) and OAuth
 * callbacks, which would cause false positives under the Vercel proxy.
 * Matched with `endsWith` so the `/api/v1` basePath prefix is irrelevant.
 */
const SENSITIVE_AUTH_PATHS = [
    "/sign-in/email",
    "/sign-up/email",
    "/forget-password",
    "/reset-password",
    "/email-otp/send-verification-otp",
    "/phone-number/send-otp",
    "/verify-invitation",
    "/accept-invitation",
];

export const authRateLimiter = createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const limiter = c.env.AUTH_RATE_LIMITER;
    const isSensitive = SENSITIVE_AUTH_PATHS.some((p) => c.req.path.endsWith(p));
    if (!limiter || !isSensitive) return next();

    const { success } = await limiter.limit({ key: `auth:${clientIp(c)}` });
    if (!success) return tooManyRequests(c);
    return next();
});

export const apiRateLimiter = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(async (c, next) => {
    const limiter = c.env.API_RATE_LIMITER;
    if (!limiter) return next();

    const user = c.get("user") as { id?: string } | undefined;
    const key = user?.id ? `user:${user.id}` : `ip:${clientIp(c)}`;
    const { success } = await limiter.limit({ key });
    if (!success) return tooManyRequests(c);
    return next();
});
