import { apiFetch } from "./fetch-wrapper";
import { TaskSchemaType, SubTaskSchemaType } from "@/lib/zodSchemas";
import { type ApiResponse } from "./types";

/**
 * Tasks API Client
 * Replaces legacy Server Actions in @/actions/task
 */
export const tasksClient = {
    /**
     * Create a base task
     */
    createTask: async (values: TaskSchemaType): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>("/tasks", {
            method: "POST",
            body: JSON.stringify(values),
        });
        
        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Task created successfully" : "Failed to create task",
            data: response.data,
        };
    },

    /**
     * Create a subtask
     */
    createSubTask: async (values: SubTaskSchemaType): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>("/tasks/subtask", {
            method: "POST",
            body: JSON.stringify(values),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Subtask created successfully" : "Failed to create subtask",
            data: response.data,
        };
    },

    /**
     * Update a task or subtask
     */
    updateTask: async (taskId: string, workspaceId: string, projectId: string, data: Partial<SubTaskSchemaType>): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...data, workspaceId, projectId }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Task updated successfully" : "Failed to update task",
            data: response.data,
        };
    },

    /**
     * Delete a task or subtask
     */
    deleteTask: async (taskId: string, workspaceId: string, projectId: string): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string }>(`/tasks/${taskId}`, {
            method: "DELETE",
            body: JSON.stringify({ workspaceId, projectId }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.message,
        };
    },

    /**
     * Update assignee specifically (Surgical)
     */
    updateAssignee: async (taskId: string, workspaceId: string, projectId: string, assigneeUserId: string | null): Promise<any> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/tasks/${taskId}/assignee`, {
            method: "PATCH",
            body: JSON.stringify({ workspaceId, projectId, assigneeUserId }),
        });

        return response;
    },

    /**
     * Expand subtasks
     */
    expandSubtasks: async (parentId: string, workspaceId: string, projectId: string, filters: any = {}): Promise<any> => {
        const query = new URLSearchParams({
            w: workspaceId,
            p: projectId,
            ...filters
        });
        return apiFetch<any>(`/tasks/${parentId}/expand?${query.toString()}`);
    },

    /**
     * Update task status (Surgical/Kanban)
     */
    updateStatus: async (taskId: string, workspaceId: string, projectId: string, newStatus: string, comment?: string, attachmentData?: any): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/tasks/${taskId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ workspaceId, projectId, newStatus, comment, attachmentData }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Status updated" : "Failed to update status",
            data: response.data,
        };
    },

    /**
     * Update task dates (Surgical/Gantt)
     */
    updateDates: async (taskId: string, workspaceId: string, projectId: string, startDate: string | Date, dueDate: string | Date): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/tasks/${taskId}/dates`, {
            method: "PATCH",
            body: JSON.stringify({ workspaceId, projectId, startDate, dueDate }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Dates updated" : "Failed to update dates",
            data: response.data,
        };
    },

    /**
     * Reorder subtasks (Bulk)
     */
    reorderTasks: async (workspaceId: string, projectId: string, subtaskIds: string[]): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string }>("/tasks/reorder", {
            method: "PATCH",
            body: JSON.stringify({ workspaceId, projectId, subtaskIds }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.message,
        };
    },

    /**
     * Add dependency
     */
    addDependency: async (taskId: string, workspaceId: string, projectId: string, dependsOnId: string): Promise<any> => {
        return apiFetch<any>(`/tasks/${taskId}/dependencies`, {
            method: "POST",
            body: JSON.stringify({ workspaceId, projectId, dependsOnId }),
        });
    },

    /**
     * Remove dependency
     */
    removeDependency: async (taskId: string, workspaceId: string, projectId: string, dependsOnId: string): Promise<any> => {
        return apiFetch<any>(`/tasks/${taskId}/dependencies/${dependsOnId}`, {
            method: "DELETE",
            body: JSON.stringify({ workspaceId, projectId }),
        });
    },

    /**
     * Bulk upload tasks and subtasks
     */
    bulkUpload: async (projectId: string, tasks: any[]): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string; data: any }>("/tasks/bulk", {
            method: "POST",
            body: JSON.stringify({ projectId, tasks }),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.message,
            data: response.data,
        };
    }
};
