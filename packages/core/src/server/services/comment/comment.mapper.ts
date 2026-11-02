import { memberChanges, memberUpdateSummary, type MemberChange } from "../../../lib/notification-copy";

const parseMeta = (raw: unknown): any => {
  if (!raw) return {};
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

/**
 * Who changed whom, and what, for a MEMBER_UPDATED notification. New rows store
 * it; older ones are rebuilt from the stored delta, the looked-up member name
 * and the actor at the front of the old body ("System updated a member's role").
 */
function memberUpdateView(dn: any, memberNames: Map<string, string>) {
  const meta = parseMeta(dn.metadata);
  const changes: MemberChange[] = Array.isArray(meta.changes) ? meta.changes : memberChanges(meta);
  const actorName: string =
    meta.actorName || String(dn.body || "").split(" updated ")[0].split(" joined ")[0].trim() || "Someone";
  if (String(dn.body || "").includes(" joined the workspace")) {
    return { actorName, subjectName: actorName, changes: [], body: dn.body as string, joined: true };
  }
  const subjectName: string = meta.subjectName || memberNames.get(dn.entityId) || "a member";
  return { actorName, subjectName, changes, body: `${actorName} updated ${memberUpdateSummary(subjectName, changes)}` };
}

export class CommentMapper {
  /**
   * Group comments and activities into notifications
   */
  /**
   * Group comments and activities into notifications
   */
  static toNotifications(comments: any[], activities: any[], limit: number, directNotifications: any[] = [], taskMap: Map<string, any> = new Map(), memberNames: Map<string, string> = new Map()) {
    const groupedMap = new Map();

    // 1. Process Task Comments
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
              name: comment.user.surname || comment.user.name,
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

    // 2. Process Activities
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
              name: rc.author.surname || rc.author.name,
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
            name: rc.author.surname || rc.author.name,
            surname: rc.author.surname,
            image: (rc.author as any).image
          }
        };
      }
    });

    // 3. Process Direct Notifications (DMs & Task/Subtask Actions)
    directNotifications.forEach((dn: any) => {
      const id = dn.id;
      if (dn.type !== "DM_MESSAGE") {
        const taskObj = taskMap.get(dn.entityId || "");
        const taskName = taskObj?.name || dn.title || "Task";
        const projectName = taskObj?.project?.name || "Workspace";
        const parentTaskName = taskObj?.parentTask?.name || null;
        const taskSlug = taskObj?.taskSlug || null;
        const memberUpdate = dn.type === "MEMBER_UPDATED" ? memberUpdateView(dn, memberNames) : null;
        const actorName: string | undefined = memberUpdate?.actorName || parseMeta(dn.metadata).actorName;

        groupedMap.set(id, {
          id: dn.id,
          taskId: dn.entityId || dn.id,
          // Not every notification is about a task — an indent approval points
          // at an indent. The client needs to know before it fetches a task.
          entityType: dn.entityType || null,
          entityId: dn.entityId || null,
          taskName,
          taskSlug,
          projectName,
          parentTaskName,
          type: dn.type,
          memberUpdate,
          latestComment: {
            content: memberUpdate?.body ?? dn.body, // John Doe created a task / updated status...
            createdAt: dn.createdAt,
            user: {
              // dn.user is the recipient; older rows have nothing better.
              name: actorName || dn.user?.surname || dn.user?.name || "System",
              surname: actorName ? "" : dn.user?.surname || "",
              image: actorName ? null : dn.user?.image || null
            }
          },
          count: 1,
          isNew: !dn.isRead
        });
      } else {
        // DM_MESSAGE: format like WhatsApp with sender's name and message preview
        let metaObj: any = {};
        if (dn.metadata) {
          try {
            metaObj = typeof dn.metadata === "string" ? JSON.parse(dn.metadata) : dn.metadata;
          } catch (_) {}
        }
        const senderName = metaObj.senderName || (dn.title !== "DM MESSAGE" ? dn.title : "Direct Message");
        const senderImage = metaObj.senderImage || null;
        const messageContent = metaObj.content || dn.body || "";

        groupedMap.set(id, {
          id: dn.id,
          taskId: dn.entityId, // Using entityId as taskId for compatibility
          taskName: "Direct Message",
          projectName: "Messages",
          type: "DM_MESSAGE",
          entityType: "CONVERSATION",
          entityId: dn.entityId,
          conversationId: dn.entityId,
          senderName,
          latestComment: {
            content: messageContent,
            createdAt: dn.createdAt,
            user: {
              name: senderName,
              surname: senderName,
              image: senderImage
            }
          },
          count: 1,
          isNew: !dn.isRead
        });
      }
    });

    const allNotifications = Array.from(groupedMap.values())
      .sort((a: any, b: any) => new Date(b.latestComment.createdAt).getTime() - new Date(a.latestComment.createdAt).getTime());

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
