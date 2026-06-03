/**
 * TaskMapper — pure in-memory transformations.
 * No DB calls. No side effects.
 */
export class TaskMapper {
  /**
   * Flatten nested workspaceMember.user chain into { id, surname }.
   * Handles both legacy nested shape and already-flat objects.
   */
  static flattenUser(obj: any): { id: string; surname: string } | null {
    if (!obj) return null;
    const user = obj?.workspaceMember?.user || obj?.user || obj;
    if (!user?.id) return null;
    return { id: user.id, surname: user.surname || "" };
  }

  /**
   * Map task to a flat metadata format used in list/kanban/gantt responses.
   * Mutates in-place for performance (caller owns the data).
   */
  static toFlatMetadata(task: any): any {
    if (!task) return task;

    if (task.assignee) task.assignee = this.flattenUser(task.assignee);
    if (task.reviewer) task.reviewer = this.flattenUser(task.reviewer);
    if (task.createdBy) task.createdBy = this.flattenUser(task.createdBy);

    if (task._count) {
      task.subtaskCount = task._count.subTasks;
      delete task._count;
    } else if (task.isParent && task.subtaskCount !== undefined) {
      // keep existing
    }

    if (!task.isParent) {
      delete task.subTasks;
      delete task.subtaskCount;
    } else if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks = task.subTasks.map((st: any) => this.toFlatMetadata(st));
    }

    return task;
  }

  /**
   * Legacy format: wraps user back into workspaceMember.user chain for
   * components still expecting the nested shape.
   */
  static toLegacyMetadata(task: any): any {
    if (!task) return task;

    const toLegacy = (obj: any) => {
      const user = obj?.workspaceMember?.user || obj?.user || obj;
      if (!user?.id && !user?.surname) return obj;
      const userData = { id: user.id, surname: user.surname };
      return { ...userData, workspaceMember: { user: userData } };
    };

    if (task.assignee) task.assignee = toLegacy(task.assignee);
    if (task.reviewer) task.reviewer = toLegacy(task.reviewer);
    if (task.createdBy) task.createdBy = toLegacy(task.createdBy);

    if (task._count) {
      task.subtaskCount = task._count.subTasks;
      delete task._count;
    } else if (!task.subtaskCount && task.isParent) {
      task.subtaskCount = 0;
    }

    if (!task.isParent) {
      delete task.subTasks;
      delete task.subtaskCount;
    } else if (task.subTasks && Array.isArray(task.subTasks)) {
      task.subTasks = task.subTasks.map((st: any) => this.toLegacyMetadata(st));
    }

    return task;
  }

  /**
   * Strip parent tasks down to minimal shape for initial list view payloads.
   */
  static stripParentMetadata(result: any) {
    if (!result) return;

    const processTask = (task: any) => {
      this.toFlatMetadata(task);
      if (task?.isParent) {
        const allowedFields = [
          "id", "name", "taskSlug", "isParent", "parentTaskId", "projectId", "subTasks", "subtaskCount", "completedSubtaskCount",
          "createdAt", "tags", "position", "assignee", "reviewer", "description",
          "status", "startDate", "dueDate", "progress", "days"
        ];
        Object.keys(task).forEach((key) => {
          if (!allowedFields.includes(key)) delete task[key];
        });
      }
    };

    if (result.tasks && Array.isArray(result.tasks)) {
      result.tasks.forEach(processTask);
    }

    if (result.tasksByStatus) {
      Object.keys(result.tasksByStatus).forEach((status) => {
        const colData = result.tasksByStatus[status];
        const colTasks = Array.isArray(colData) ? colData : colData?.tasks || [];
        colTasks.forEach(processTask);
      });
    }
  }

  /**
   * Map an involved workspace member to ProjectMemberUI shape.
   */
  static toInvolvedUser(m: any) {
    return {
      id: m.userId,
      userId: m.userId,
      projectMemberId: m.projectMembers[0]?.id || "",
      projectRole: (m.projectMembers[0]?.projectRole as any) || "MEMBER",
      workspaceRole: m.workspaceRole,
      user: {
        id: m.user.id,
        name: m.user.name,
        surname: m.user.surname,
        image: m.user.image,
      },
    };
  }
}
