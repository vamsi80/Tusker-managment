import { apiFetch } from "./fetch-wrapper";

/**
 * Projects API Client
 * Replaces legacy Server Actions in @/data/project
 */
export const projectsClient = {
  /**
   * Get project members
   */
  getMembers: async (projectId: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/members`);
  },

  /**
   * Get project permissions
   */
  getPermissions: async (workspaceId: string, projectId: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/permissions?workspaceId=${workspaceId}`);
  },

  /**
   * Get aggregated project layout data (members + permissions)
   */
  getLayoutData: async (workspaceId: string, projectId: string): Promise<any> => {
    return apiFetch<any>(`/projects/${projectId}/layout-data?workspaceId=${workspaceId}`);
  },
};
