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
  static async findNotifications(where: any, commentInclude: any, limit: number, offset: number) {
    const [unreadComments, recentComments] = await Promise.all([
      prisma.comment.findMany({
        where: { ...where, readBy: { none: { userId: where.userId.not } } },
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        take: 50
      }),
      prisma.comment.findMany({
        where,
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      })
    ]);
    return { unreadComments, recentComments };
  }

  /**
   * Find recent activities
   */
  static async findRecentActivities(where: any, limit: number = 10) {
    return prisma.activity.findMany({
      where,
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
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  /**
   * Find all comments for a task
   */
  static async findTaskComments(taskId: string) {
    return prisma.comment.findMany({
      where: {
        taskId,
        isDeleted: false,
        parentCommentId: null, // Only top level comments, replies are included
      },
      include: {
        user: {
          select: {
            id: true,
            surname: true,
          },
        },
        readBy: {
          select: {
            userId: true,
          },
        },
        replies: {
          where: {
            isDeleted: false,
          },
          include: {
            user: {
              select: {
                id: true,
                surname: true,
              },
            },
            readBy: {
              select: {
                userId: true,
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Find all activities for a subtask
   */
  static async findActivities(subTaskId: string) {
    return prisma.activity.findMany({
      where: {
        subTaskId,
      },
      include: {
        author: {
          select: {
            id: true,
            surname: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Mark comments as read
   */
  static async markCommentsAsRead(taskId: string, userId: string) {
    const unreadComments = await prisma.comment.findMany({
      where: {
        taskId,
        userId: { not: userId },
        readBy: { none: { userId: userId } }
      },
      select: { id: true }
    });

    if (unreadComments.length === 0) return { success: true };

    await prisma.commentRead.createMany({
      data: unreadComments.map(c => ({
        userId: userId,
        commentId: c.id
      })),
      skipDuplicates: true
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
