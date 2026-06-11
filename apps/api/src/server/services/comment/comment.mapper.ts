export interface DBCommentInput {
  taskId: string;
  content: string;
  createdAt: Date;
  readBy: Array<unknown>;
  task: {
    name: string;
    taskSlug: string;
    project: {
      name: string;
    };
    parentTask?: {
      name: string;
    } | null;
  };
  user: {
    id: string;
    name: string;
    surname: string;
    image?: string | null;
  };
}

export interface DBActivityInput {
  subTaskId: string;
  text: string;
  createdAt: Date;
  readBy?: Array<unknown> | null;
  subTask: {
    name: string;
    taskSlug: string;
    project: {
      name: string;
    };
    parentTask?: {
      name: string;
    } | null;
  };
  author: {
    id: string;
    name: string;
    surname: string;
    image?: string | null;
  };
}

export interface DBDirectNotificationInput {
  id: string;
  type: string;
  entityId: string | null;
  title: string | null;
  body: string | null;
  createdAt: Date;
  isRead: boolean;
  user?: {
    name: string;
    surname: string;
    image?: string | null;
  } | null;
}

export interface DBTaskMappedInput {
  name: string;
  taskSlug: string | null;
  project?: {
    name: string;
  } | null;
  parentTask?: {
    name: string;
  } | null;
}

export interface NotificationGroup {
  id?: string;
  taskId: string;
  taskName: string;
  taskSlug: string | null;
  projectName: string;
  parentTaskName: string | null;
  type: string;
  conversationId?: string | null;
  latestComment: {
    content: string;
    createdAt: Date;
    user: {
      name: string;
      surname: string;
      image: string | null;
    };
  };
  count: number;
  isNew: boolean;
}

export class CommentMapper {
  /**
   * Group comments and activities into notifications
   */
  static toNotifications(
    comments: DBCommentInput[],
    activities: DBActivityInput[],
    limit: number,
    directNotifications: DBDirectNotificationInput[] = [],
    taskMap: Map<string, DBTaskMappedInput> = new Map()
  ) {
    const groupedMap = new Map<string, NotificationGroup>();

    // 1. Process Task Comments
    comments.forEach((comment) => {
      const isRead = comment.readBy.length > 0;
      if (!groupedMap.has(comment.taskId)) {
        groupedMap.set(comment.taskId, {
          taskId: comment.taskId,
          taskName: comment.task.name,
          taskSlug: comment.task.taskSlug,
          projectName: comment.task.project.name,
          parentTaskName: comment.task.parentTask?.name || null,
          type: "comment",
          latestComment: {
            content: comment.content,
            createdAt: comment.createdAt,
            user: {
              name: comment.user.name,
              surname: comment.user.surname,
              image: comment.user.image ?? null
            }
          },
          count: 0,
          isNew: false
        });
      }
      const group = groupedMap.get(comment.taskId)!;
      group.count++;
      if (!isRead) group.isNew = true;
    });

    // 2. Process Activities
    activities.forEach((rc) => {
      const isRead = (rc.readBy || []).length > 0;
      if (!groupedMap.has(rc.subTaskId)) {
        groupedMap.set(rc.subTaskId, {
          taskId: rc.subTaskId,
          taskName: rc.subTask.name,
          taskSlug: rc.subTask.taskSlug,
          projectName: rc.subTask.project.name,
          parentTaskName: rc.subTask.parentTask?.name || null,
          type: "activity",
          latestComment: {
            content: rc.text,
            createdAt: rc.createdAt,
            user: {
              name: rc.author.name,
              surname: rc.author.surname,
              image: rc.author.image ?? null
            }
          },
          count: 0,
          isNew: false
        });
      }
      const group = groupedMap.get(rc.subTaskId)!;
      group.count++;
      if (!isRead) group.isNew = true;

      if (new Date(rc.createdAt) > new Date(group.latestComment.createdAt)) {
        group.type = "activity";
        group.latestComment = {
          content: rc.text,
          createdAt: rc.createdAt,
          user: {
            name: rc.author.name,
            surname: rc.author.surname,
            image: rc.author.image ?? null
          }
        };
      }
    });

    // 3. Process Direct Notifications (DMs & Task/Subtask Actions)
    directNotifications.forEach((dn) => {
      const id = dn.id;
      if (dn.type !== "DM_MESSAGE") {
        const taskObj = taskMap.get(dn.entityId || "");
        const taskName = taskObj?.name || dn.title || "Task";
        const projectName = taskObj?.project?.name || "Workspace";
        const parentTaskName = taskObj?.parentTask?.name || null;
        const taskSlug = taskObj?.taskSlug || null;

        groupedMap.set(id, {
          id: dn.id,
          taskId: dn.entityId || dn.id,
          taskName,
          taskSlug,
          projectName,
          parentTaskName,
          type: dn.type,
          latestComment: {
            content: dn.body || "",
            createdAt: dn.createdAt,
            user: {
              name: dn.user?.name || "System",
              surname: dn.user?.surname || "",
              image: dn.user?.image ?? null
            }
          },
          count: 1,
          isNew: !dn.isRead
        });
      } else {
        // DM_MESSAGE
        groupedMap.set(id, {
          id: dn.id,
          taskId: dn.entityId || "",
          taskName: "Direct Message",
          projectName: "Messages",
          type: "DM_MESSAGE",
          conversationId: dn.entityId,
          latestComment: {
            content: dn.body || "",
            createdAt: dn.createdAt,
            user: {
              name: dn.user?.name || "System",
              surname: dn.user?.surname || "",
              image: dn.user?.image ?? null
            }
          },
          count: 1,
          isNew: !dn.isRead
        });
      }
    });

    const allNotifications = Array.from(groupedMap.values())
      .sort((a, b) => new Date(b.latestComment.createdAt).getTime() - new Date(a.latestComment.createdAt).getTime());

    const lastItem = allNotifications[allNotifications.length - 1];
    const nextCursor = (allNotifications.length >= limit && lastItem)
      ? new Date(lastItem.latestComment.createdAt).toISOString()
      : null;

    return {
      unreadNotifications: allNotifications.filter(n => n.isNew),
      readNotifications: allNotifications.filter(n => !n.isNew),
      peopleCount: allNotifications.filter(n => n.isNew).length,
      totalCount: allNotifications.length,
      nextCursor,
      hasMore: !!nextCursor
    };
  }
}
