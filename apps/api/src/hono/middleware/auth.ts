import { createMiddleware } from "hono/factory";
import { getAuth } from "../../lib/registry";
import type { Env } from "../../types";

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: any }>(async (c, next) => {
    try {
        const cookie = c.req.header("cookie");
        console.log(`[authMiddleware] Incoming: ${c.req.method} ${c.req.url}`);
        console.log(`[authMiddleware] Cookie header: ${cookie ? cookie.substring(0, 100) + "..." : "undefined"}`);
        
        const session = await getAuth().api.getSession({
            headers: c.req.raw.headers,
        });

        console.log(`[authMiddleware] Session found: ${session ? "YES (User: " + session.user.id + ")" : "NO"}`);

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
