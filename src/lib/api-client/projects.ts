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
};
