import { createMiddleware } from "hono/factory";
import { HonoVariables } from "../types";
import { AppError } from "@/lib/errors/app-error";
import { getWorkspacePermissions } from "@/data/user/get-user-permissions";
import type { Capability } from "@/lib/constants/capabilities";

/**
 * Enforces a Settings -> Permissions capability across a whole router.
 *
 * Mounted on the router rather than added per-endpoint on purpose: the
 * procurement routes resolve their workspace id in several different shapes, and
 * a per-endpoint check is one forgotten handler away from an open door.
 *
 * Requests that carry no workspace id are passed through — those endpoints scope
 * themselves some other way and run their own checks.
 */
async function workspaceIdFromRequest(c: any): Promise<string | null> {
    const fromQuery = c.req.query("w") || c.req.query("workspaceId");
    if (fromQuery) return fromQuery;

    const fromParam = c.req.param("workspaceId");
    if (fromParam) return fromParam;

    // Body reads are cached by Hono, so the handler can still call c.req.json().
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
        try {
            const body = await c.req.json();
            const id = body?.workspaceId;
            if (typeof id === "string" && id) return id;
        } catch {
            // No JSON body (form upload, empty DELETE) — nothing to read.
        }
    }

    return null;
}

export const requireCapability = (capability: Capability, message: string) =>
    createMiddleware<{ Variables: HonoVariables }>(async (c, next) => {
        const user = c.get("user");
        const workspaceId = await workspaceIdFromRequest(c);

        if (workspaceId && user?.id) {
            const permissions = await getWorkspacePermissions(workspaceId, user.id, true);
            if (!permissions.capabilities?.[capability]) {
                throw AppError.Forbidden(message);
            }
        }

        await next();
    });
