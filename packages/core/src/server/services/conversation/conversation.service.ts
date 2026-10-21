import prisma from "@tusker/db";
import { AppError } from "../../../lib/errors/app-error";
import { ACTIVE_MEMBER } from "../../../lib/constants/member-status";
import { getUserDisplayName } from "../../../lib/user-display-name";

const EDIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_PAGE_SIZE = 100;

/** Trimmed message text, or a 400. Both send routes (web and mobile) land here. */
function cleanContent(content: unknown): string {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw AppError.ValidationError("Message cannot be empty");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw AppError.ValidationError(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return text;
}

const messageSelect = {
  id: true,
  content: true,
  senderId: true,
  conversationId: true,
  createdAt: true,
  updatedAt: true,
  isDeleted: true,
  deletedAt: true,
  isRead: true,
  deliveredAt: true,
  readAt: true,
  editedAt: true,
  isForwarded: true,
  forwardedFromId: true,
  user: {
    select: {
      id: true,
      name: true,
      surname: true,
    },
  },
} as const;

export class ConversationService {
  private static async requireParticipant(conversationId: string, userId: string, workspaceId?: string) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        ...(workspaceId ? { workspaceId } : {}),
        UserConversations: { some: { A: userId } },
      },
      select: {
        id: true,
        workspaceId: true,
        createdAt: true,
        UserConversations: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                image: true,
                lastActiveAt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) throw AppError.Forbidden("You do not have access to this conversation");
    return conversation;
  }

  /**
   * Get all conversations for a user in a workspace
   * Optimized with lean selects
   */
  static async getUserConversations(userId: string, workspaceId: string) {
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        UserConversations: {
          some: { A: userId }
        }
      },
      select: {
        id: true,
        lastMessageAt: true,
        type: true,
        UserConversations: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                surname: true,
                image: true,
                lastActiveAt: true,
              }
            }
          }
        },
        direct_message: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: {
            isDeleted: false,
            deletedFor: { none: { userId } },
          },
          select: {
            id: true,
            content: true,
             createdAt: true,
             updatedAt: true,
             isRead: true,
             deliveredAt: true,
             readAt: true,
             editedAt: true,
             isForwarded: true,
             senderId: true
          }
        }
      },
      // A chat that was opened but never written in has no lastMessageAt and
      // sorts after real conversations, not above them as "just now".
      orderBy: {
        lastMessageAt: { sort: 'desc', nulls: 'last' }
      }
    });

    // Map to remove current user and flatten structure. A chat whose other
    // person's account was deleted has no one left to show or message (it
    // listed as a nameless "Member"), so it is left out.
    return conversations.flatMap(conv => {
      const otherUser = conv.UserConversations.find((uc: any) => uc.user.id !== userId)?.user;
      if (!otherUser) return [];
      return [{
        id: conv.id,
        lastMessageAt: conv.lastMessageAt,
        type: conv.type,
        otherUser,
        lastMessage: conv.direct_message[0] || null
      }];
    });
  }

  /**
   * Find or create a 1-on-1 conversation. userIds[0] is the caller: the result
   * also carries `otherUser`, the same shape getUserConversations rows have, so
   * the web list can show a new chat by name straight away. UserConversations
   * stays for the mobile client, which reads it.
   */
  static async getOrCreateDirectConversation(userIds: string[], workspaceId: string) {
    if (userIds.length !== 2) throw new Error("Direct conversation requires exactly 2 users");
    const [callerId, recipientId] = userIds;
    // With both ids the same, "has both participants" matched any chat the
    // caller is in and returned someone else's conversation.
    if (!recipientId || recipientId === callerId) throw AppError.ValidationError("Choose someone else to message");

    // Both must be active members of this workspace: no chats with removed
    // members, people from other workspaces, or made-up ids.
    const members = await prisma.workspaceMember.count({
      where: { workspaceId, userId: { in: [callerId, recipientId] }, ...ACTIVE_MEMBER },
    });
    if (members !== 2) throw AppError.Forbidden("You can only message active members of this workspace");

    const select = {
      id: true,
      lastMessageAt: true,
      type: true,
      UserConversations: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              surname: true,
              image: true,
              lastActiveAt: true,
            }
          }
        }
      }
    } as const;

    const conversation =
      (await prisma.conversation.findFirst({
        where: {
          workspaceId,
          type: "direct",
          AND: userIds.map(id => ({
            UserConversations: { some: { A: id } }
          }))
        },
        select,
      })) ??
      (await prisma.conversation.create({
        data: {
          workspaceId,
          type: "direct",
          // Not "now": nothing has been said yet (see getUserConversations' order).
          lastMessageAt: null,
          UserConversations: {
            create: userIds.map(id => ({
              A: id
            }))
          }
        },
        select,
      }));

    const otherUser = conversation.UserConversations.find((uc) => uc.user.id !== callerId)?.user ?? null;
    return { ...conversation, otherUser, lastMessage: null };
  }

  /**
   * Get messages for a conversation
   * Supports delta-fetching via 'since' parameter
   * Optimized with lean selects
   *
   * Overfetches by one row to detect whether older messages remain, so
   * callers get `hasMore`/`nextCursor` back instead of having to guess —
   * without this, scroll-up pagination in a chat had no way to know it
   * should keep going and silently stopped after the first page.
   */
  static async getConversationMessages(conversationId: string, userId: string, limit: number = 50, cursor?: string, since?: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
    // Query-string input: a NaN or huge limit, or an unparseable `since`, used to
    // reach Prisma as-is and 500.
    limit = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1), MAX_PAGE_SIZE);
    const sinceDate = since ? new Date(since) : null;
    if (sinceDate && isNaN(sinceDate.getTime())) throw AppError.ValidationError("Invalid 'since' date");

    const now = new Date();
    await prisma.direct_message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        deliveredAt: null,
        isDeleted: false,
      },
      data: { deliveredAt: now, updatedAt: now },
    });

    const rows = await prisma.direct_message.findMany({
      where: {
        conversationId,
        deletedFor: { none: { userId } },
        ...(sinceDate ? { updatedAt: { gt: sinceDate } } : {})
      },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: {
        createdAt: 'desc'
      },
      select: messageSelect,
    });

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? messages[messages.length - 1].id : null;
    const otherUser = conversation.UserConversations?.find((uc: any) => uc.user?.id !== userId)?.user ?? null;

    return { messages, hasMore, nextCursor, otherUser };
  }

  /**
   * Send a message
   */
  static async sendMessage(conversationId: string, senderId: string, rawContent: unknown, workspaceId: string) {
    const { recordActivity } = await import("../../../lib/audit");
    const content = cleanContent(rawContent);
    await this.requireParticipant(conversationId, senderId, workspaceId);

    // 1. Save the message and bump the chat, together.
    const { message, recipient } = await prisma.$transaction(async (tx) => {
      const message = await tx.direct_message.create({
        data: {
          conversationId,
          senderId,
          content
        },
        select: messageSelect,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date()
        }
      });

      const other = await tx.userConversations.findFirst({
        where: { B: conversationId, A: { not: senderId } },
        select: { user: { select: { id: true, lastActiveAt: true } } },
      });
      return { message, recipient: other?.user };
    });

    // 2. Notify an offline recipient, after the commit. This used to run inside
    // the transaction: a slow Pusher or notification write held it open past
    // its timeout and failed the send. The message is saved by now, so a
    // notification failure is logged, never thrown at the sender.
    const isOffline = recipient && (!recipient.lastActiveAt ||
      Date.now() - new Date(recipient.lastActiveAt).getTime() > 120000);
    if (recipient && isOffline) {
      await recordActivity({
        userId: senderId,
        // Nickname, else full name, else email: never a bare "Member".
        userName: getUserDisplayName(message.user, "Someone"),
        workspaceId,
        action: "DM_MESSAGE" as any,
        entityType: "CONVERSATION",
        entityId: conversationId,
        newData: { content: content.substring(0, 100) },
        targetUserIds: [recipient.id],
        broadcastEvent: "conversation_update"
      }).catch((err) => console.error("[DM_NOTIFY_ERROR]", err));
    }

    return message;
  }

  /**
   * Mark messages as read
   */
  static async markAsRead(conversationId: string, userId: string) {
    await this.requireParticipant(conversationId, userId);
    const now = new Date();
    await prisma.direct_message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        deliveredAt: null,
        isDeleted: false,
      },
      data: { deliveredAt: now, updatedAt: now },
    });
    return prisma.direct_message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
        isDeleted: false,
      },
      data: {
        isRead: true,
        readAt: now,
        updatedAt: now,
      }
    });
  }

  static async editMessage(conversationId: string, messageId: string, userId: string, content: string) {
    await this.requireParticipant(conversationId, userId);
    const message = await prisma.direct_message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, senderId: true, createdAt: true, isDeleted: true },
    });

    if (!message) throw AppError.NotFound("Message not found");
    if (message.senderId !== userId) throw AppError.Forbidden("You can only edit your own messages");
    if (message.isDeleted) throw AppError.ValidationError("Deleted messages cannot be edited");
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw AppError.ValidationError("Messages can only be edited within 10 minutes");
    }

    return prisma.direct_message.update({
      where: { id: messageId },
      data: { content: cleanContent(content), editedAt: new Date() },
      select: messageSelect,
    });
  }

  static async deleteMessages(
    conversationId: string,
    messageIds: string[],
    userId: string,
    scope: "me" | "everyone",
  ) {
    await this.requireParticipant(conversationId, userId);
    const uniqueIds = [...new Set(messageIds)];
    const messages = await prisma.direct_message.findMany({
      where: { id: { in: uniqueIds }, conversationId },
      select: { id: true, senderId: true },
    });

    if (messages.length !== uniqueIds.length) throw AppError.NotFound("One or more messages were not found");

    if (scope === "me") {
      await prisma.directMessageDeletion.createMany({
        data: uniqueIds.map((messageId) => ({ messageId, userId })),
        skipDuplicates: true,
      });
      return { messageIds: uniqueIds, scope };
    }

    if (messages.some((message) => message.senderId !== userId)) {
      throw AppError.Forbidden("Delete for everyone is only available for messages you sent");
    }

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.direct_message.updateMany({
        where: { id: { in: uniqueIds }, conversationId },
        data: { content: "", isDeleted: true, deletedAt: now, updatedAt: now },
      });

      const latestVisible = await tx.direct_message.findFirst({
        where: { conversationId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        // Nothing left to show: no time, like a chat never written in.
        data: { lastMessageAt: latestVisible?.createdAt ?? null },
      });
    });

    return { messageIds: uniqueIds, scope };
  }

  static async forwardMessages(
    sourceConversationId: string,
    messageIds: string[],
    targetConversationIds: string[],
    userId: string,
  ) {
    const source = await this.requireParticipant(sourceConversationId, userId);
    const uniqueMessageIds = [...new Set(messageIds)];
    const uniqueTargetIds = [...new Set(targetConversationIds)].filter((id) => id !== sourceConversationId);
    if (uniqueTargetIds.length === 0) throw AppError.ValidationError("Choose at least one other chat");

    const targets = await prisma.conversation.findMany({
      where: {
        id: { in: uniqueTargetIds },
        workspaceId: source.workspaceId,
        UserConversations: { some: { A: userId } },
      },
      select: { id: true },
    });
    if (targets.length !== uniqueTargetIds.length) throw AppError.Forbidden("One or more target chats are unavailable");

    const messages = await prisma.direct_message.findMany({
      where: {
        id: { in: uniqueMessageIds },
        conversationId: sourceConversationId,
        isDeleted: false,
        deletedFor: { none: { userId } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, content: true },
    });
    if (messages.length !== uniqueMessageIds.length) throw AppError.NotFound("One or more messages cannot be forwarded");

    const forwardedAt = new Date();
    await prisma.$transaction(async (tx) => {
      for (const target of targets) {
        await tx.direct_message.createMany({
          data: messages.map((message) => ({
            conversationId: target.id,
            senderId: userId,
            content: message.content,
            isForwarded: true,
            forwardedFromId: message.id,
          })),
        });
        await tx.conversation.update({
          where: { id: target.id },
          data: { lastMessageAt: forwardedAt },
        });
      }
    });

    return { count: messages.length * targets.length, targetConversationIds: targets.map((target) => target.id) };
  }

  /**
   * Get workspace members for starting new conversations
   */
  static async getWorkspaceMembers(workspaceId: string, currentUserId: string) {
    return prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { not: currentUserId },
        // Removed members can't be messaged (getOrCreateDirectConversation refuses).
        ...ACTIVE_MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            image: true,
            lastActiveAt: true,
          }
        }
      }
    });
  }

  /** Who is in a conversation: live updates go to these people only. */
  static async participantIds(conversationId: string) {
    const rows = await prisma.userConversations.findMany({
      where: { B: conversationId },
      select: { A: true },
    });
    return rows.map((row) => row.A);
  }
}
