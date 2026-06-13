import { apiFetch } from "./fetch-wrapper";
import { type ApiResponse } from "./types";
import {
  ProjectListItem,
  MinimalProjectData,
  FullProjectData
} from "@/types/project";
import type { WorkspaceMembersResult } from "@/types/workspace";

/**
 * Projects API Client
 * Replaces legacy Server Actions and direct WorkspaceService calls for project context
 */
export const projectsClient = {
  /**
   * Get all projects in a workspace
   */
  getWorkspaceProjects: async (workspaceId: string, minimal = false): Promise<ProjectListItem[] | MinimalProjectData[]> => {
    const res = await apiFetch<{ success: boolean; data: ProjectListItem[] | MinimalProjectData[] }>(`/projects?workspaceId=${workspaceId}${minimal ? "&minimal=true" : ""}`);
    return res.data;
  },

  /**
   * Get all workspace members (for project lead/manager selection)
   */
  getWorkspaceMembers: async (workspaceId: string): Promise<WorkspaceMembersResult["workspaceMembers"]> => {
    const res = await apiFetch<{ success: boolean; data: WorkspaceMembersResult["workspaceMembers"] }>(`/projects/workspace-members?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get project metadata by slug
   */
  getMetadataBySlug: async (workspaceId: string, slug: string): Promise<Record<string, unknown>> => {
    const res = await apiFetch<{ success: boolean; data: Record<string, unknown> }>(`/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get full project data
   */
  getFullData: async (projectId: string): Promise<FullProjectData> => {
    const res = await apiFetch<{ success: boolean; data: FullProjectData }>(`/projects/${projectId}`);
    return res.data;
  },

  /**
   * Get project members
   */
  getMembers: async (projectId: string): Promise<unknown[]> => {
    const res = await apiFetch<{ success: boolean; data: unknown[] }>(`/projects/${projectId}/members`);
    return res.data ?? [];
  },

  /**
   * Get project permissions
   */
  getPermissions: async (workspaceId: string, projectId: string): Promise<Record<string, unknown>> => {
    const res = await apiFetch<{ success: boolean; data: Record<string, unknown> }>(`/projects/${projectId}/permissions?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get aggregated project layout data (members + permissions)
   */
  getLayoutData: async (workspaceId: string, projectId: string): Promise<Record<string, unknown>> => {
    const res = await apiFetch<{ success: boolean; data: Record<string, unknown> }>(`/projects/${projectId}/layout-data?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get available reviewers
   */
  getReviewers: async (projectId: string): Promise<unknown[]> => {
    const res = await apiFetch<{ success: boolean; data: unknown[] }>(`/projects/${projectId}/reviewers`);
    return res.data ?? [];
  },

  /**
   * Create a new project
   */
  create: async (values: Record<string, unknown>): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  /**
   * Update a project
   */
  update: async (projectId: string, values: Record<string, unknown>): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },

  /**
   * Delete a project
   */
  delete: async (projectId: string): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}`, {
      method: "DELETE",
    });
  },

  /**
   * Add members to a project
   */
  addMembers: async (projectId: string, memberUserIds: string[]): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ memberUserIds }),
    });
  },

  /**
   * Remove members from a project
   */
  removeMembers: async (projectId: string, memberUserIds: string[]): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}/members`, {
      method: "DELETE",
      body: JSON.stringify({ memberUserIds }),
    });
  },

  /**
   * Update member role
   */
  updateMemberRole: async (projectId: string, userId: string, role: string): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Toggle member access
   */
  toggleMemberAccess: async (projectId: string, userId: string): Promise<ApiResponse> => {
    return apiFetch<ApiResponse>(`/projects/${projectId}/members/${userId}/toggle-access`, {
      method: "POST",
    });
  },

  /**
   * Get all clients in a workspace
   */
  getWorkspaceClients: async (workspaceId: string): Promise<unknown[]> => {
    const res = await apiFetch<{ success: boolean; data: unknown[] }>(`/projects/workspace-clients?workspaceId=${workspaceId}`);
    return res.data;
  },
};
