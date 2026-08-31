import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { ConversationService } from "@tusker/core/server/services/conversation/conversation.service";
import { HonoVariables } from "../types";

import { pusherServer } from "@tusker/core/lib/pusher";
import prisma from "@tusker/db";

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

    // Trigger Pusher event to refresh conversation lists for all participants
    if (pusherServer) {
      await pusherServer.trigger(`team-${workspaceId}`, "conversation_update", {
        conversationId,
        senderId: user.id,
        content: content.substring(0, 50), // Send a preview
        timestamp: new Date()
      });
    }

    return c.json({ success: true, data: message });
  })
  .patch("/:workspaceId/:conversationId/read", async (c) => {
    const { conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    await ConversationService.markAsRead(conversationId, user.id);
    return c.json({ success: true });
  });

/**
 * Mobile-shaped variants.
 *
 * The web client puts the workspace in the path (/:workspaceId/...); the mobile
 * client passes it as a query on the list/create calls and omits it entirely on
 * the per-conversation ones, where it is recoverable from the row. Registered
 * after the routes above so those still match first.
 */
const conversationWorkspace = async (conversationId: string) => {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { workspaceId: true },
  });
  if (!row) return null;
  return row.workspaceId;
};

app.get("/", async (c) => {
  const user = c.get("user");
  const workspaceId = c.req.query("workspaceId");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
  if (!workspaceId) return c.json({ success: false, error: "Workspace ID is required" }, 400);

  const conversations = await ConversationService.getUserConversations(user.id, workspaceId);
  return c.json({ success: true, data: conversations, conversations });
});

app.post("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const workspaceId = body.workspaceId;
  const recipientId = body.recipientId ?? body.otherUserId;
  if (!workspaceId || !recipientId) {
    return c.json({ success: false, error: "workspaceId and recipientId are required" }, 400);
  }

  const conversation = await ConversationService.getOrCreateDirectConversation(
    [user.id, recipientId],
    workspaceId
  );
  return c.json({ success: true, data: conversation, conversation });
});

app.get("/:conversationId/messages", async (c) => {
  const { conversationId } = c.req.param();
  const cursor = c.req.query("cursor");
  const since = c.req.query("since");
  const limit = parseInt(c.req.query("limit") || "50");

  const messages = await ConversationService.getConversationMessages(conversationId, limit, cursor, since);
  return c.json({ success: true, data: messages, messages });
});

app.post("/:conversationId/messages", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

  const { conversationId } = c.req.param();
  const { content } = await c.req.json();
  if (!content) return c.json({ success: false, error: "content is required" }, 400);

  const workspaceId = await conversationWorkspace(conversationId);
  if (!workspaceId) return c.json({ success: false, error: "Conversation not found" }, 404);

  const message = await ConversationService.sendMessage(conversationId, user.id, content, workspaceId);

  if (pusherServer) {
    await pusherServer.trigger(`team-${workspaceId}`, "conversation_update", {
      conversationId,
      senderId: user.id,
      content: String(content).substring(0, 50),
      timestamp: new Date(),
    });
  }

  return c.json({ success: true, data: message, message });
});

app.post("/:conversationId/typing", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

  const { conversationId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  // Presence only — nothing is persisted, so a missing Pusher config is not an error.
  if (pusherServer) {
    const workspaceId = await conversationWorkspace(conversationId);
    if (workspaceId) {
      await pusherServer.trigger(`team-${workspaceId}`, "typing", {
        conversationId,
        userId: user.id,
        isTyping: body.isTyping !== false,
      });
    }
  }

  return c.json({ success: true });
});

export default app;
