import prisma from "@/lib/db";

export class CommentRepository {
  /**
   * Internal helper to get comment depth
   */
  static async getCommentDepth(commentId: string): Promise<number> {
    let depth = 0;
    let currentId: string | null = commentId;

    while (currentId) {
      const record: { parentCommentId: string | null } | null = await prisma.comment.findUnique({
        where: { id: currentId },
        select: { parentCommentId: true },
      });

      if (!record?.parentCommentId) break;
      currentId = record.parentCommentId;
      depth++;

      if (depth > 100) break;
    }
    return depth;
  }

  /**
   * Find task by ID
   */
  static async findTaskById(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
  }

  /**
   * Find comment by ID
   */
  static async findCommentById(commentId: string) {
    return prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, taskId: true, userId: true, isDeleted: true },
    });
  }

  /**
   * Create a comment
   */
  static async createComment(data: {
    content: string;
    userId: string;
    taskId: string;
    parentCommentId?: string | null;
  }) {
    return prisma.comment.create({
      data: {
        content: data.content,
        userId: data.userId,
        taskId: data.taskId,
        parentCommentId: data.parentCommentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            surname: true,
          },
        },
      },
    });
  }

  /**
   * Create an activity
   */
  static async createActivity(data: {
    subTaskId: string;
    authorId: string;
    workspaceId: string;
    text: string;
    attachment?: any;
  }) {
    return prisma.activity.create({
      data,
    });
  }

  /**
   * Update a comment
   */
  static async updateComment(commentId: string, data: { content: string; isEdited: boolean; editedAt: Date }) {
    return prisma.comment.update({
      where: { id: commentId },
      data,
      include: {
        user: {
          select: {
            id: true,
            surname: true,
          },
        },
      },
    });
  }

  /**
   * Soft delete a comment
   */
  static async softDeleteComment(commentId: string) {
    return prisma.comment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Find notifications (comments)
   */
  static async findNotifications(where: any, commentInclude: any, limit: number, cursor?: string) {
    const [unreadComments, recentComments] = await Promise.all([
      prisma.comment.findMany({
        where: { ...where, readBy: { none: { userId: where.userId.not } } },
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      prisma.comment.findMany({
        where: cursor ? { ...where, createdAt: { lt: new Date(cursor) } } : where,
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        take: limit
      })
    ]);
    return { unreadComments, recentComments };
  }

  /**
   * Find recent activities
   */
  static async findRecentActivities(where: any, limit: number = 10, cursor?: string) {
    return prisma.activity.findMany({
      where: cursor ? { ...where, createdAt: { lt: new Date(cursor) } } : where,
      include: {
        author: { select: { name: true, surname: true, image: true } },
        subTask: {
          select: {
            id: true,
            name: true,
            taskSlug: true,
            project: { select: { name: true } },
            parentTask: { select: { name: true } }
          }
        },
        readBy: { where: { userId: (where.authorId as any)?.not || '' } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Find all comments for a task (Legacy - all at once)
   */
  static async findTaskComments(taskId: string) {
    return prisma.comment.findMany({
      where: {
        taskId,
        isDeleted: false,
        parentCommentId: null,
      },
      include: {
        user: { select: { id: true, surname: true } },
        readBy: { select: { userId: true } },
        replies: {
          where: { isDeleted: false },
          include: {
            user: { select: { id: true, surname: true } },
            readBy: { select: { userId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find comments for a task with cursor-based pagination
   */
  static async findTaskCommentsPaginated(taskId: string, limit: number = 10, cursor?: string) {
    return prisma.comment.findMany({
      where: {
        taskId,
        isDeleted: false,
        parentCommentId: null,
      },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        user: { select: { id: true, surname: true } },
        readBy: { select: { userId: true } },
        replies: {
          where: { isDeleted: false },
          include: {
            user: { select: { id: true, surname: true } },
            readBy: { select: { userId: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' }, // Latest first for conversational pagination
    });
  }

  /**
   * Find all activities for a subtask (Legacy - all at once)
   */
  static async findActivities(subTaskId: string) {
    return prisma.activity.findMany({
      where: { subTaskId },
      include: {
        author: { select: { id: true, surname: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find activities for a subtask with cursor-based pagination
   */
  static async findActivitiesPaginated(subTaskId: string, limit: number = 10, cursor?: string) {
    return prisma.activity.findMany({
      where: { subTaskId },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        author: { select: { id: true, surname: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Mark comments as read
   */
  static async markCommentsAsRead(taskId: string, userId: string) {
    // Mark Comments as read
    const unreadComments = await prisma.comment.findMany({
      where: {
        taskId,
        userId: { not: userId },
        readBy: { none: { userId: userId } }
      },
      select: { id: true }
    });

    if (unreadComments.length > 0) {
      await prisma.commentRead.createMany({
        data: unreadComments.map(c => ({
          userId: userId,
          commentId: c.id
        })),
        skipDuplicates: true
      });
    }

    // Mark Activities as read
    const unreadActivities = await prisma.activity.findMany({
      where: {
        subTaskId: taskId,
        authorId: { not: userId },
        readBy: { none: { userId: userId } }
      },
      select: { id: true }
    });

    if (unreadActivities.length > 0) {
      await prisma.activityRead.createMany({
        data: unreadActivities.map(a => ({
          userId: userId,
          activityId: a.id
        })),
        skipDuplicates: true
      });
    }

    // Mark Notifications as read
    await prisma.notification.updateMany({
      where: {
        userId: userId,
        OR: [
          { entityId: taskId },
          { id: taskId }
        ],
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    return { success: true };
  }

  /**
   * Mark all notifications, comments, activities as read in a workspace
   */
  static async markAllNotificationsAsRead(workspaceId: string, userId: string) {
    // 1. Mark all unread comments in workspace tasks
    const unreadComments = await prisma.comment.findMany({
      where: {
        task: { workspaceId },
        userId: { not: userId },
        readBy: { none: { userId: userId } }
      },
      select: { id: true }
    });

    if (unreadComments.length > 0) {
      await prisma.commentRead.createMany({
        data: unreadComments.map(c => ({
          userId,
          commentId: c.id
        })),
        skipDuplicates: true
      });
    }

    // 2. Mark all unread activities in workspace
    const unreadActivities = await prisma.activity.findMany({
      where: {
        workspaceId,
        authorId: { not: userId },
        readBy: { none: { userId: userId } }
      },
      select: { id: true }
    });

    if (unreadActivities.length > 0) {
      await prisma.activityRead.createMany({
        data: unreadActivities.map(a => ({
          userId,
          activityId: a.id
        })),
        skipDuplicates: true
      });
    }

    // 3. Mark database notification records as read
    await prisma.notification.updateMany({
      where: {
        workspaceId,
        userId,
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    return { success: true };
  }

  /**
   * Find user by ID
   */
  static async findUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { surname: true, name: true }
    });
  }
}
