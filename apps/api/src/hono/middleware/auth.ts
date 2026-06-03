import { createMiddleware } from "hono/factory";
import { getAuth } from "../../lib/registry";
import type { Env } from "../../types";

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: any }>(async (c, next) => {
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

        c.set("user" as any, session.user);
        c.set("session" as any, session.session);

        await next();
    } catch (error) {
        console.error("[AUTH_MIDDLEWARE_ERROR]", error);
        return c.json({ success: false, error: "Authentication error" }, 500);
    }
});
