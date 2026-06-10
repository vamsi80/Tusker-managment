export type TaskViewMode = "list" | "kanban" | "gantt";

/**
 * Builds the RESTful task view endpoint URL.
 *
 * Workspace level: /api/v1/workspaces/{workspaceId}/tasks/{view}
 * Project level:   /api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks/{view}
 */
export function taskViewUrl(view: TaskViewMode, workspaceId: string, projectId?: string | null) {
    return projectId
        ? `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${view}`
        : `/api/v1/workspaces/${workspaceId}/tasks/${view}`;
}
