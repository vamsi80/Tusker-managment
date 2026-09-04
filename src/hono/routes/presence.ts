import { Hono } from "hono";
import { pusherServer } from "@/lib/pusher";
import prisma from "@/lib/db";
import { HonoVariables } from "../types";

const app = new Hono<{ Variables: HonoVariables }>()
  .post("/:workspaceId", async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");

    // Heartbeats are fire-and-forget: the client aborts the in-flight one on the
    // next tick and sends the "offline" ping via sendBeacon during pagehide, so
    // a body can arrive truncated or not at all. Treat anything unreadable as a
    // plain "active" ping rather than failing the request.
    const body = await c.req.json().catch(() => null);
    const status = (body as any)?.status === "offline" ? "offline" : "active";

    if (!user) return c.json({ success: false }, 401);

    const lastActiveAt = status === "active" ? new Date() : new Date(0);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt }
    });

    console.log(`📡 [Presence] User ${user.id} ${status} in workspace ${workspaceId}`);

    // Trigger Pusher event to notify others in the workspace
    if (pusherServer) {
      await pusherServer.trigger(`team-${workspaceId}`, status === "active" ? "user-active" : "user-inactive", {
        userId: user.id,
        lastActiveAt: lastActiveAt.toISOString()
      });
    }

    return c.json({ success: true });
  });

export default app;
