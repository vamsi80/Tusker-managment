import { ProjectPermissions } from "../services/api";
import { Task } from "../types";

/**
 * Whether the current user may drag-move/resize a Gantt subtask bar.
 *
 * Mirrors web's canEdit gate in
 * apps/web/src/components/task/gantt/draggable-subtask-bar.tsx (lines
 * 145-175) exactly, so mobile and web agree on who can reschedule a task by
 * dragging its bar. Only subtask-level bars are ever draggable on web, so
 * callers should only invoke this for subtask rows.
 */
export function canEditGanttBar(
    task: Task,
    permissions: ProjectPermissions | null,
    currentUserId?: string | null
): boolean {
    if (!permissions || !task.projectId) return false;

    const userId = currentUserId ?? permissions.userId;
    const isAssignee = !!task.assigneeId && (
        task.assigneeId === userId ||
        task.assigneeId === permissions.workspaceMemberId
    );

    // Assignees can never edit dates, regardless of any other role they hold.
    if (isAssignee) return false;

    const isWorkspaceAdmin = permissions.isWorkspaceAdmin;
    const isProjectManager = permissions.isProjectManager;
    const isProjectCoordinator = permissions.isProjectCoordinator;
    const isProjectLead = permissions.isProjectLead;
    const isCreator = !!task.createdById && (
        task.createdById === userId ||
        task.createdById === permissions.workspaceMemberId
    );

    if (task.assigneeRole === "PROJECT_MANAGER") {
        return isWorkspaceAdmin;
    }
    if (task.assigneeRole === "LEAD") {
        return isWorkspaceAdmin || isProjectManager;
    }

    if (isWorkspaceAdmin || isProjectManager || isProjectCoordinator) return true;

    if (isProjectLead && isCreator) return true;

    return false;
}
