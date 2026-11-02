/**
 * Desktop stand-in for packages/core/src/server/services/project/index.ts: the
 * ProjectService methods the website's server pages call, each answered by the
 * API route that runs that same method. `userId` arguments are accepted for
 * signature parity; the API answers for the session's user (the same person the
 * pages pass).
 */
import { api } from "../../../../web/lib/desktop-api";

export type * from "@tusker/core/types/project";

export class ProjectService {
    static getProjectBySlug(workspaceId: string, slug: string) {
        return api<any>("/desktop/project-by-slug", { query: { workspaceId, slug } });
    }

    static getWorkspaceProjectMembers(workspaceId: string) {
        return api<any[]>("/desktop/workspace-project-members", { query: { workspaceId } });
    }

    static getWorkspaceProjectLeaders(workspaceId: string) {
        return api<any>("/desktop/workspace-project-leaders", { query: { workspaceId } });
    }

    static getWorkspaceProjects(workspaceId: string, _userId?: string) {
        return api<any[]>("/projects", { query: { workspaceId } });
    }

    static getProjectMetadata(workspaceId: string, slug: string, _userId?: string) {
        return api<any>(`/projects/slug/${encodeURIComponent(slug)}/metadata`, { query: { workspaceId } });
    }

    static getProjectDashboardData(workspaceId: string, slug: string, _userId?: string) {
        return api<any>(`/projects/${encodeURIComponent(slug)}/dashboard`, { query: { workspaceId } });
    }

    static getPermissions(workspaceId: string, projectId: string, _userId?: string) {
        return api<any>(`/projects/${projectId}/permissions`, { query: { workspaceId } });
    }

    static getMembers(projectId: string) {
        return api<any[]>(`/projects/${projectId}/members`);
    }
}
