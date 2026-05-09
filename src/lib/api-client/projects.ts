import { apiFetch } from "./fetch-wrapper";
import { 
  ProjectListItem, 
  MinimalProjectData, 
  FullProjectData 
} from "@/types/project";

/**
 * Projects API Client
 * Replaces legacy Server Actions and direct WorkspaceService calls for project context
 */
export const projectsClient = {
  /**
   * Get all projects in a workspace
   */
  getWorkspaceProjects: async (workspaceId: string, minimal = false): Promise<ProjectListItem[] | MinimalProjectData[]> => {
    const res = await apiFetch<any>(`/projects?workspaceId=${workspaceId}${minimal ? "&minimal=true" : ""}`);
    return res.data;
  },

  /**
   * Get all workspace members (for project lead/manager selection)
   */
  getWorkspaceMembers: async (workspaceId: string): Promise<any[]> => {
    const res = await apiFetch<any>(`/projects/workspace-members?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get project metadata by slug
   */
  getMetadataBySlug: async (workspaceId: string, slug: string): Promise<any> => {
    const res = await apiFetch<any>(`/projects/slug/${slug}/metadata?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get full project data
   */
  getFullData: async (projectId: string): Promise<FullProjectData> => {
    const res = await apiFetch<any>(`/projects/${projectId}`);
    return res.data;
  },

  /**
   * Get project members
   */
  getMembers: async (projectId: string): Promise<any[]> => {
    const res = await apiFetch<any>(`/projects/${projectId}/members`);
    return res.data;
  },

  /**
   * Get project permissions
   */
  getPermissions: async (workspaceId: string, projectId: string): Promise<any> => {
    const res = await apiFetch<any>(`/projects/${projectId}/permissions?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get aggregated project layout data (members + permissions)
   */
  getLayoutData: async (workspaceId: string, projectId: string): Promise<any> => {
    const res = await apiFetch<any>(`/projects/${projectId}/layout-data?workspaceId=${workspaceId}`);
    return res.data;
  },

  /**
   * Get available reviewers
   */
  getReviewers: async (projectId: string): Promise<any[]> => {
    return apiFetch<any>(`/projects/${projectId}/reviewers`);
  },

  /**
   * Create a new project
   */
  create: async (values: any): Promise<any> => {
    return apiFetch<any>("/projects", {
      method: "POST",
      body: JSON.stringify(values),
    });
  },

  /**
   * Update a project
   */
  update: async (projectId: string, values: any): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    });
  },

  /**
   * Delete a project
   */
  delete: async (projectId: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}`, {
      method: "DELETE",
    });
  },

  /**
   * Add members to a project
   */
  addMembers: async (projectId: string, memberUserIds: string[]): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ memberUserIds }),
    });
  },

  /**
   * Remove members from a project
   */
  removeMembers: async (projectId: string, memberUserIds: string[]): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/members`, {
      method: "DELETE",
      body: JSON.stringify({ memberUserIds }),
    });
  },

  /**
   * Update member role
   */
  updateMemberRole: async (projectId: string, userId: string, role: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Toggle member access
   */
  toggleMemberAccess: async (projectId: string, userId: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/members/${userId}/toggle-access`, {
      method: "POST",
    });
  },

  /**
   * Get all clients in a workspace
   */
  getWorkspaceClients: async (workspaceId: string): Promise<any[]> => {
    const res = await apiFetch<any>(`/projects/workspace-clients?workspaceId=${workspaceId}`);
    return res.data;
  },
};
