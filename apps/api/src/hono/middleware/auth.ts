import { createMiddleware } from "hono/factory";
import { getAuth } from "../../lib/registry";
import type { Env, HonoVariables, TuskerUser } from "../../types";

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: HonoVariables }>(async (c, next) => {
    try {
        const session = await getAuth().api.getSession({
            headers: c.req.raw.headers,
        });

        if (!session || !session.user) {
            return c.json({
                success: false,
                error: "Unauthorized",
                message: "Valid session or bearer token required",
            }, 401);
        }

        c.set("user", session.user as unknown as TuskerUser);
        c.set("session", session.session);

        await next();
    } catch (error) {
        const err = error as Error;
        // A thrown getSession() is an infra error (e.g. DB connect timeout), NOT a
        // missing session — so it correctly stays a 500. Log enough context to tell
        // these apart in Workers logs (was previously an undiagnosable bare object).
        console.error(
            "[AUTH_MIDDLEWARE_ERROR]",
            JSON.stringify({
                method: c.req.method,
                path: c.req.path,
                hasCookie: Boolean(c.req.header("cookie")),
                hasAuthHeader: Boolean(c.req.header("authorization")),
                name: err?.name,
                message: err?.message,
            }),
            err?.stack,
        );
        return c.json({ success: false, error: "Authentication error" }, 500);
    }
});
