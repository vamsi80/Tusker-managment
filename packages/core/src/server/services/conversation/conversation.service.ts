import prisma from "@tusker/db";
import { AppError } from "../../../lib/errors/app-error";

const EDIT_WINDOW_MS = 10 * 60 * 1000;

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
      select: { id: true, workspaceId: true, createdAt: true },
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
      orderBy: {
        lastMessageAt: 'desc'
      }
    });

    // Map to remove current user and flatten structure
    return conversations.map(conv => {
      const otherUser = conv.UserConversations.find((uc: any) => uc.user.id !== userId)?.user;
      return {
        id: conv.id,
        lastMessageAt: conv.lastMessageAt,
        type: conv.type,
        otherUser,
        lastMessage: conv.direct_message[0] || null
      };
    });
  }

  /**
   * Find or create a 1-on-1 conversation
   */
  static async getOrCreateDirectConversation(userIds: string[], workspaceId: string) {
    if (userIds.length !== 2) throw new Error("Direct conversation requires exactly 2 users");

    const existing = await prisma.conversation.findFirst({
      where: {
        workspaceId,
        type: "direct",
        AND: userIds.map(id => ({
          UserConversations: { some: { A: id } }
        }))
      },
      select: {
        id: true,
        lastMessageAt: true,
        type: true,
        UserConversations: {
          include: {
            user: {
              select: {
                id: true,
                surname: true,
                lastActiveAt: true,
              }
            }
          }
        }
      }
    });

    if (existing) return existing;

    return prisma.conversation.create({
      data: {
        workspaceId,
        type: "direct",
        UserConversations: {
          create: userIds.map(id => ({
            A: id
          }))
        }
      },
      select: {
        id: true,
        lastMessageAt: true,
        type: true,
        UserConversations: {
          include: {
            user: {
              select: {
                id: true,
                surname: true,
                lastActiveAt: true,
              }
            }
          }
        }
      }
    });
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
    await this.requireParticipant(conversationId, userId);

    await prisma.direct_message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        deliveredAt: null,
        isDeleted: false,
      },
      data: { deliveredAt: new Date() },
    });

    const rows = await prisma.direct_message.findMany({
      where: {
        conversationId,
        deletedFor: { none: { userId } },
        ...(since ? { updatedAt: { gt: new Date(since) } } : {})
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

    return { messages, hasMore, nextCursor };
  }

  /**
   * Send a message
   */
  /**
   * Send a message
   */
  static async sendMessage(conversationId: string, senderId: string, content: string, workspaceId: string) {
    const { recordActivity } = await import("../../../lib/audit");
    await this.requireParticipant(conversationId, senderId, workspaceId);

    return prisma.$transaction(async (tx) => {
      // 1. Create message
      const message = await tx.direct_message.create({
        data: {
          conversationId,
          senderId,
          content
        },
        select: messageSelect,
      });

      // 2. Update conversation
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date()
        }
      });

      // 3. Handle Notification if recipient is offline
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        include: {
          UserConversations: {
            where: { A: { not: senderId } },
            include: { user: { select: { id: true, lastActiveAt: true } } }
          }
        }
      });

      const recipient = conversation?.UserConversations[0]?.user;
      if (recipient) {
        const isOffline = !recipient.lastActiveAt || 
          (new Date().getTime() - new Date(recipient.lastActiveAt).getTime() > 120000);

        if (isOffline) {
          // Record activity which creates a persistent notification and broadcasts activity_log
          await recordActivity({
            userId: senderId,
            userName: message.user.surname || "Member",
            workspaceId,
            action: "DM_MESSAGE" as any,
            entityType: "CONVERSATION",
            entityId: conversationId,
            newData: { content: content.substring(0, 100) },
            targetUserIds: [recipient.id],
            broadcastEvent: "conversation_update"
          });
        }
      }

      return message;
    });
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
      data: { deliveredAt: now },
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
      data: { content: content.trim(), editedAt: new Date() },
      select: messageSelect,
    });
  }

  static async deleteMessages(
    conversationId: string,
    messageIds: string[],
    userId: string,
    scope: "me" | "everyone",
  ) {
    const conversation = await this.requireParticipant(conversationId, userId);
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
      await tx.direct_message.updateMany({
        where: { id: { in: uniqueIds }, conversationId },
        data: { content: "", isDeleted: true, deletedAt: new Date() },
      });

      const latestVisible = await tx.direct_message.findFirst({
        where: { conversationId, isDeleted: false },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: latestVisible?.createdAt ?? conversation.createdAt },
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
        userId: { not: currentUserId }
      },
      include: {
        user: {
          select: {
            id: true,
            surname: true,
            email: true,
            lastActiveAt: true,
          }
        }
      }
    });
  }
}
