import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { pusherServer } from "@/lib/pusher";
import prisma from "@/lib/db";
import { HonoVariables } from "../types";

const app = new Hono<{ Variables: HonoVariables }>()
  .post("/:workspaceId", zValidator("json", z.object({
    status: z.enum(["active", "offline"]).optional().default("active")
  })), async (c) => {
    const user = c.get("user");
    const workspaceId = c.req.param("workspaceId");
    const { status } = c.req.valid("json");
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
