import { Hono } from "hono";
import type { Env, HonoVariables } from "@/types";

const wsTicket = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// GET /api/v1/ws-ticket?workspaceId=xxx
// Returns a short-lived HMAC-signed ticket (30s) for the browser to authenticate
// with the tusker-ws WebSocket server without exposing the session cookie.
wsTicket.get("/", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) return c.json({ error: "workspaceId required" }, 400);

    const payload = {
        userId: user.id,
        workspaceId,
        exp: Date.now() + 30_000, // 30-second window
    };

    const payloadB64 = btoa(JSON.stringify(payload))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(c.env.TICKET_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

    return c.json({ ticket: `${payloadB64}.${sigB64}` });
});

export default wsTicket;
