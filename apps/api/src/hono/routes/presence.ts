import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "@/lib/registry";
import { broadcastPresenceUpdate } from "@/lib/realtime";
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

    await getDb().user.update({
      where: { id: user.id },
      data: { lastActiveAt }
    });

    console.log(`📡 [Presence] User ${user.id} ${status} in workspace ${workspaceId}`);

    broadcastPresenceUpdate({
      workspaceId,
      userId: user.id,
      status: status === "active" ? "active" : "inactive",
      lastActiveAt: lastActiveAt.toISOString(),
    }).catch(() => {});

    return c.json({ success: true });
  });

export default app;
