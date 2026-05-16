import prisma from "@/lib/db";

export class ConversationService {
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
                surname: true,
                lastActiveAt: true,
              }
            }
          }
        },
        direct_message: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: { isDeleted: false },
          select: {
            id: true,
            content: true,
            createdAt: true,
            isRead: true,
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
   */
  static async getConversationMessages(conversationId: string, limit: number = 50, cursor?: string, since?: string) {
    return prisma.direct_message.findMany({
      where: {
        conversationId,
        isDeleted: false,
        ...(since ? { createdAt: { gt: new Date(since) } } : {})
      },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: {
        createdAt: 'desc'
      },
      select: {
        id: true,
        content: true,
        senderId: true,
        createdAt: true,
        isRead: true,
        user: {
          select: {
            id: true,
            surname: true,
          }
        }
      }
    });
  }

  /**
   * Send a message
   */
  /**
   * Send a message
   */
  static async sendMessage(conversationId: string, senderId: string, content: string, workspaceId: string) {
    const { recordActivity } = await import("@/lib/audit");

    return prisma.$transaction(async (tx) => {
      // 1. Create message
      const message = await tx.direct_message.create({
        data: {
          conversationId,
          senderId,
          content
        },
        select: {
          id: true,
          content: true,
          senderId: true,
          createdAt: true,
          isRead: true,
          user: {
            select: {
              id: true,
              surname: true,
            }
          }
        }
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
    return prisma.direct_message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false
      },
      data: {
        isRead: true
      }
    });
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
