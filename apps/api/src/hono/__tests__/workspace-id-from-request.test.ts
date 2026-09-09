import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { workspaceIdFromRequest } from "../middleware/capability";

/**
 * The mobile app sends the workspace id in the request body, the web app sends
 * it in the `x-workspace-id` header. /attendance/check-out read only the header,
 * so every mobile check-out answered "Workspace ID is required".
 *
 * These cover each shape a client actually uses, and the body-caching assumption
 * the check-in/check-out handlers depend on.
 */
describe("workspaceIdFromRequest", () => {
    // Mirrors the attendance handlers: resolve the id, then read the body.
    const app = new Hono()
        .get("/r", async (c) => c.json({ workspaceId: await workspaceIdFromRequest(c) }))
        .post("/r", async (c) => {
            const workspaceId = await workspaceIdFromRequest(c);
            const body = await c.req.json().catch(() => null);
            return c.json({ workspaceId, body });
        });

    const post = (body: unknown, headers: Record<string, string> = {}) =>
        app.request("/r", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(body),
        });

    it("reads the id from the body (the mobile check-out shape)", async () => {
        const res = await post({ workspaceId: "ws_mobile", latitude: 1, longitude: 2 });

        expect(await res.json()).toMatchObject({ workspaceId: "ws_mobile" });
    });

    it("leaves the body readable for the handler after resolving", async () => {
        const res = await post({ workspaceId: "ws_mobile", latitude: 12.9, longitude: 77.6 });
        const json = (await res.json()) as { body: { latitude: number; longitude: number } };

        // check-in/check-out parse the body themselves; a consumed stream would
        // drop the coordinates and fail the request as "Location is required".
        expect(json.body.latitude).toBe(12.9);
        expect(json.body.longitude).toBe(77.6);
    });

    it("reads the id from the header (the web shape)", async () => {
        const res = await app.request("/r", { headers: { "x-workspace-id": "ws_web" } });

        expect(await res.json()).toMatchObject({ workspaceId: "ws_web" });
    });

    it("prefers the header when a request carries both", async () => {
        const res = await post({ workspaceId: "ws_body" }, { "x-workspace-id": "ws_web" });

        expect(await res.json()).toMatchObject({ workspaceId: "ws_web" });
    });

    it("reads the id from either query key", async () => {
        expect(await (await app.request("/r?workspaceId=ws_q")).json()).toMatchObject({ workspaceId: "ws_q" });
        expect(await (await app.request("/r?w=ws_short")).json()).toMatchObject({ workspaceId: "ws_short" });
    });

    it("returns null when the request carries no workspace id", async () => {
        const res = await post({ latitude: 1, longitude: 2 });

        expect(await res.json()).toMatchObject({ workspaceId: null });
    });
});
