export class CommentMapper {
  /**
   * Group comments and activities into notifications
   */
  static toNotifications(comments: any[], activities: any[], limit: number) {
    const groupedMap = new Map();

    comments.forEach((comment: any) => {
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
              image: (comment.user as any).image
            }
          },
          count: 0,
          isNew: false
        });
      }
      const group = groupedMap.get(comment.taskId);
      group.count++;
      if (!isRead) group.isNew = true;
    });

    activities.forEach((rc: any) => {
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
              image: (rc.author as any).image
            }
          },
          count: 0,
          isNew: false
        });
      }
      const group = groupedMap.get(rc.subTaskId);
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
            image: (rc.author as any).image
          }
        };
      }
    });

    const allNotifications = Array.from(groupedMap.values())
      .sort((a: any, b: any) => new Date(b.latestComment.createdAt).getTime() - new Date(a.latestComment.createdAt).getTime());

    return {
      unreadNotifications: allNotifications.filter(n => n.isNew),
      readNotifications: allNotifications.filter(n => !n.isNew),
      peopleCount: allNotifications.filter(n => n.isNew).length,
      totalCount: allNotifications.length,
      hasMore: comments.length >= limit
    };
  }
}
