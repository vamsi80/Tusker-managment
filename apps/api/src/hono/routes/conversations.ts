import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { ConversationService } from "@/server/services/conversation/conversation.service";
import { HonoVariables } from "../types";

import { getDb } from "@/lib/registry";
import { broadcastConversationUpdate } from "@/lib/realtime";

const app = new Hono<{ Variables: HonoVariables }>()
  .get("/:workspaceId", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const conversations = await ConversationService.getUserConversations(user.id, workspaceId);
    return c.json({ success: true, data: conversations });
  })
  .get("/:workspaceId/members", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const members = await ConversationService.getWorkspaceMembers(workspaceId, user.id);
    return c.json({ success: true, data: members });
  })
  .post("/:workspaceId", zValidator("json", z.object({
    recipientId: z.string()
  })), async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { recipientId } = c.req.valid("json");
    const conversation = await ConversationService.getOrCreateDirectConversation([user.id, recipientId], workspaceId);
    return c.json({ success: true, data: conversation });
  })
  .get("/:workspaceId/:conversationId/messages", async (c) => {
    const { conversationId } = c.req.param();
    const cursor = c.req.query("cursor");
    const since = c.req.query("since");
    const limit = parseInt(c.req.query("limit") || "50");

    const messages = await ConversationService.getConversationMessages(conversationId, limit, cursor, since);
    return c.json({ success: true, data: messages });
  })
  .post("/:workspaceId/:conversationId/messages", zValidator("json", z.object({
    content: z.string().min(1)
  })), async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { content } = c.req.valid("json");
    const message = await ConversationService.sendMessage(conversationId, user.id, content, workspaceId);

    broadcastConversationUpdate({
      workspaceId,
      conversationId,
      senderId: user.id,
      content: content.substring(0, 50),
      timestamp: new Date(),
    }).catch(() => {});

    return c.json({ success: true, data: message });
  })
  .patch("/:workspaceId/:conversationId/read", async (c) => {
    const { conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    await ConversationService.markAsRead(conversationId, user.id);
    return c.json({ success: true });
  });

export default app;
