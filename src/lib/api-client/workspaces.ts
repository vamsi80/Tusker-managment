import { WorkSpaceSchemaType, UpdateWorkspaceInfoType, InviteUserSchemaType } from "@/lib/zodSchemas";
import { type ApiResponse } from "./types";
import { apiFetch } from "./fetch-wrapper";
import {
    WorkspaceLayoutData,
    type WorkspaceData,
    type WorkspaceMembersResult,
    type WorkspacesResult
} from "@/types/workspace";

export interface WorkspacesClient {
    create(values: WorkSpaceSchemaType): Promise<ApiResponse>;
    delete(workspaceId: string): Promise<ApiResponse>;
    getMembers(workspaceId: string): Promise<WorkspaceMembersResult>;
    invite(workspaceId: string, values: InviteUserSchemaType): Promise<ApiResponse>;
    removeMember(workspaceId: string, memberId: string): Promise<ApiResponse>;
    updateMember(workspaceId: string, memberId: string, values: any): Promise<ApiResponse>;
    resendInvite(workspaceId: string, memberId: string): Promise<ApiResponse>;
    getManagers(workspaceId: string): Promise<ApiResponse>;
    getAll(): Promise<WorkspacesResult>;
    getById(workspaceId: string): Promise<WorkspaceData>;
    getMetadata(workspaceId: string): Promise<any>;
    getLayoutData(workspaceId: string, timestamp?: number): Promise<WorkspaceLayoutData>;
    getUnreadCount(workspaceId: string): Promise<number>;
    getAssignmentMaps(workspaceId: string): Promise<any>;
    getTaskCreationData(workspaceId: string): Promise<any>;
    getTags(workspaceId: string): Promise<any[]>;
    update(workspaceId: string, values: Partial<UpdateWorkspaceInfoType>): Promise<ApiResponse>;
}

export const workspacesClient: WorkspacesClient = {
    /**
     * Create a new workspace
     */
    create: async (values: WorkSpaceSchemaType): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>("/workspaces", {
            method: "POST",
            body: JSON.stringify(values),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Workspace created successfully" : "Failed to create workspace",
            data: response.data,
        };
    },

    /**
     * Update workspace info
     */
    update: async (workspaceId: string, values: Partial<UpdateWorkspaceInfoType>): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}`, {
            method: "PATCH",
            body: JSON.stringify(values),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Workspace updated successfully" : "Failed to update workspace",
            data: response.data,
        };
    },

    /**
     * Delete a workspace
     */
    delete: async (workspaceId: string): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string }>(`/workspaces/${workspaceId}`, {
            method: "DELETE",
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? (response.message || "Workspace deleted") : "Failed to delete workspace",
        };
    },

    /**
     * Get workspace members
     */
    getMembers: async (workspaceId: string): Promise<WorkspaceMembersResult> => {
        const response = await apiFetch<{ success: boolean; data: WorkspaceMembersResult }>(`/workspaces/${workspaceId}/members`);
        return response.data;
    },

    /**
     * Invite a new member
     */
    invite: async (workspaceId: string, values: InviteUserSchemaType): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string; data: any }>(`/workspaces/${workspaceId}/invite`, {
            method: "POST",
            body: JSON.stringify(values),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.message || (response.success ? "Invitation sent" : "Failed to invite user"),
            data: response.data,
        };
    },

    /**
     * Remove a member from the workspace
     */
    removeMember: async (workspaceId: string, memberId: string): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; message: string }>(`/workspaces/${workspaceId}/members/${memberId}`, {
            method: "DELETE",
        });

        return {
            status: response.success ? "success" : "error",
            message: response.message || (response.success ? "Member removed" : "Failed to remove member"),
        };
    },

    /**
     * Update a member's information
     */
    updateMember: async (workspaceId: string, memberId: string, values: any): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}/members/${memberId}`, {
            method: "PATCH",
            body: JSON.stringify(values),
        });

        return {
            status: response.success ? "success" : "error",
            message: response.success ? "Member updated successfully" : "Failed to update member",
            data: response.data,
        };
    },

    /**
     * Resend an invitation email
     */
    resendInvite: async (workspaceId: string, memberId: string): Promise<ApiResponse> => {
        const response = await apiFetch<{ status?: string; message: string; success?: boolean }>(`/workspaces/${workspaceId}/members/${memberId}/resend-invite`, {
            method: "POST",
        });

        return {
            status: (response.status as any) || (response.success ? "success" : "error"),
            message: response.message || "Invitation resent",
        };
    },

    /**
     * Get all managers in a workspace
     */
    getManagers: async (workspaceId: string): Promise<ApiResponse> => {
        const response = await apiFetch<{ success: boolean; data: any[] }>(`/workspaces/${workspaceId}/managers`);
        return {
            status: response.success ? "success" : "error",
            data: response.data,
            message: response.success ? "Managers fetched" : "Failed to fetch managers",
        };
    },

    /**
     * Get all workspaces for the current user
     */
    getAll: async (): Promise<WorkspacesResult> => {
        const response = await apiFetch<{ success: boolean; data: WorkspacesResult }>("/workspaces");
        return response.data;
    },

    /**
     * Get workspace details by ID
     */
    getById: async (workspaceId: string): Promise<WorkspaceData> => {
        const response = await apiFetch<{ success: boolean; data: WorkspaceData }>(`/workspaces/${workspaceId}`);
        return response.data;
    },

    /**
     * Get lightweight workspace metadata
     */
    getMetadata: async (workspaceId: string): Promise<any> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}/metadata`);
        return response.data;
    },

    /**
     * Get unified layout data
     */
    getLayoutData: async (workspaceId: string, timestamp?: number): Promise<any> => {
        const url = `/workspaces/${workspaceId}/layout${timestamp ? `?t=${timestamp}` : ""}`;
        const response = await apiFetch<{ success: boolean; data: any }>(url);
        return response.data;
    },

    /**
     * Get unread notification count
     */
    getUnreadCount: async (workspaceId: string): Promise<number> => {
        const response = await apiFetch<{ success: boolean; data: number }>(`/workspaces/${workspaceId}/notifications/unread-count`);
        return response.data || 0;
    },

    /**
     * Get Project Assignment maps (members & leaders)
     */
    getAssignmentMaps: async (workspaceId: string): Promise<any> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}/assignment-maps`);
        return {
            projectLeaders: response.data.projectLeaders || {},
            projectAssignments: response.data.projectAssignments || {},
        };
    },

    /**
     * Get workspace task creation data
     */
    getTaskCreationData: async (workspaceId: string): Promise<any> => {
        const response = await apiFetch<{ success: boolean; data: any }>(`/workspaces/${workspaceId}/task-creation-data`);
        return response.data;
    },

    /**
     * Get workspace tags
     */
    getTags: async (workspaceId: string): Promise<any[]> => {
        const response = await apiFetch<{ success: boolean; tags: any[] }>(`/tags?workspaceId=${workspaceId}`);
        return response.tags || [];
    },

};
