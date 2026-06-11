import { apiFetch } from "./fetch-wrapper";
import { TaskSchemaType, SubTaskSchemaType } from "@tusker/shared/schemas";
import { type ApiResponse } from "./types";
import type { WorkspaceTaskType } from "@/types/task";
import type { TaskFilters } from "@/types/task-filters";

type DependencyResponse = ApiResponse;

interface BulkUploadData {
  created: number;
  failed: number;
  errors?: string[];
}

/**
 * Tasks API Client
 * Replaces legacy Server Actions in @/actions/task
 */
export const tasksClient = {
  /**
   * Create a base task
   */
  createTask: async (values: TaskSchemaType): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>("/tasks", {
      method: "POST",
      body: JSON.stringify(values),
    });

    return {
      status: response.success ? "success" : "error",
      message: response.success
        ? "Task created successfully"
        : "Failed to create task",
      data: response.data,
    };
  },

  /**
   * Create a subtask
   */
  createSubTask: async (values: SubTaskSchemaType): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>(
      "/tasks/subtask",
      {
        method: "POST",
        body: JSON.stringify(values),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success
        ? "Subtask created successfully"
        : "Failed to create subtask",
      data: response.data,
    };
  },

  /**
   * Update a task or subtask
   */
  updateTask: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    data: Partial<SubTaskSchemaType>,
  ): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>(
      `/tasks/${taskId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...data, workspaceId, projectId }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success
        ? "Task updated successfully"
        : "Failed to update task",
      data: response.data,
    };
  },

  /**
   * Delete a task or subtask
   */
  deleteTask: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; message: string }>(
      `/tasks/${taskId}`,
      {
        method: "DELETE",
        body: JSON.stringify({ workspaceId, projectId }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.message,
    };
  },

  /**
   * Update assignee specifically (Surgical)
   */
  updateAssignee: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    assigneeUserId: string | null,
    explanation?: string,
  ): Promise<{ success: boolean; data?: WorkspaceTaskType }> => {
    return apiFetch<{ success: boolean; data?: WorkspaceTaskType }>(
      `/tasks/${taskId}/assignee`,
      {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, projectId, assigneeUserId, explanation }),
      },
    );
  },

  /**
   * Expand subtasks
   */
  expandSubtasks: async (
    parentId: string,
    workspaceId: string,
    projectId: string,
    filters: Partial<TaskFilters> = {},
  ): Promise<{ success: boolean; data?: WorkspaceTaskType[] }> => {
    const query = new URLSearchParams({
      w: workspaceId,
      p: projectId,
      ...Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
      ),
    });
    return apiFetch<{ success: boolean; data?: WorkspaceTaskType[] }>(
      `/tasks/${parentId}/expand?${query.toString()}`
    );
  },

  /**
   * Update task status (Surgical/Kanban)
   */
  updateStatus: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    newStatus: string,
    comment?: string,
    attachmentData?: { url: string; name?: string } | null,
  ): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>(
      `/tasks/${taskId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({
          workspaceId,
          projectId,
          newStatus,
          comment,
          attachmentData,
        }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Status updated" : "Failed to update status",
      data: response.data,
    };
  },

  /**
   * Pin or unpin a task (Surgical/Kanban)
   */
  pinTask: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    isPinned: boolean
  ): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; message?: string }>(
      `/tasks/${taskId}/kanban/pin`,
      {
        method: "POST",
        body: JSON.stringify({ workspaceId, projectId, isPinned }),
      }
    );

    return {
      status: response.success ? "success" : "error",
      message: response.message || (isPinned ? "Task pinned" : "Task unpinned"),
    };
  },

  /**
   * Update task dates (Surgical/Gantt)
   */
  updateDates: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    startDate: string | Date,
    dueDate: string | Date,
  ): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>(
      `/tasks/${taskId}/dates`,
      {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, projectId, startDate, dueDate }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success ? "Dates updated" : "Failed to update dates",
      data: response.data,
    };
  },

  /**
   * Patch specific fields of a task (Universal)
   */
  patchTaskFields: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    data: {
      startDate?: string | Date | null;
      dueDate?: string | Date | null;
      assigneeUserId?: string | null;
      tagIds?: string[];
    },
  ): Promise<ApiResponse<WorkspaceTaskType>> => {
    const response = await apiFetch<{ success: boolean; data: WorkspaceTaskType }>(
      `/tasks/${taskId}/fields`,
      {
        method: "PATCH",
        body: JSON.stringify({ ...data, workspaceId, projectId }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.success
        ? "Task fields patched successfully"
        : "Failed to patch task fields",
      data: response.data,
    };
  },

  /**
   * Reorder subtasks (Bulk)
   */
  reorderTasks: async (
    workspaceId: string,
    projectId: string,
    subtaskIds: string[],
  ): Promise<ApiResponse> => {
    const response = await apiFetch<{ success: boolean; message: string }>(
      "/tasks/reorder",
      {
        method: "PATCH",
        body: JSON.stringify({ workspaceId, projectId, subtaskIds }),
      },
    );

    return {
      status: response.success ? "success" : "error",
      message: response.message,
    };
  },

  /**
   * Add dependencies
   */
  addDependency: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    dependsOnIds: string[],
  ): Promise<DependencyResponse> => {
    const response = await apiFetch<{ success: boolean; message?: string }>(`/tasks/${taskId}/dependencies`, {
      method: "POST",
      body: JSON.stringify({ workspaceId, projectId, dependsOnIds }),
    });
    return { status: response.success ? "success" : "error", message: response.message ?? "" };
  },

  /**
   * Remove dependency
   */
  removeDependency: async (
    taskId: string,
    workspaceId: string,
    projectId: string,
    dependsOnId: string,
  ): Promise<DependencyResponse> => {
    const response = await apiFetch<{ success: boolean; message?: string }>(`/tasks/${taskId}/dependencies/${dependsOnId}`, {
      method: "DELETE",
      body: JSON.stringify({ workspaceId, projectId }),
    });
    return { status: response.success ? "success" : "error", message: response.message ?? "" };
  },

  /**
   * Bulk upload tasks and subtasks
   */
  bulkUpload: async (
    projectId: string,
    tasks: Array<Record<string, unknown>>,
  ): Promise<ApiResponse<BulkUploadData>> => {
    const response = await apiFetch<{
      success: boolean;
      message: string;
      data: BulkUploadData;
    }>("/tasks/bulk", {
      method: "POST",
      body: JSON.stringify({ projectId, tasks }),
    });

    return {
      status: response.success ? "success" : "error",
      message: response.message,
      data: response.data,
    };
  },

  /**
   * Get a task by its slug or ID
   */
  getTaskBySlug: async (
    workspaceId: string,
    slug: string,
  ): Promise<{ success: boolean; data?: WorkspaceTaskType }> => {
    return apiFetch<{ success: boolean; data?: WorkspaceTaskType }>(
      `/tasks/slug/${slug}?w=${workspaceId}`
    );
  },
};
