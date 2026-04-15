import { cache } from "react";
import { WorkspaceService } from "@/server/services/workspace.service";

/**
 * Fetches and groups all project members in a workspace.
 * Now calls WorkspaceService directly for server-side efficiency.
 */
export const getWorkspaceProjectMembersMap = cache(async (workspaceId: string) => {
    try {
        const projectUserMap = await WorkspaceService.getWorkspaceProjectMembersMap(workspaceId);
        return projectUserMap;
    } catch (error) {
        console.error("Error fetching project members map via Service:", error);
        return {};
    }
});

/**
 * Fetches all project managers in a workspace for Kanban attribution.
 */
export const getWorkspaceProjectManagersMap = cache(async (workspaceId: string) => {
    try {
        const projectLeadersMap = await WorkspaceService.getWorkspaceProjectManagersMap(workspaceId);
        return projectLeadersMap;
    } catch (error) {
        console.error("Error fetching project managers map via Service:", error);
        return {};
    }
});
