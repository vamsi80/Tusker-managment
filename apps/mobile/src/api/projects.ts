import { api, request } from "./client";

export type ProjectInput = {
    name: string;
    description: string;
    color?: string;
    category: string;
    projectManagerId?: string;
    workspaceId?: string;
    memberAccess?: string[];
    tagIds?: string[];
    companyName?: string;
    registeredCompanyName?: string;
    directorName?: string;
    address?: string;
    gstNumber?: string;
    contactPerson?: string;
    phoneNumber?: string;
    clintId?: string | null;
    isInternal?: boolean;
};

export const projectsApi = {
    list: (workspaceId: string, minimal = false) => api.get<any[]>("/projects", { workspaceId, minimal: minimal || undefined }),
    get: (projectId: string) => api.get<any>(`/projects/${projectId}`),
    metadataBySlug: (workspaceId: string, slug: string) => api.get<any>(`/projects/slug/${slug}/metadata`, { workspaceId }),
    layoutData: (workspaceId: string, projectId: string) => api.get<any>(`/projects/${projectId}/layout-data`, { workspaceId }),
    dashboard: (workspaceId: string, projectId: string) => api.get<any>(`/projects/${projectId}/dashboard`, { workspaceId }),
    permissions: (workspaceId: string, projectId: string) => api.get<any>(`/projects/${projectId}/permissions`, { workspaceId }),
    members: (projectId: string) => api.get<any[]>(`/projects/${projectId}/members`),
    reviewers: (projectId: string) => api.get<any[]>(`/projects/${projectId}/reviewers`),
    workspaceMembers: (workspaceId: string) => api.get<any[]>("/projects/workspace-members", { workspaceId }),
    clients: (workspaceId: string) => api.get<any[]>("/projects/workspace-clients", { workspaceId }),
    assignmentMaps: (workspaceId: string) => api.get<any>("/projects/assignment-maps", { workspaceId }),

    create: (input: ProjectInput) => api.post("/projects", { memberAccess: [], ...input }),
    update: (projectId: string, input: Partial<ProjectInput>) =>
        request(`/projects/${projectId}`, { method: "PATCH", body: { projectId, ...input } }),
    remove: (projectId: string) => request(`/projects/${projectId}`, { method: "DELETE" }),

    addMembers: (projectId: string, memberUserIds: string[]) =>
        request(`/projects/${projectId}/members`, { method: "POST", body: { memberUserIds } }),
    removeMembers: (projectId: string, memberUserIds: string[]) =>
        request(`/projects/${projectId}/members`, { method: "DELETE", body: { memberUserIds } }),
    setMemberRole: (projectId: string, userId: string, role: string) =>
        request(`/projects/${projectId}/members/${userId}/role`, { method: "PATCH", body: { role } }),
    toggleAccess: (projectId: string, userId: string) =>
        request(`/projects/${projectId}/members/${userId}/toggle-access`, { method: "POST", body: {} }),

    settings: (workspaceId: string, projectId: string) => api.get<any>(`/projects/${projectId}/settings`, { workspaceId }),
    updateSettings: (
        workspaceId: string,
        projectId: string,
        body: { settings?: { mandatoryComment?: boolean; mandatoryAttachment?: boolean }; member?: { projectMemberId: string; permission: string; value: boolean | null } },
    ) => api.patch(`/projects/${projectId}/settings`, body, { workspaceId }),

    materials: (workspaceId: string, projectId: string) =>
        api.get<{ subtasks: any[]; materialItems: any[] }>(`/projects/${projectId}/materials`, { w: workspaceId }),
    addMaterial: (workspaceId: string, projectId: string, input: { subtaskId?: string | null; materialName: string; unit: string; quantity: number; notes?: string | null }) =>
        api.post(`/projects/${projectId}/materials`, input, { w: workspaceId }),
    updateMaterial: (workspaceId: string, projectId: string, itemId: string, input: Record<string, any>) =>
        api.patch(`/projects/${projectId}/materials/${itemId}`, input, { w: workspaceId }),
    deleteMaterial: (workspaceId: string, projectId: string, itemId: string) =>
        api.del(`/projects/${projectId}/materials/${itemId}`, undefined, { w: workspaceId }),
};
