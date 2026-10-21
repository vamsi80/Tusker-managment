import { Hono, type Context } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { ConversationService, type Defer } from "@tusker/core/server/services/conversation/conversation.service";
import { HonoVariables } from "../types";

import { pusherServer } from "@tusker/core/lib/pusher";
import { ACTIVE_MEMBER } from "@tusker/core/lib/constants/member-status";
import prisma from "@tusker/db";

/**
 * Work that finishes after the response (the delayed DM push, the read sync).
 * On Vercel the Next route passes next/server's after() in as Hono's
 * waitUntil, so the function stays up for it. The standalone Node server has
 * no ExecutionContext: the process outlives the request, so it just runs.
 */
const deferFor = (c: Context): Defer => (task) => {
  const guarded = task.catch((err) => console.error("[DM_BACKGROUND_ERROR]", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // no ExecutionContext (Node server): runs on its own
  }
};

/**
 * Live chat updates go only to the people in the chat, on their own `user-*`
 * channels (web and mobile both listen there). They used to go to the
 * workspace-wide `team-*` channel, so every member's browser refetched its chat
 * list and every member's phone buzzed for every message, and the payload
 * carried a preview of the private text. No content is sent: clients refetch.
 */
async function notifyParticipants(
  conversationId: string,
  workspaceId: string,
  event: "conversation_update" | "typing",
  data: Record<string, unknown> = {},
  { only, except }: { only?: string; except?: string } = {},
) {
  if (!pusherServer) return;
  try {
    const ids = only ? [only] : (await ConversationService.participantIds(conversationId)).filter((id) => id !== except);
    if (ids.length === 0) return;
    await pusherServer.trigger(ids.map((id) => `user-${id}`), event, {
      conversationId,
      workspaceId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  } catch (err) {
    console.error("[PUSHER_NOTIFY_ERROR]", err);
  }
}

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

    // ponytail: verify caller belongs to workspace before releasing employee directory
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspaceId, ...ACTIVE_MEMBER },
      select: { id: true },
    });
    if (!membership) {
      return c.json({ success: false, error: "Forbidden: Not a member of this workspace" }, 403);
    }

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
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
    const cursor = c.req.query("cursor");
    const since = c.req.query("since");
    const limit = parseInt(c.req.query("limit") || "50");

    const { messages, hasMore, nextCursor, otherUser } = await ConversationService.getConversationMessages(conversationId, user.id, limit, cursor, since);
    // `data` stays a plain array (web reads `data.data` directly); hasMore/
    // nextCursor ride alongside it for the mobile client's scroll-up paging.
    return c.json({ success: true, data: messages, hasMore, nextCursor, otherUser });
  })
  .post("/:workspaceId/:conversationId/messages", zValidator("json", z.object({
    content: z.string().trim().min(1).max(8000)
  })), async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { content } = c.req.valid("json");
    const message = await ConversationService.sendMessage(conversationId, user.id, content, workspaceId, deferFor(c));
    await notifyParticipants(conversationId, workspaceId, "conversation_update", {
      action: "new_message",
      message,
      senderId: user.id,
    });

    return c.json({ success: true, data: message });
  })
  .patch("/:workspaceId/:conversationId/read", async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    await ConversationService.markAsRead(conversationId, user.id, deferFor(c));
    await notifyParticipants(conversationId, workspaceId, "conversation_update", {
      action: "messages_read",
      readerId: user.id,
    });
    return c.json({ success: true });
  })
  .patch("/:workspaceId/:conversationId/messages/:messageId", zValidator("json", z.object({
    content: z.string().trim().min(1).max(8000),
  })), async (c) => {
    const { workspaceId, conversationId, messageId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { content } = c.req.valid("json");
    const message = await ConversationService.editMessage(conversationId, messageId, user.id, content);
    await notifyParticipants(conversationId, workspaceId, "conversation_update", {
      action: "message_edited",
      messageId,
      message,
      senderId: user.id,
    });
    return c.json({ success: true, data: message });
  })
  .post("/:workspaceId/:conversationId/messages/delete", zValidator("json", z.object({
    messageIds: z.array(z.string()).min(1).max(100),
    scope: z.enum(["me", "everyone"]),
  })), async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { messageIds, scope } = c.req.valid("json");
    const result = await ConversationService.deleteMessages(conversationId, messageIds, user.id, scope);
    // "Delete for me" is nobody else's business: only the actor's other tabs hear it.
    await notifyParticipants(
      conversationId,
      workspaceId,
      "conversation_update",
      { action: "messages_deleted", messageIds, scope, actorId: user.id },
      scope === "me" ? { only: user.id } : {},
    );
    return c.json({ success: true, data: result });
  })
  .post("/:workspaceId/:conversationId/messages/forward", zValidator("json", z.object({
    messageIds: z.array(z.string()).min(1).max(100),
    targetConversationIds: z.array(z.string()).min(1).max(20),
  })), async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const { messageIds, targetConversationIds } = c.req.valid("json");
    const result = await ConversationService.forwardMessages(conversationId, messageIds, targetConversationIds, user.id);
    await Promise.all(result.targetConversationIds.map((targetConversationId) =>
      notifyParticipants(targetConversationId, workspaceId, "conversation_update", {
        action: "messages_forwarded",
        senderId: user.id,
      })
    ));
    return c.json({ success: true, data: result });
  })
  .post("/:workspaceId/:conversationId/typing", async (c) => {
    const { workspaceId, conversationId } = c.req.param();
    const user = c.get("user");
    if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

    const body = await c.req.json().catch(() => ({}));
    if (pusherServer) {
      await notifyParticipants(conversationId, workspaceId, "typing", {
        userId: user.id,
        isTyping: body.isTyping !== false,
      }, { except: user.id });
    }
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
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);
  const { conversationId } = c.req.param();
  const cursor = c.req.query("cursor");
  const since = c.req.query("since");
  const limit = parseInt(c.req.query("limit") || "50");

  const { messages, hasMore, nextCursor, otherUser } = await ConversationService.getConversationMessages(conversationId, user.id, limit, cursor, since);
  return c.json({ success: true, data: messages, messages, hasMore, nextCursor, otherUser });
});

app.post("/:conversationId/messages", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

  const { conversationId } = c.req.param();
  // Type and length are checked in sendMessage, shared with the web route.
  const { content } = await c.req.json().catch(() => ({ content: undefined }));

  const workspaceId = await conversationWorkspace(conversationId);
  if (!workspaceId) return c.json({ success: false, error: "Conversation not found" }, 404);

  const message = await ConversationService.sendMessage(conversationId, user.id, content, workspaceId, deferFor(c));
  await notifyParticipants(conversationId, workspaceId, "conversation_update", {
    action: "new_message",
    message,
    senderId: user.id,
  });

  return c.json({ success: true, data: message, message });
});

app.post("/:conversationId/typing", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ success: false, error: "Unauthorized" }, 401);

  const { conversationId } = c.req.param();
  const body = await c.req.json().catch(() => ({}));

  // Presence only — nothing is persisted, so a missing Pusher config is not an error.
  // Only the other person hears it; the typist doesn't need their own echo.
  if (pusherServer) {
    const workspaceId = await conversationWorkspace(conversationId);
    if (workspaceId) {
      await notifyParticipants(conversationId, workspaceId, "typing", {
        userId: user.id,
        isTyping: body.isTyping !== false,
      }, { except: user.id });
    }
  }

  return c.json({ success: true });
});

export default app;
