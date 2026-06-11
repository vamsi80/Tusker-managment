/**
 * TaskMapper — pure in-memory transformations.
 * No DB calls. No side effects.
 */

import { ProjectRole } from "@/types/project";

export type FlattenableUser = {
  id?: string;
  surname?: string | null;
  user?: {
    id?: string;
    surname?: string | null;
  };
  workspaceMember?: {
    user?: {
      id?: string;
      surname?: string | null;
    };
  };
};

export interface InvolvedProjectMemberInput {
  id: string;
  projectRole: string;
  workspaceMember: {
    id: string;
    userId: string;
    workspaceRole: string;
    user: {
      id: string;
      name: string;
      surname: string | null;
      image: string | null;
      email: string;
    };
  };
}

export class TaskMapper {
  /**
   * Flatten nested workspaceMember.user chain into { id, surname }.
   * Handles both legacy nested shape and already-flat objects.
   */
  static flattenUser(obj: FlattenableUser | null | undefined): { id: string; surname: string } | null {
    if (!obj) return null;
    const user = obj.workspaceMember?.user || obj.user || obj;
    if (!user || !user.id) return null;
    return { id: user.id, surname: user.surname || "" };
  }

  /**
   * Map task to a flat metadata format used in list/kanban/gantt responses.
   * Mutates in-place for performance (caller owns the data).
   */
  static toFlatMetadata<T extends Record<string, unknown>>(task: T): T {
    if (!task) return task;

    const t = task as Record<string, unknown>;

    if (t.assignee) t.assignee = this.flattenUser(t.assignee as FlattenableUser);
    if (t.reviewer) t.reviewer = this.flattenUser(t.reviewer as FlattenableUser);
    if (t.createdBy) t.createdBy = this.flattenUser(t.createdBy as FlattenableUser);

    if (t._count && typeof t._count === "object") {
      t.subtaskCount = (t._count as { subTasks?: number }).subTasks;
      delete t._count;
    } else if (t.isParent && t.subtaskCount !== undefined) {
      // keep existing
    }

    if (!t.isParent) {
      delete t.subTasks;
      delete t.subtaskCount;
    } else if (t.subTasks && Array.isArray(t.subTasks)) {
      t.subTasks = t.subTasks.map((st: Record<string, unknown>) => this.toFlatMetadata(st));
    }

    return task;
  }

  /**
   * Legacy format: wraps user back into workspaceMember.user chain for
   * components still expecting the nested shape.
   */
  static toLegacyMetadata<T extends Record<string, unknown>>(task: T): T {
    if (!task) return task;

    const t = task as Record<string, unknown>;

    const toLegacy = (obj: unknown) => {
      const user = (obj as FlattenableUser)?.workspaceMember?.user || (obj as FlattenableUser)?.user || (obj as FlattenableUser);
      if (!user?.id && !user?.surname) return obj;
      const userData = { id: user.id, surname: user.surname };
      return { ...userData, workspaceMember: { user: userData } };
    };

    if (t.assignee) t.assignee = toLegacy(t.assignee);
    if (t.reviewer) t.reviewer = toLegacy(t.reviewer);
    if (t.createdBy) t.createdBy = toLegacy(t.createdBy);

    if (t._count && typeof t._count === "object") {
      t.subtaskCount = (t._count as { subTasks?: number }).subTasks;
      delete t._count;
    } else if (!t.subtaskCount && t.isParent) {
      t.subtaskCount = 0;
    }

    if (!t.isParent) {
      delete t.subTasks;
      delete t.subtaskCount;
    } else if (t.subTasks && Array.isArray(t.subTasks)) {
      t.subTasks = t.subTasks.map((st: Record<string, unknown>) => this.toLegacyMetadata(st));
    }

    return task;
  }

  /**
   * Strip parent tasks down to minimal shape for initial list view payloads.
   */
  static stripParentMetadata(result: {
    tasks?: Record<string, unknown>[];
    tasksByStatus?: Record<string, Record<string, unknown>[] | { tasks?: Record<string, unknown>[] }>;
  }) {
    if (!result) return;

    const processTask = (task: Record<string, unknown>) => {
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
        const colData = result.tasksByStatus![status];
        const colTasks = Array.isArray(colData) ? colData : colData?.tasks || [];
        colTasks.forEach(processTask);
      });
    }
  }

  /**
   * Map an involved project member to ProjectMemberUI shape.
   */
  static toInvolvedUser(m: InvolvedProjectMemberInput) {
    return {
      id: m.workspaceMember.userId,
      userId: m.workspaceMember.userId,
      projectMemberId: m.id,
      projectRole: m.projectRole as ProjectRole,
      workspaceRole: m.workspaceMember.workspaceRole,
      user: {
        id: m.workspaceMember.user.id,
        name: m.workspaceMember.user.name,
        surname: m.workspaceMember.user.surname || "",
        email: m.workspaceMember.user.email,
        image: m.workspaceMember.user.image,
      },
    };
  }
}
