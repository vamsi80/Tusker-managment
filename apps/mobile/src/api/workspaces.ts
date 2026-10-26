import { api, request } from "./client";
import type { CapabilityMap, WorkspaceRole } from "../lib/constants";

export type WorkspaceSummary = {
    id: string;
    name: string;
    slug?: string;
    image_url?: string | null;
    workspaceRole?: WorkspaceRole;
};

export type WorkspacePermissions = {
    isWorkspaceAdmin: boolean;
    canCreateProject: boolean;
    isProjectLead?: boolean;
    isProjectManager?: boolean;
    hasAccess: boolean;
    workspaceMemberId: string | null;
    workspaceRole: WorkspaceRole | null;
    userId: string | null;
    userSurname?: string | null;
    reportingManagerName?: string | null;
    capabilities: CapabilityMap;
    leadProjectIds?: string[];
    managedProjectIds?: string[];
    memberProjectIds?: string[];
    viewerProjectIds?: string[];
};

export type ProjectListItem = {
    id: string;
    name: string;
    slug: string;
    color: string;
    description: string | null;
    canManageMembers: boolean;
    projectRole?: string;
    createdAt: string;
    category: string | null;
    projectManager?: { id: string; surname: string | null };
};

export type Tag = { id: string; name: string; requirePurchase?: boolean; _count?: { tasks?: number } };

/** WorkspaceService.getWorkspaceLayoutData — the same payload the web shell renders from. */
export type WorkspaceLayout = {
    permissions: WorkspacePermissions;
    workspaces: { workspaces: WorkspaceSummary[]; totalCount: number };
    projects: ProjectListItem[];
    tags: Tag[];
    projectManagers: Record<string, { id: string; surname: string | null }[]>;
    unreadNotificationsCount: number;
    broadcasts: Broadcast[];
};

/**
 * A broadcast is a per-member notification row; `entityId` addresses the
 * broadcast itself (edit / delete), `id` is only this member's copy.
 */
export type Broadcast = {
    id: string;
    entityId?: string | null;
    title: string;
    body: string;
    createdAt: string;
    metadata?: { senderName?: string; departmentNames?: string[]; expiresAt?: string | null } | null;
};

export type WorkspaceMember = {
    id: string;
    userId: string;
    workspaceRole: WorkspaceRole;
    designation?: string | null;
    employeeId?: string | null;
    name?: string | null;
    surname?: string | null;
    email?: string | null;
    image?: string | null;
    phoneNumber?: string | null;
    dateOfBirth?: string | null;
    departmentId?: string | null;
    department?: { id: string; name: string } | null;
    reportToId?: string | null;
    reportTo?: any;
    isActive?: boolean;
    status?: string;
    openTaskCount?: number;
    user?: { id: string; name?: string | null; surname?: string | null; email?: string | null; image?: string | null };
    [key: string]: any;
};

export const workspacesApi = {
    list: () => api.get<{ workspaces: WorkspaceSummary[]; totalCount: number }>("/workspaces"),
    layout: (workspaceId: string) => api.get<WorkspaceLayout>(`/workspaces/${workspaceId}/layout`),
    get: (workspaceId: string) => api.get(`/workspaces/${workspaceId}`),
    create: (input: { name: string; slug: string; description: string }) => api.post("/workspaces", input),
    update: (workspaceId: string, input: Record<string, any>) => api.patch(`/workspaces/${workspaceId}`, input),
    remove: (workspaceId: string) => api.del(`/workspaces/${workspaceId}`),
    capabilities: (workspaceId: string) => api.get<CapabilityMap>(`/workspaces/${workspaceId}/capabilities`),
    unreadCount: (workspaceId: string) => api.get<number>(`/workspaces/${workspaceId}/notifications/unread-count`),

    /** Paginated roster with search/role/department filters (team page). */
    members: (
        workspaceId: string,
        params: { page?: number; limit?: number; search?: string; role?: string[]; departmentId?: string } = {},
    ) =>
        api.get<{ workspaceMembers?: WorkspaceMember[]; members?: WorkspaceMember[]; totalCount?: number; [k: string]: any }>(
            `/workspaces/${workspaceId}/members`,
            { page: params.page ?? 1, limit: params.limit ?? 1000, search: params.search, role: params.role, departmentId: params.departmentId },
        ),
    membersSlim: (workspaceId: string) => api.get<any[]>(`/workspaces/${workspaceId}/members/slim`),
    managers: (workspaceId: string) => api.get<any[]>(`/workspaces/${workspaceId}/managers`),
    invite: (workspaceId: string, input: Record<string, any>) => api.post(`/workspaces/${workspaceId}/invite`, input),
    updateMember: (workspaceId: string, memberId: string, input: Record<string, any>) =>
        request(`/workspaces/${workspaceId}/members/${memberId}`, { method: "PATCH", body: input }),
    pendingWork: (workspaceId: string, memberId: string) => api.get(`/workspaces/${workspaceId}/members/${memberId}/pending-work`),
    deactivate: (workspaceId: string, memberId: string, body: { assignments: any[]; projectRoles?: any; vacatedAssigneeTaskIds?: string[] }) =>
        request(`/workspaces/${workspaceId}/members/${memberId}/deactivate`, { method: "POST", body }),
    reactivate: (workspaceId: string, memberId: string) =>
        request(`/workspaces/${workspaceId}/members/${memberId}/reactivate`, { method: "POST", body: {} }),
    resendInvite: (workspaceId: string, memberId: string) =>
        request(`/workspaces/${workspaceId}/members/${memberId}/resend-invite`, { method: "POST", body: {} }),
    resetPassword: (workspaceId: string, memberId: string) =>
        request(`/workspaces/${workspaceId}/members/${memberId}/reset-password`, { method: "POST", body: {} }),

    birthdays: (workspaceId: string) => api.get<any[]>(`/workspaces/${workspaceId}/birthdays`),
    departments: (workspaceId: string) => api.get<{ id: string; name: string }[]>(`/workspaces/${workspaceId}/departments`),

    broadcasts: (workspaceId: string, limit = 10) => api.get<Broadcast[]>(`/workspaces/${workspaceId}/broadcasts`, { limit }),
    postBroadcast: (workspaceId: string, input: { title?: string; message: string; expiresInHours?: number | null; departmentIds?: string[] }) =>
        api.post(`/workspaces/${workspaceId}/broadcasts`, input),
    updateBroadcast: (workspaceId: string, id: string, input: { title?: string; message?: string; expiresInHours?: number | null }) =>
        api.patch(`/workspaces/${workspaceId}/broadcasts/${id}`, input),
    deleteBroadcast: (workspaceId: string, id: string) => api.del(`/workspaces/${workspaceId}/broadcasts/${id}`),

    settings: (workspaceId: string) => api.get(`/workspace/settings`, { workspaceId }),
    updateSettings: (workspaceId: string, input: Record<string, any>) => api.patch(`/workspace/settings`, input, { workspaceId }),
};
